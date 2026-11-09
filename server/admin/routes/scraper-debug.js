const express = require('express');
const router = express.Router();
const scraper = require('../../services/scraper');
const metadataExtractor = require('../../services/metadata-extractor');

// POST test / diagnose scrape on any target URL
router.post('/diagnose', async (req, res) => {
    const { url, cssSelector, usePuppeteer, autoDiscover } = req.body;

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Valid URL is required' });
    }

    const startTime = Date.now();
    const result = {
        url,
        cssSelector: cssSelector || '',
        engine: usePuppeteer ? 'puppeteer' : 'auto/cheerio',
        durationMs: 0,
        success: false,
        price: null,
        metadata: null,
        error: null
    };

    try {
        if (autoDiscover) {
            result.metadata = await metadataExtractor.fetchAndExtract(url);
        }

        if (cssSelector) {
            result.price = await scraper.scrapePrice(url, cssSelector, Boolean(usePuppeteer));
            result.success = true;
        } else if (result.metadata && result.metadata.price) {
            result.price = result.metadata.price;
            result.success = true;
        }

        result.durationMs = Date.now() - startTime;
        res.json(result);
    } catch (err) {
        result.durationMs = Date.now() - startTime;
        result.error = err.message;
        res.status(400).json(result);
    }
});

module.exports = router;
