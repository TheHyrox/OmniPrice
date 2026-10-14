const db = require('../db/adapter');
const discord = require('./discord');
const webPush = require('./web-push');

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

            for (const alert of alerts) {
                if (!alert.active) continue;

                const isRiseAlert = alert.alertType === 'rise';

                if (isRiseAlert) {
                    // Alert when price is at or above target
                    if (product.lowestPrice >= alert.targetPrice) {
                        const hasNeverTriggered = !alert.lastTriggeredAt;
                        const priceRoseFurther = alert.lastTriggeredPrice != null && product.lowestPrice > alert.lastTriggeredPrice;

                        if (hasNeverTriggered || priceRoseFurther) {
                            console.log(`[Alert] Rise target met for "${product.title}" (€${product.lowestPrice} >= €${alert.targetPrice}). Dispatching notifications...`);

                            try {
                                await discord.sendPriceRiseAlert({
                                    alert,
                                    product,
                                    currentPrice: product.lowestPrice,
                                    previousPrice: alert.lastTriggeredPrice || alert.targetPrice,
                                    storeName,
                                    sourceUrl
                                });
                            } catch (err) {
                                console.error(`[Alert] Discord rise notification failed:`, err.message);
                            }

                            try {
                                await webPush.sendNotificationToAll({
                                    title: `📈 Price Rise: ${product.title}`,
                                    body: `Price rose to €${Number(product.lowestPrice).toFixed(2)} (at ${storeName || 'merchant'})`,
                                    icon: product.image || '/images/placeholder.svg',
                                    url: sourceUrl || '/'
                                });
                            } catch (err) {
                                console.error(`[Alert] Web Push rise notification failed:`, err.message);
                            }

                            await db.updateAlert(alert._id, {
                                lastTriggeredAt: new Date().toISOString(),
                                lastTriggeredPrice: product.lowestPrice
                            });
                        }
                    } else if (product.lowestPrice < alert.targetPrice && alert.lastTriggeredAt) {
                        // Re-arm rise alert if price dropped below target
                        await db.updateAlert(alert._id, {
                            lastTriggeredAt: null,
                            lastTriggeredPrice: null
                        });
                    }
                } else {
                    // Drop alert (default)
                    if (product.lowestPrice <= alert.targetPrice) {
                        const hasNeverTriggered = !alert.lastTriggeredAt;
                        const priceDroppedFurther = alert.lastTriggeredPrice != null && product.lowestPrice < alert.lastTriggeredPrice;

                        if (hasNeverTriggered || priceDroppedFurther) {
                            console.log(`[Alert] Drop target met for "${product.title}" (€${product.lowestPrice} <= €${alert.targetPrice}). Dispatching notifications...`);

                            try {
                                await discord.sendPriceAlert({
                                    alert,
                                    product,
                                    currentPrice: product.lowestPrice,
                                    storeName,
                                    sourceUrl
                                });
                            } catch (err) {
                                console.error(`[Alert] Failed to send Discord notification:`, err.message);
                            }

                            try {
                                await webPush.sendNotificationToAll({
                                    title: `🎉 Price Drop: ${product.title}`,
                                    body: `Now €${Number(product.lowestPrice).toFixed(2)} (Target: €${alert.targetPrice}) at ${storeName || 'merchant'}`,
                                    icon: product.image || '/images/placeholder.svg',
                                    url: sourceUrl || '/'
                                });
                            } catch (err) {
                                console.error(`[Alert] Web Push drop notification failed:`, err.message);
                            }

                            // Update alert record
                            await db.updateAlert(alert._id, {
                                lastTriggeredAt: new Date().toISOString(),
                                lastTriggeredPrice: product.lowestPrice
                            });
                        }
                    } else if (product.lowestPrice > alert.targetPrice && alert.lastTriggeredAt) {
                        // Deal ended condition: notify if notifyOnRise is enabled
                        if (alert.notifyOnRise) {
                            console.log(`[Alert] Deal ended for "${product.title}" (rose from €${alert.lastTriggeredPrice} to €${product.lowestPrice}). Dispatching deal-ended notifications...`);
                            try {
                                await discord.sendPriceRiseAlert({
                                    alert,
                                    product,
                                    currentPrice: product.lowestPrice,
                                    previousPrice: alert.lastTriggeredPrice,
                                    storeName,
                                    sourceUrl
                                });
                            } catch (err) {
                                console.error(`[Alert] Discord deal-ended notification failed:`, err.message);
                            }

                            try {
                                await webPush.sendNotificationToAll({
                                    title: `⚠️ Deal Ended: ${product.title}`,
                                    body: `Price bounced back up to €${Number(product.lowestPrice).toFixed(2)}`,
                                    icon: product.image || '/images/placeholder.svg',
                                    url: sourceUrl || '/'
                                });
                            } catch (err) {
                                console.error(`[Alert] Web Push deal-ended notification failed:`, err.message);
                            }
                        }

                        // Re-arm the alert
                        await db.updateAlert(alert._id, {
                            lastTriggeredAt: null,
                            lastTriggeredPrice: null
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`[AlertChecker] Error evaluating alerts for product ${product._id}:`, error.message);
        }
    }
}

module.exports = new AlertChecker();
