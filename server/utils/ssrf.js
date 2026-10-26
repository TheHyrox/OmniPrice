const dns = require('dns').promises;
const net = require('net');

/**
 * Checks whether an IPv4 address belongs to a reserved, loopback,
 * private (RFC 1918), or link-local/cloud-metadata subnet.
 * @param {string} ip
 * @returns {boolean} true if IP is private/internal
 */
function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(p => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        return true; // Malformed IPv4 is treated as unsafe
    }

    const [b0, b1, b2, b3] = parts;

    // 0.0.0.0/8 - Current network
    if (b0 === 0) return true;

    // 10.0.0.0/8 - Private-Use (RFC 1918)
    if (b0 === 10) return true;

    // 127.0.0.0/8 - Loopback
    if (b0 === 127) return true;

    // 169.254.0.0/16 - Link-Local / Cloud Metadata (AWS, GCP, Azure, etc.)
    if (b0 === 169 && b1 === 254) return true;

    // 172.16.0.0/12 - Private-Use (RFC 1918, covers 172.16.0.0 - 172.31.255.255, including Docker bridges)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

    // 192.168.0.0/16 - Private-Use (RFC 1918)
    if (b0 === 192 && b1 === 168) return true;

    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 - Documentation / TEST-NET
    if (b0 === 192 && b1 === 0 && b2 === 2) return true;
    if (b0 === 198 && b1 === 51 && b2 === 100) return true;
    if (b0 === 203 && b1 === 0 && b2 === 113) return true;

    // 224.0.0.0/4 - Multicast
    if (b0 >= 224 && b0 <= 239) return true;

    // 240.0.0.0/4 - Reserved
    if (b0 >= 240) return true;

    // 255.255.255.255 - Broadcast
    if (b0 === 255 && b1 === 255 && b2 === 255 && b3 === 255) return true;

    return false;
}

/**
 * Checks whether an IPv6 address is loopback, unique-local, link-local, or multicast.
 * @param {string} ip
 * @returns {boolean} true if IP is private/internal
 */
function isPrivateIPv6(ip) {
    const normalized = ip.toLowerCase();

    // Check for IPv4-mapped IPv6 address (::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (normalized.startsWith('::ffff:')) {
        const potentialIPv4 = normalized.slice(7);
        if (net.isIPv4(potentialIPv4)) {
            return isPrivateIPv4(potentialIPv4);
        }
    }

    // ::1 Loopback
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

    // :: Unspecified
    if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

    // fc00::/7 - Unique Local Address (ULA)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

    // fe80::/10 - Link-Local Unicast
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || 
        normalized.startsWith('fea') || normalized.startsWith('feb')) return true;

    // ff00::/8 - Multicast
    if (normalized.startsWith('ff')) return true;

    return false;
}

/**
 * Validates that an IP address (v4 or v6) is public and safe to request.
 * @param {string} ip
 * @returns {boolean} true if safe/public
 */
function isPublicIp(ip) {
    const family = net.isIP(ip);
    if (family === 4) {
        return !isPrivateIPv4(ip);
    }
    if (family === 6) {
        return !isPrivateIPv6(ip);
    }
    return false;
}

/**
 * Asserts that a target URL is safe against SSRF attacks.
 * Verifies protocol (http/https only) and ensures resolved DNS addresses
 * do not point to internal, loopback, private, or cloud-metadata IPs.
 *
 * Can be overridden with ALLOW_PRIVATE_NETWORK=true in environment variables
 * for local development/testing.
 *
 * @param {string} urlString
 * @returns {Promise<URL>} Parsed URL object if safe
 * @throws {Error} If URL is invalid, unsafe, or points to private network
 */
async function assertSafeUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') {
        throw new Error('Invalid URL provided');
    }

    let parsed;
    try {
        parsed = new URL(urlString.trim());
    } catch (_) {
        throw new Error(`Malformed URL: ${urlString}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`);
    }

    // Allow bypassing private network protection if explicitly configured (e.g. for testing)
    if (process.env.ALLOW_PRIVATE_NETWORK === 'true') {
        return parsed;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block obvious local hostnames
    if (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname === 'omniprice-db' ||
        hostname === 'host.docker.internal'
    ) {
        throw new Error(`Access to local or private hostname "${hostname}" is blocked for security`);
    }

    // If hostname is directly an IP address
    if (net.isIP(hostname)) {
        if (!isPublicIp(hostname)) {
            throw new Error(`Access to private/local IP address "${hostname}" is blocked for security`);
        }
        return parsed;
    }

    // Resolve domain through DNS to check destination IPs
    let lookupResults = [];
    try {
        lookupResults = await dns.lookup(hostname, { all: true });
    } catch (err) {
        throw new Error(`DNS resolution failed for hostname "${hostname}": ${err.message}`);
    }

    if (!lookupResults || lookupResults.length === 0) {
        throw new Error(`No DNS records found for hostname "${hostname}"`);
    }

    for (const record of lookupResults) {
        if (!isPublicIp(record.address)) {
            throw new Error(`Hostname "${hostname}" resolves to private/local IP "${record.address}", which is blocked for security`);
        }
    }

    return parsed;
}

/**
 * Non-throwing safe URL check.
 * @param {string} urlString
 * @returns {Promise<boolean>}
 */
async function isSafeUrl(urlString) {
    try {
        await assertSafeUrl(urlString);
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    assertSafeUrl,
    isSafeUrl,
    isPrivateIPv4,
    isPrivateIPv6,
    isPublicIp
};
