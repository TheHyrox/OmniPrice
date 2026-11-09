const express = require('express');
const router = express.Router();
const db = require('../../db/adapter');
const scraper = require('../../services/scraper');
const alertChecker = require('../../services/alert-checker');
const logger = require('../../utils/logger');

function categorizeError(errMsg = '') {
    const msg = String(errMsg).toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('navigation timeout')) {
        return { category: 'Timeout', badge: 'warning' };
    }
    if (msg.includes('403') || msg.includes('blocked') || msg.includes('cloudflare') || msg.includes('captcha') || msg.includes('access denied')) {
        return { category: 'Anti-Bot / Blocked', badge: 'danger' };
    }
    if (msg.includes('selector') || msg.includes('price not found') || msg.includes('could not find price') || msg.includes('element')) {
        return { category: 'Selector Miss', badge: 'info' };
    }
    if (msg.includes('ssrf') || msg.includes('private network') || msg.includes('enotfound') || msg.includes('econnrefused')) {
        return { category: 'Network / SSRF', badge: 'secondary' };
    }
    return { category: 'Scrape Failed', badge: 'danger' };
}

// GET all active scraper issues and broken sources
router.get('/', async (req, res) => {
    try {
        const products = await db.getProducts({ includeHistory: false });
        const issues = [];
        const byStore = {};
        const byCategory = {};

        for (const product of products) {
            if (!Array.isArray(product.sources)) continue;

            product.sources.forEach((source, sourceIndex) => {
                if (source.lastStatus === 'error' || (source.lastError && !source.price)) {
                    const errorAnalysis = categorizeError(source.lastError);
                    
                    const issueItem = {
                        productId: product._id,
                        productTitle: product.title,
                        productImage: product.imageUrl,
                        productActive: product.active !== false && !product.archived,
                        sourceIndex,
                        siteName: source.siteName || 'Unknown Store',
                        url: source.url,
                        cssSelector: source.cssSelector,
                        usePuppeteer: Boolean(source.usePuppeteer),
                        lastScraped: source.lastScraped,
                        lastError: source.lastError || 'Unknown failure',
                        category: errorAnalysis.category,
                        badge: errorAnalysis.badge
                    };

                    issues.push(issueItem);

                    // Aggregations
                    const storeKey = issueItem.siteName;
                    byStore[storeKey] = (byStore[storeKey] || 0) + 1;

                    const catKey = errorAnalysis.category;
                    byCategory[catKey] = (byCategory[catKey] || 0) + 1;
                }
            });
        }

        // Sort issues by most recently scraped/failed
        issues.sort((a, b) => new Date(b.lastScraped || 0) - new Date(a.lastScraped || 0));

        res.json({
            timestamp: new Date().toISOString(),
            totalIssues: issues.length,
            byStore,
            byCategory,
            issues
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST retry scrape for a specific product and source
router.post('/retry', async (req, res) => {
    const { productId, sourceIndex } = req.body;
    if (!productId || sourceIndex === undefined) {
        return res.status(400).json({ error: 'productId and sourceIndex are required' });
    }

    try {
        const product = await db.getProductById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const idx = parseInt(sourceIndex, 10);
        const source = product.sources && product.sources[idx];
        if (!source) {
            return res.status(404).json({ error: 'Source not found at specified index' });
        }

        console.log(`[Admin] Manual retry initiated for "${product.title}" (${source.siteName})...`);

        try {
            const price = await scraper.scrapePrice(source.url, source.cssSelector, source.usePuppeteer);
            const updated = await db.addPriceHistory(productId, idx, price);

            if (updated) {
                alertChecker.checkProduct(updated).catch(e => console.error('[Alert] Check error on retry:', e.message));
            }

            console.log(`[Admin] Manual retry successful for "${product.title}" (${source.siteName}): €${price}`);

            res.json({
                success: true,
                price,
                source: updated ? updated.sources[idx] : null,
                message: `Successfully scraped price: €${price}`
            });
        } catch (scrapeErr) {
            await db.recordScrapeError(productId, idx, scrapeErr.message).catch(() => {});
            console.error(`[Admin] Manual retry failed for "${product.title}" (${source.siteName}):`, scrapeErr.message);

            res.status(400).json({
                success: false,
                error: scrapeErr.message
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST retry all currently failing sources sequentially
router.post('/retry-all', async (req, res) => {
    try {
        const products = await db.getProducts({ includeHistory: false });
        const targets = [];

        for (const p of products) {
            if (p.active === false || p.archived) continue;
            if (!Array.isArray(p.sources)) continue;
            p.sources.forEach((s, idx) => {
                if (s.lastStatus === 'error') {
                    targets.push({ productId: p._id, sourceIndex: idx, title: p.title, siteName: s.siteName });
                }
            });
        }

        if (targets.length === 0) {
            return res.json({ message: 'No failing sources to retry', results: [] });
        }

        console.log(`[Admin] Initiating bulk retry for ${targets.length} failing sources...`);

        // Process sequentially to honor 1GB RAM budget
        const results = [];
        for (const target of targets) {
            try {
                const product = await db.getProductById(target.productId);
                const source = product.sources[target.sourceIndex];
                const price = await scraper.scrapePrice(source.url, source.cssSelector, source.usePuppeteer);
                await db.addPriceHistory(target.productId, target.sourceIndex, price);
                results.push({ ...target, success: true, price });
            } catch (err) {
                await db.recordScrapeError(target.productId, target.sourceIndex, err.message).catch(() => {});
                results.push({ ...target, success: false, error: err.message });
            }
        }

        res.json({
            total: targets.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
