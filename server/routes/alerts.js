const express = require('express');
const router = express.Router();
const db = require('../db/adapter');
const discord = require('../services/discord');
const webPush = require('../services/web-push');
const { validate } = require('../middleware/validate');
const { createAlertSchema, updateAlertSchema, testWebhookSchema } = require('../schemas');
const { webhookTestLimiter } = require('../middleware/rate-limiters');

// ─── Web Push Endpoints (must precede /:id) ──────────────────────────────────

// GET VAPID public key for Web Push subscription
router.get('/push/vapid-key', async (req, res) => {
    try {
        const publicKey = await webPush.getPublicKey();
        res.json({ publicKey });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST save browser Web Push subscription
router.post('/push/subscribe', async (req, res) => {
    try {
        const subscription = await webPush.subscribe(req.body);
        res.json({ success: true, subscription });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST test Web Push notification to all subscribed clients
router.post('/push/test', async (req, res) => {
    try {
        const result = await webPush.sendNotificationToAll({
            title: 'OmniPrice Push Notification',
            body: 'Web Push alerts are active and running successfully!',
            icon: '/images/placeholder.svg',
            url: '/'
        });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Alert Endpoints ─────────────────────────────────────────────────────────

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
                    lowestPriceSource: product.lowestPriceSource,
                    priceHistory: product.priceHistory
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
        const { productId, targetPrice, thresholdPercent, webhookUrl, active, alertType, notifyOnRise } = req.body;

        // Verify product exists
        const product = await db.getProductById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        let computedTargetPrice = targetPrice != null ? Number(targetPrice) : null;
        if (alertType === 'percentage_drop' && thresholdPercent != null && product.referencePrice) {
            computedTargetPrice = Number((product.referencePrice * (1 - Number(thresholdPercent) / 100)).toFixed(2));
        }

        const newAlert = await db.createAlert({
            productId,
            targetPrice: computedTargetPrice,
            thresholdPercent: thresholdPercent != null ? Number(thresholdPercent) : null,
            webhookUrl: webhookUrl || '',
            active: active !== undefined ? Boolean(active) : true,
            alertType: alertType || 'drop',
            notifyOnRise: Boolean(notifyOnRise)
        });

        res.status(201).json(newAlert);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT update alert
router.put('/:id', validate(updateAlertSchema), async (req, res) => {
    try {
        const existing = await db.getAlertById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Alert not found' });

        const updateData = { ...req.body };
        const effectiveType = updateData.alertType || existing.alertType;
        const effectivePercent = updateData.thresholdPercent !== undefined ? updateData.thresholdPercent : existing.thresholdPercent;

        if (effectiveType === 'percentage_drop' && effectivePercent != null) {
            const product = await db.getProductById(existing.productId);
            if (product && product.referencePrice) {
                updateData.targetPrice = Number((product.referencePrice * (1 - Number(effectivePercent) / 100)).toFixed(2));
            }
        }

        const updated = await db.updateAlert(req.params.id, updateData);
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

        const currentPrice = product.lowestPrice != null ? product.lowestPrice : (alert.targetPrice || product.referencePrice || 99.99);
        let storeName = product.lowestPriceSource?.siteName || (product.sources?.[0]?.siteName) || 'Online Merchant';
        let sourceUrl = product.lowestPriceSource?.url || (product.sources?.[0]?.url) || '';

        if (alert.alertType === 'atl') {
            await discord.sendAllTimeLowAlert({
                alert,
                product,
                currentPrice,
                previousPrice: alert.lastTriggeredPrice || null,
                storeName,
                sourceUrl
            });
            await webPush.sendNotificationToAll({
                title: `🔥 Test All-Time Low: ${product.title}`,
                body: `Price is at €${Number(currentPrice).toFixed(2)} (All-time low trigger)`,
                icon: product.image || '/images/placeholder.svg',
                url: sourceUrl || '/'
            }).catch(() => {});
        } else if (alert.alertType === 'percentage_drop') {
            const dropPercent = product.referencePrice ? ((product.referencePrice - currentPrice) / product.referencePrice) * 100 : (alert.thresholdPercent || 15);
            await discord.sendPercentageDropAlert({
                alert,
                product,
                currentPrice,
                dropPercent,
                storeName,
                sourceUrl
            });
            await webPush.sendNotificationToAll({
                title: `🎉 Test ${alert.thresholdPercent || 15}% Drop: ${product.title}`,
                body: `Price is at €${Number(currentPrice).toFixed(2)} (${dropPercent.toFixed(1)}% drop trigger)`,
                icon: product.image || '/images/placeholder.svg',
                url: sourceUrl || '/'
            }).catch(() => {});
        } else if (alert.alertType === 'rise') {
            await discord.sendPriceRiseAlert({
                alert,
                product,
                currentPrice,
                previousPrice: alert.targetPrice || currentPrice,
                storeName,
                sourceUrl
            });
            await webPush.sendNotificationToAll({
                title: `📈 Test Price Rise: ${product.title}`,
                body: `Price is at €${Number(currentPrice).toFixed(2)} (Alert: rise above €${alert.targetPrice})`,
                icon: product.image || '/images/placeholder.svg',
                url: sourceUrl || '/'
            }).catch(() => {});
        } else {
            await discord.sendPriceAlert({
                alert,
                product,
                currentPrice,
                storeName,
                sourceUrl
            });
            await webPush.sendNotificationToAll({
                title: `🎉 Test Price Drop: ${product.title}`,
                body: `Price is at €${Number(currentPrice).toFixed(2)} (Target: €${alert.targetPrice})`,
                icon: product.image || '/images/placeholder.svg',
                url: sourceUrl || '/'
            }).catch(() => {});
        }

        res.json({ message: `Test notification sent for "${product.title}"` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
