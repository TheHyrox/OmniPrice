const axios = require('axios');
const cheerio = require('cheerio');
const { assertSafeUrl } = require('../utils/ssrf');

class MetadataExtractor {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
    }

    /**
     * Resolves a URL that might be relative against a base URL.
     */
    resolveUrl(targetUrl, baseUrl) {
        if (!targetUrl || typeof targetUrl !== 'string') return null;
        try {
            return new URL(targetUrl.trim(), baseUrl).href;
        } catch (_) {
            return targetUrl.trim();
        }
    }

    /**
     * Derives a friendly store/merchant name from URL hostname or OpenGraph site_name.
     */
    extractSiteName($, url) {
        const ogSiteName = $('meta[property="og:site_name"]').attr('content') ||
                           $('meta[name="application-name"]').attr('content');
        if (ogSiteName && ogSiteName.trim().length > 0) {
            return ogSiteName.trim();
        }

        if (!url) return null;

        try {
            const parsedUrl = new URL(url);
            let hostname = parsedUrl.hostname.toLowerCase();
            hostname = hostname.replace(/^www\./, '');
            const parts = hostname.split('.');
            if (parts.length >= 2) {
                // e.g. "louis-moto.fr" -> "Louis-Moto", "amazon.com" -> "Amazon"
                const brand = parts[0];
                return brand
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            }
            return hostname;
        } catch (_) {
            return null;
        }
    }

    /**
     * Normalizes schema.org availability strings into standard keys.
     */
    normalizeAvailability(val) {
        if (!val || typeof val !== 'string') return 'unknown';
        const cleaned = val.toLowerCase().replace(/[\s_-]+/g, '');

        if (cleaned.includes('instock') || cleaned.includes('available')) {
            return 'in_stock';
        }
        if (cleaned.includes('outofstock') || cleaned.includes('soldout') || cleaned.includes('discontinued')) {
            return 'out_of_stock';
        }
        if (cleaned.includes('preorder') || cleaned.includes('backorder')) {
            return 'preorder';
        }

        return 'unknown';
    }

    /**
     * Sanitizes numerical price values.
     */
    parsePriceValue(val) {
        if (val == null) return null;
        if (typeof val === 'number') return isNaN(val) ? null : val;

        const cleaned = String(val)
            .replace(/[€$£¥\s]/g, '')
            .replace(',', '.')
            .replace(/[^\d.-]/g, '');

        const parsed = parseFloat(cleaned);
        return isNaN(parsed) || parsed <= 0 ? null : parsed;
    }

    /**
     * Searches for schema.org Product JSON-LD nodes in the document.
     */
    extractFromJsonLd($, baseUrl) {
        const scripts = $('script[type="application/ld+json"]');
        let productNode = null;

        scripts.each((_, el) => {
            if (productNode) return; // already found
            const content = $(el).contents().text();
            if (!content || !content.trim()) return;

            try {
                // Clean potential unescaped control chars
                const sanitized = content.trim();
                const json = JSON.parse(sanitized);

                const findProduct = (node) => {
                    if (!node || typeof node !== 'object') return null;

                    if (Array.isArray(node)) {
                        for (const item of node) {
                            const found = findProduct(item);
                            if (found) return found;
                        }
                        return null;
                    }

                    // Check @type or type
                    const type = node['@type'] || node.type;
                    if (type === 'Product' || type === 'IndividualProduct' || (Array.isArray(type) && type.includes('Product'))) {
                        return node;
                    }

                    // Check @graph array commonly used by WordPress / Yoast / Shopify
                    if (Array.isArray(node['@graph'])) {
                        return findProduct(node['@graph']);
                    }

                    return null;
                };

                productNode = findProduct(json);
            } catch (_) {
                // Ignore malformed JSON-LD chunks
            }
        });

        if (!productNode) return null;

        // Title
        const title = productNode.name || productNode.headline || null;

        // Image
        let image = null;
        if (productNode.image) {
            if (typeof productNode.image === 'string') {
                image = productNode.image;
            } else if (Array.isArray(productNode.image) && productNode.image.length > 0) {
                const first = productNode.image[0];
                image = typeof first === 'string' ? first : first?.url;
            } else if (productNode.image.url) {
                image = productNode.image.url;
            }
        }
        if (image) image = this.resolveUrl(image, baseUrl);

        // Offers & Price
        let price = null;
        let currency = null;
        let availability = 'unknown';

        const offers = productNode.offers;
        if (offers) {
            const offerList = Array.isArray(offers) ? offers : (offers.offers ? offers.offers : [offers]);
            if (offerList.length > 0) {
                const primaryOffer = offerList[0];
                const rawPrice = primaryOffer.price != null ? primaryOffer.price : (primaryOffer.lowPrice != null ? primaryOffer.lowPrice : primaryOffer.highPrice);
                price = this.parsePriceValue(rawPrice);
                currency = primaryOffer.priceCurrency || null;
                availability = this.normalizeAvailability(primaryOffer.availability);
            }
        }

        const description = productNode.description || null;

        return {
            title: title ? String(title).trim() : null,
            price,
            currency,
            image,
            availability,
            description: description ? String(description).trim() : null,
            sourceType: 'json-ld',
            confidence: price != null && title ? 'high' : 'medium'
        };
    }

    /**
     * Extracts product metadata from OpenGraph and Twitter meta tags.
     */
    extractFromOpenGraph($, baseUrl) {
        const title = $('meta[property="og:title"]').attr('content') ||
                      $('meta[name="twitter:title"]').attr('content') ||
                      null;

        let image = $('meta[property="og:image:secure_url"]').attr('content') ||
                    $('meta[property="og:image"]').attr('content') ||
                    $('meta[name="twitter:image"]').attr('content') ||
                    $('link[rel="image_src"]').attr('href');

        if (image) image = this.resolveUrl(image, baseUrl);

        const rawPrice = $('meta[property="product:price:amount"]').attr('content') ||
                         $('meta[property="og:price:amount"]').attr('content') ||
                         $('meta[name="twitter:data1"]').attr('content');

        const currency = $('meta[property="product:price:currency"]').attr('content') ||
                         $('meta[property="og:price:currency"]').attr('content') ||
                         null;

        const rawAvailability = $('meta[property="product:availability"]').attr('content') ||
                                $('meta[property="og:availability"]').attr('content') ||
                                null;

        const price = this.parsePriceValue(rawPrice);
        const availability = this.normalizeAvailability(rawAvailability);
        const description = $('meta[property="og:description"]').attr('content') ||
                            $('meta[name="description"]').attr('content') ||
                            null;

        if (!title && !price && !image) return null;

        return {
            title: title ? title.trim() : null,
            price,
            currency,
            image,
            availability,
            description: description ? description.trim() : null,
            sourceType: 'opengraph',
            confidence: price != null ? 'medium' : 'low'
        };
    }

    /**
     * Extracts microdata markup (itemprop="price", etc.).
     */
    extractFromMicrodata($, baseUrl) {
        const priceEl = $('[itemprop="price"]').first();
        let rawPrice = priceEl.attr('content') || priceEl.text();
        const price = this.parsePriceValue(rawPrice);

        const titleEl = $('[itemprop="name"]').first();
        const title = titleEl.attr('content') || titleEl.text();

        const imageEl = $('[itemprop="image"]').first();
        let image = imageEl.attr('src') || imageEl.attr('content') || imageEl.attr('href');
        if (image) image = this.resolveUrl(image, baseUrl);

        const availEl = $('[itemprop="availability"]').first();
        const rawAvail = availEl.attr('href') || availEl.attr('content') || availEl.text();

        if (!price && !title && !image) return null;

        return {
            title: title ? title.trim() : null,
            price,
            currency: $('[itemprop="priceCurrency"]').attr('content') || null,
            image,
            availability: this.normalizeAvailability(rawAvail),
            description: $('[itemprop="description"]').text() || null,
            sourceType: 'microdata',
            confidence: price != null ? 'medium' : 'low'
        };
    }

    /**
     * Main extraction routine from raw HTML string and optional source URL.
     */
    extractFromHtml(html, url = '') {
        if (!html || typeof html !== 'string') {
            return {
                title: null,
                price: null,
                currency: null,
                image: null,
                availability: 'unknown',
                siteName: this.extractSiteName(null, url),
                description: null,
                confidence: 'none',
                sourceType: 'none'
            };
        }

        const $ = cheerio.load(html);
        const siteName = this.extractSiteName($, url);

        // 1. Primary: JSON-LD (most structured and reliable)
        const jsonLdResult = this.extractFromJsonLd($, url);

        // 2. Secondary: OpenGraph & Twitter tags
        const ogResult = this.extractFromOpenGraph($, url);

        // 3. Tertiary: HTML5 Microdata
        const microdataResult = this.extractFromMicrodata($, url);

        // Synthesize results by taking highest confidence fields
        const title = jsonLdResult?.title || ogResult?.title || microdataResult?.title || $('title').text().trim() || null;
        const price = jsonLdResult?.price ?? ogResult?.price ?? microdataResult?.price ?? null;
        const currency = jsonLdResult?.currency || ogResult?.currency || microdataResult?.currency || null;
        const image = jsonLdResult?.image || ogResult?.image || microdataResult?.image || null;
        const availability = (jsonLdResult?.availability !== 'unknown' ? jsonLdResult?.availability : null) ||
                             (ogResult?.availability !== 'unknown' ? ogResult?.availability : null) ||
                             (microdataResult?.availability !== 'unknown' ? microdataResult?.availability : null) ||
                             'unknown';
        const description = jsonLdResult?.description || ogResult?.description || microdataResult?.description || null;

        let confidence = 'none';
        let sourceType = 'none';

        if (jsonLdResult?.price != null && jsonLdResult?.title) {
            confidence = 'high';
            sourceType = 'json-ld';
        } else if (ogResult?.price != null || microdataResult?.price != null) {
            confidence = 'medium';
            sourceType = ogResult?.price != null ? 'opengraph' : 'microdata';
        } else if (title) {
            confidence = 'low';
            sourceType = 'fallback';
        }

        return {
            title: title ? this.cleanTitle(title, siteName) : null,
            price,
            currency: currency ? currency.toUpperCase() : 'EUR',
            image,
            availability,
            siteName,
            description,
            confidence,
            sourceType
        };
    }

    /**
     * Cleans titles by removing common store suffix noise (e.g., "Shoei NXR 2 Helmet | Louis Moto").
     */
    cleanTitle(rawTitle, siteName) {
        if (!rawTitle) return '';
        let cleaned = rawTitle.replace(/\s+/g, ' ').trim();

        if (siteName) {
            // Strip suffix like " - StoreName" or " | StoreName"
            const escaped = siteName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            cleaned = cleaned.replace(new RegExp(`\\s*[-|–—:]\\s*${escaped}.*$`, 'i'), '');
        }

        return cleaned.trim();
    }

    /**
     * Fetches a webpage and runs metadata auto-discovery.
     */
    async fetchAndExtract(url) {
        if (!url || typeof url !== 'string') {
            throw new Error('Valid URL is required');
        }

        await assertSafeUrl(url);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': this.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            timeout: 15000,
            maxRedirects: 5,
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024
        });

        return this.extractFromHtml(response.data, url);
    }
}

module.exports = new MetadataExtractor();
