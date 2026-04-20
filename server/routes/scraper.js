const express = require('express');
const router = express.Router();
const db = require('../db/adapter');
const scraper = require('../services/scraper');

// POST scrape single source for a product
router.post('/product/:productId/source/:sourceIndex', async (req, res) => {
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
        
        res.json({ 
            price,
            source: updated.sources[sourceIndex]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST scrape all sources for a product
router.post('/product/:productId', async (req, res) => {
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
        
        res.json({ 
            product: updated,
            results 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST scrape all products
router.post('/all', async (req, res) => {
    try {
        const products = await db.getProducts();
        const allResults = [];
        
        for (const product of products) {
            const results = await scraper.scrapeAllSources(product);
            
            for (let i = 0; i < results.length; i++) {
                if (results[i].success) {
                    await db.addPriceHistory(product._id, i, results[i].price);
                }
            }
            
            const updated = await db.getProductById(product._id);
            
            allResults.push({
                productId: product._id,
                title: product.title,
                results
            });
        }
        
        res.json({ 
            message: `Scraped ${products.length} products`,
            results: allResults 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
