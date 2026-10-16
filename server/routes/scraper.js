const express = require('express');
const router = express.Router();
const db = require('../db/adapter');
const scraper = require('../services/scraper');
const alertChecker = require('../services/alert-checker');
const metadataExtractor = require('../services/metadata-extractor');
const { scrapeAllLimiter, scrapeProductLimiter } = require('../middleware/rate-limiters');
const { validate } = require('../middleware/validate');
const { testScrapeSchema } = require('../schemas');

// POST auto-discover metadata from URL (POC)
router.post('/autodiscover', scrapeProductLimiter, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'Valid URL is required' });
        }

        const metadata = await metadataExtractor.fetchAndExtract(url);
        res.json({
            success: true,
            data: metadata
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// POST test scraper selector on a live URL without saving
router.post('/test', scrapeProductLimiter, validate(testScrapeSchema), async (req, res) => {
    try {
        const { url, cssSelector, usePuppeteer } = req.body;
        const price = await scraper.scrapePrice(url, cssSelector, usePuppeteer);
        res.json({
            success: true,
            price,
            url,
            cssSelector
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// POST scrape single source for a product
router.post('/product/:productId/source/:sourceIndex', scrapeProductLimiter, async (req, res) => {
    try {
        const { productId, sourceIndex } = req.params;
        const product = await db.getProductById(productId);
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        const source = product.sources[sourceIndex];
        if (!source) {
            return res.status(404).json({ error: 'Source not found' });
        }
        
        const price = await scraper.scrapePrice(source.url, source.cssSelector, source.usePuppeteer);
        const updated = await db.addPriceHistory(productId, parseInt(sourceIndex), price);

        if (updated) {
            alertChecker.checkProduct(updated).catch(e => console.error('Alert check error:', e.message));
        }
        
        res.json({ 
            price,
            source: updated.sources[sourceIndex]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST scrape all sources for a product
router.post('/product/:productId', scrapeProductLimiter, async (req, res) => {
    try {
        const product = await db.getProductById(req.params.productId);
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        const results = await scraper.scrapeAllSources(product);

        for (let i = 0; i < results.length; i++) {
            if (results[i].success) {
                await db.addPriceHistory(req.params.productId, i, results[i].price);
            }
        }
        
        const updated = await db.getProductById(req.params.productId);

        if (updated) {
            alertChecker.checkProduct(updated).catch(e => console.error('Alert check error:', e.message));
        }
        
        res.json({ 
            product: updated,
            results 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST scrape all products
router.post('/all', scrapeAllLimiter, async (req, res) => {
    try {
        const products = await db.getProducts();
        const allResults = [];
        
        let skippedCount = 0;
        for (const product of products) {
            if (product.active === false) {
                skippedCount++;
                continue;
            }

            const results = await scraper.scrapeAllSources(product);
            
            for (let i = 0; i < results.length; i++) {
                if (results[i].success) {
                    await db.addPriceHistory(product._id, i, results[i].price);
                }
            }
            
            const updated = await db.getProductById(product._id);

            if (updated) {
                alertChecker.checkProduct(updated).catch(e => console.error('Alert check error:', e.message));
            }
            
            allResults.push({
                productId: product._id,
                title: product.title,
                results
            });
        }
        
        res.json({ 
            message: `Scraped ${allResults.length} active products${skippedCount > 0 ? ` (${skippedCount} paused)` : ''}`,
            results: allResults 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
