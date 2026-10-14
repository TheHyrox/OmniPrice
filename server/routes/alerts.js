const express = require('express');
const router = express.Router();
const db = require('../db/adapter');
const discord = require('../services/discord');
const { validate } = require('../middleware/validate');
const { createAlertSchema, updateAlertSchema, testWebhookSchema } = require('../schemas');
const { webhookTestLimiter } = require('../middleware/rate-limiters');

// GET all alerts (enriched with product info)
router.get('/', async (req, res) => {
    try {
        const [alerts, products] = await Promise.all([
            db.getAlerts(),
            db.getProducts()
        ]);

        const productMap = new Map();
        for (const p of products) {
            productMap.set(p._id, p);
        }

        const enrichedAlerts = alerts.map(alert => {
            const product = productMap.get(alert.productId);
            return {
                ...alert,
                product: product ? {
                    _id: product._id,
                    title: product.title,
                    image: product.image,
                    referencePrice: product.referencePrice,
                    lowestPrice: product.lowestPrice,
                    lowestPriceSource: product.lowestPriceSource
                } : null
            };
        });

        res.json(enrichedAlerts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET alert by ID
router.get('/:id', async (req, res) => {
    try {
        const alert = await db.getAlertById(req.params.id);
        if (!alert) return res.status(404).json({ error: 'Alert not found' });
        
        const product = await db.getProductById(alert.productId);
        res.json({ ...alert, product });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST create alert
router.post('/', validate(createAlertSchema), async (req, res) => {
    try {
        const { productId, targetPrice, webhookUrl, active } = req.body;

        // Verify product exists
        const product = await db.getProductById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const newAlert = await db.createAlert({
            productId,
            targetPrice: Number(targetPrice),
            webhookUrl: webhookUrl || '',
            active: active !== undefined ? Boolean(active) : true
        });

        res.status(201).json(newAlert);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT update alert
router.put('/:id', validate(updateAlertSchema), async (req, res) => {
    try {
        const updated = await db.updateAlert(req.params.id, req.body);
        if (!updated) return res.status(404).json({ error: 'Alert not found' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE alert
router.delete('/:id', async (req, res) => {
    try {
        const success = await db.deleteAlert(req.params.id);
        if (!success) return res.status(404).json({ error: 'Alert not found' });
        res.json({ message: 'Alert deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST test Discord webhook
router.post('/test-webhook', webhookTestLimiter, validate(testWebhookSchema), async (req, res) => {
    try {
        const { webhookUrl } = req.body;
        const result = await discord.testWebhook(webhookUrl);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST trigger test notification for a specific alert
router.post('/:id/test-trigger', webhookTestLimiter, async (req, res) => {
    try {
        const alert = await db.getAlertById(req.params.id);
        if (!alert) return res.status(404).json({ error: 'Alert not found' });

        const product = await db.getProductById(alert.productId);
        if (!product) return res.status(404).json({ error: 'Associated product not found' });

        const currentPrice = product.lowestPrice != null ? product.lowestPrice : alert.targetPrice;
        let storeName = product.lowestPriceSource?.siteName || (product.sources?.[0]?.siteName) || 'Online Merchant';
        let sourceUrl = product.lowestPriceSource?.url || (product.sources?.[0]?.url) || '';

        await discord.sendPriceAlert({
            alert,
            product,
            currentPrice,
            storeName,
            sourceUrl
        });

        res.json({ message: `Test Discord notification sent for "${product.title}"` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
