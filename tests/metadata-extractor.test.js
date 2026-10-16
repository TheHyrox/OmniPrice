const test = require('node:test');
const assert = require('node:assert/strict');
const extractor = require('../server/services/metadata-extractor');

test('MetadataExtractor - Auto-Discovery Proof of Concept', async (t) => {

    await t.test('Case 1: Standard Schema.org JSON-LD (Shopify / Modern E-Commerce)', () => {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Shoei NXR 2 Helmet | Louis Moto</title>
                <script type="application/ld+json">
                {
                    "@context": "https://schema.org/",
                    "@type": "Product",
                    "name": "Shoei NXR 2 Helmet",
                    "image": "https://cdn.louis.de/products/shoei-nxr2.jpg",
                    "description": "Premium sport motorcycle helmet",
                    "offers": {
                        "@type": "Offer",
                        "price": "499.95",
                        "priceCurrency": "EUR",
                        "availability": "https://schema.org/InStock"
                    }
                }
                </script>
            </head>
            <body></body>
            </html>
        `;

        const result = extractor.extractFromHtml(html, 'https://www.louis-moto.fr/product/123');

        assert.equal(result.title, 'Shoei NXR 2 Helmet');
        assert.equal(result.price, 499.95);
        assert.equal(result.currency, 'EUR');
        assert.equal(result.image, 'https://cdn.louis.de/products/shoei-nxr2.jpg');
        assert.equal(result.availability, 'in_stock');
        assert.equal(result.siteName, 'Louis Moto');
        assert.equal(result.confidence, 'high');
        assert.equal(result.sourceType, 'json-ld');
    });

    await t.test('Case 2: Schema.org @graph format with AggregateOffer (WooCommerce / WordPress)', () => {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <script type="application/ld+json">
                {
                    "@context": "https://schema.org",
                    "@graph": [
                        {
                            "@type": "WebSite",
                            "name": "MotoBlouz"
                        },
                        {
                            "@type": "Product",
                            "name": "Alpinestars SMX-6 v2 Boots",
                            "image": [
                                { "url": "https://cdn.motoblouz.com/boots.png" }
                            ],
                            "offers": {
                                "@type": "AggregateOffer",
                                "lowPrice": "219.90",
                                "highPrice": "249.90",
                                "priceCurrency": "EUR",
                                "availability": "https://schema.org/OutOfStock"
                            }
                        }
                    ]
                }
                </script>
            </head>
            </html>
        `;

        const result = extractor.extractFromHtml(html, 'https://www.motoblouz.com/boots');

        assert.equal(result.title, 'Alpinestars SMX-6 v2 Boots');
        assert.equal(result.price, 219.90);
        assert.equal(result.availability, 'out_of_stock');
        assert.equal(result.image, 'https://cdn.motoblouz.com/boots.png');
        assert.equal(result.confidence, 'high');
        assert.equal(result.sourceType, 'json-ld');
    });

    await t.test('Case 3: OpenGraph & Product Meta Tags (Amazon / Social Preview)', () => {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta property="og:site_name" content="Amazon">
                <meta property="og:title" content="Sony WH-1000XM5 Wireless Headphones">
                <meta property="og:image" content="/images/sony-xm5.jpg">
                <meta property="product:price:amount" content="349.00">
                <meta property="product:price:currency" content="EUR">
                <meta property="product:availability" content="in stock">
            </head>
            </html>
        `;

        const result = extractor.extractFromHtml(html, 'https://www.amazon.fr/dp/B09XS7JWHH');

        assert.equal(result.title, 'Sony WH-1000XM5 Wireless Headphones');
        assert.equal(result.price, 349.00);
        assert.equal(result.currency, 'EUR');
        assert.equal(result.image, 'https://www.amazon.fr/images/sony-xm5.jpg'); // tests relative URL resolution
        assert.equal(result.availability, 'in_stock');
        assert.equal(result.siteName, 'Amazon');
        assert.equal(result.confidence, 'medium');
        assert.equal(result.sourceType, 'opengraph');
    });

    await t.test('Case 4: HTML5 Microdata (Legacy E-Commerce)', () => {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Dainese Leather Suit</title>
            </head>
            <body>
                <div itemscope itemtype="http://schema.org/Product">
                    <h1 itemprop="name">Dainese Laguna Seca 5</h1>
                    <img itemprop="image" src="/media/laguna.jpg" />
                    <span itemprop="price" content="999.99">999,99 €</span>
                    <meta itemprop="priceCurrency" content="EUR" />
                    <link itemprop="availability" href="http://schema.org/PreOrder" />
                </div>
            </body>
            </html>
        `;

        const result = extractor.extractFromHtml(html, 'https://www.dafy-moto.com/suit');

        assert.equal(result.title, 'Dainese Laguna Seca 5');
        assert.equal(result.price, 999.99);
        assert.equal(result.currency, 'EUR');
        assert.equal(result.image, 'https://www.dafy-moto.com/media/laguna.jpg');
        assert.equal(result.availability, 'preorder');
        assert.equal(result.sourceType, 'microdata');
    });

    await t.test('Case 5: Title suffix cleanup removes store branding', () => {
        const cleaned = extractor.cleanTitle('Cardo Packtalk Edge Duo - Louis Moto France', 'Louis Moto');
        assert.equal(cleaned, 'Cardo Packtalk Edge Duo');

        const cleaned2 = extractor.cleanTitle('AGV Pista GP RR | Motoblouz', 'Motoblouz');
        assert.equal(cleaned2, 'AGV Pista GP RR');
    });
});
