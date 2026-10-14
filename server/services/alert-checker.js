const db = require('../db/adapter');
const discord = require('./discord');

class AlertChecker {
    /**
     * Checks alerts for a given product after prices have been updated.
     * @param {Object} product - Product object with lowestPrice and sources.
     */
    async checkProduct(product) {
        if (!product || !product._id || product.lowestPrice == null) {
            return;
        }

        try {
            const alerts = await db.getAlertsByProductId(product._id);
            if (!alerts || alerts.length === 0) return;

            for (const alert of alerts) {
                if (!alert.active) continue;

                // Price is at or below target
                if (product.lowestPrice <= alert.targetPrice) {
                    const hasNeverTriggered = !alert.lastTriggeredAt;
                    const priceDroppedFurther = alert.lastTriggeredPrice != null && product.lowestPrice < alert.lastTriggeredPrice;

                    if (hasNeverTriggered || priceDroppedFurther) {
                        // Find matching source
                        let storeName = '';
                        let sourceUrl = '';

                        if (product.lowestPriceSource) {
                            storeName = product.lowestPriceSource.siteName || '';
                            sourceUrl = product.lowestPriceSource.url || '';
                        } else if (Array.isArray(product.sources)) {
                            const matchingSource = product.sources.find(s => s.lastPrice === product.lowestPrice);
                            if (matchingSource) {
                                storeName = matchingSource.siteName;
                                sourceUrl = matchingSource.url;
                            }
                        }

                        console.log(`[Alert] Target met for "${product.title}" (€${product.lowestPrice} <= €${alert.targetPrice}). Dispatching Discord notification...`);

                        try {
                            await discord.sendPriceAlert({
                                alert,
                                product,
                                currentPrice: product.lowestPrice,
                                storeName,
                                sourceUrl
                            });

                            console.log(`[Alert] Discord notification sent for "${product.title}"`);

                            // Update alert record
                            await db.updateAlert(alert._id, {
                                lastTriggeredAt: new Date().toISOString(),
                                lastTriggeredPrice: product.lowestPrice
                            });
                        } catch (err) {
                            console.error(`[Alert] Failed to send Discord notification:`, err.message);
                        }
                    }
                } else if (product.lowestPrice > alert.targetPrice && alert.lastTriggeredAt) {
                    // Price bounced back above target — re-arm the alert
                    await db.updateAlert(alert._id, {
                        lastTriggeredAt: null,
                        lastTriggeredPrice: null
                    });
                }
            }
        } catch (error) {
            console.error(`[AlertChecker] Error evaluating alerts for product ${product._id}:`, error.message);
        }
    }
}

module.exports = new AlertChecker();
