const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeUrl, isSafeUrl, isPrivateIPv4, isPrivateIPv6 } = require('../server/utils/ssrf');

describe('SSRF Protection Utility', () => {
    test('identifies private IPv4 addresses correctly', () => {
        assert.equal(isPrivateIPv4('127.0.0.1'), true);
        assert.equal(isPrivateIPv4('10.0.0.1'), true);
        assert.equal(isPrivateIPv4('172.16.0.1'), true);
        assert.equal(isPrivateIPv4('172.20.0.5'), true);
        assert.equal(isPrivateIPv4('172.31.255.255'), true);
        assert.equal(isPrivateIPv4('192.168.1.1'), true);
        assert.equal(isPrivateIPv4('169.254.169.254'), true);
        assert.equal(isPrivateIPv4('0.0.0.0'), true);
        assert.equal(isPrivateIPv4('255.255.255.255'), true);

        // Public IPs
        assert.equal(isPrivateIPv4('8.8.8.8'), false);
        assert.equal(isPrivateIPv4('1.1.1.1'), false);
        assert.equal(isPrivateIPv4('104.244.42.1'), false);
    });

    test('identifies private IPv6 addresses correctly', () => {
        assert.equal(isPrivateIPv6('::1'), true);
        assert.equal(isPrivateIPv6('::'), true);
        assert.equal(isPrivateIPv6('fc00::1'), true);
        assert.equal(isPrivateIPv6('fe80::1'), true);
        assert.equal(isPrivateIPv6('::ffff:127.0.0.1'), true);
        assert.equal(isPrivateIPv6('::ffff:192.168.1.1'), true);

        // Public IPv6
        assert.equal(isPrivateIPv6('2606:4700:4700::1111'), false);
    });

    test('rejects unsupported protocols', async () => {
        await assert.rejects(
            assertSafeUrl('file:///etc/passwd'),
            /Unsupported protocol "file:"/
        );
        await assert.rejects(
            assertSafeUrl('ftp://ftp.example.com'),
            /Unsupported protocol "ftp:"/
        );
        await assert.rejects(
            assertSafeUrl('gopher://127.0.0.1:70'),
            /Unsupported protocol "gopher:"/
        );
    });

    test('blocks loopback and private IP literals', async () => {
        await assert.rejects(
            assertSafeUrl('http://127.0.0.1:3005'),
            /Access to private\/local IP address/
        );
        await assert.rejects(
            assertSafeUrl('http://10.0.0.1'),
            /Access to private\/local IP address/
        );
        await assert.rejects(
            assertSafeUrl('http://192.168.1.1/admin'),
            /Access to private\/local IP address/
        );
        await assert.rejects(
            assertSafeUrl('http://169.254.169.254/latest/meta-data'),
            /Access to private\/local IP address/
        );
    });

    test('blocks local hostnames directly', async () => {
        await assert.rejects(
            assertSafeUrl('http://localhost:3005'),
            /Access to local or private hostname "localhost"/
        );
        await assert.rejects(
            assertSafeUrl('http://omniprice-db:27017'),
            /Access to local or private hostname "omniprice-db"/
        );
        await assert.rejects(
            assertSafeUrl('http://myserver.local'),
            /Access to local or private hostname/
        );
        await assert.rejects(
            assertSafeUrl('http://service.internal'),
            /Access to local or private hostname/
        );
    });

    test('allows safe public URLs', async () => {
        const safe = await isSafeUrl('https://example.com');
        assert.equal(safe, true);
    });

    test('allows private network when ALLOW_PRIVATE_NETWORK=true is set', async () => {
        process.env.ALLOW_PRIVATE_NETWORK = 'true';
        try {
            const parsed = await assertSafeUrl('http://127.0.0.1:3005/test');
            assert.equal(parsed.hostname, '127.0.0.1');
        } finally {
            delete process.env.ALLOW_PRIVATE_NETWORK;
        }
    });
});
