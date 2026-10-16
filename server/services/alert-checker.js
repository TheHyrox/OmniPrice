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

                if (alert.alertType === 'rise') {
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
                } else if (alert.alertType === 'percentage_drop') {
                    // Alert when price dropped by at least thresholdPercent % below referencePrice
                    const refPrice = product.referencePrice;
                    if (!refPrice || refPrice <= 0) continue;

                    const thresholdPercent = alert.thresholdPercent || 15;
                    const targetPrice = refPrice * (1 - thresholdPercent / 100);
                    const currentDropPercent = ((refPrice - product.lowestPrice) / refPrice) * 100;

                    if (product.lowestPrice <= targetPrice) {
                        const hasNeverTriggered = !alert.lastTriggeredAt;
                        const priceDroppedFurther = alert.lastTriggeredPrice != null && product.lowestPrice < alert.lastTriggeredPrice;

                        if (hasNeverTriggered || priceDroppedFurther) {
                            console.log(`[Alert] % Drop threshold met for "${product.title}" (${currentDropPercent.toFixed(1)}% >= ${thresholdPercent}%). Dispatching notifications...`);

                            try {
                                await discord.sendPercentageDropAlert({
                                    alert,
                                    product,
                                    currentPrice: product.lowestPrice,
                                    dropPercent: currentDropPercent,
                                    storeName,
                                    sourceUrl
                                });
                            } catch (err) {
                                console.error(`[Alert] Discord % drop notification failed:`, err.message);
                            }

                            try {
                                await webPush.sendNotificationToAll({
                                    title: `🎉 ${thresholdPercent}% Price Drop: ${product.title}`,
                                    body: `Now €${Number(product.lowestPrice).toFixed(2)} (${currentDropPercent.toFixed(1)}% below reference) at ${storeName || 'merchant'}`,
                                    icon: product.image || '/images/placeholder.svg',
                                    url: sourceUrl || '/'
                                });
                            } catch (err) {
                                console.error(`[Alert] Web Push % drop notification failed:`, err.message);
                            }

                            await db.updateAlert(alert._id, {
                                lastTriggeredAt: new Date().toISOString(),
                                lastTriggeredPrice: product.lowestPrice,
                                targetPrice: Number(targetPrice.toFixed(2))
                            });
                        }
                    } else if (product.lowestPrice > targetPrice && alert.lastTriggeredAt) {
                        if (alert.notifyOnRise) {
                            console.log(`[Alert] % Drop deal ended for "${product.title}" (rose from €${alert.lastTriggeredPrice} to €${product.lowestPrice}). Dispatching deal-ended notifications...`);
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
                                    body: `Price rose back up to €${Number(product.lowestPrice).toFixed(2)}`,
                                    icon: product.image || '/images/placeholder.svg',
                                    url: sourceUrl || '/'
                                });
                            } catch (err) {
                                console.error(`[Alert] Web Push deal-ended notification failed:`, err.message);
                            }
                        }

                        await db.updateAlert(alert._id, {
                            lastTriggeredAt: null,
                            lastTriggeredPrice: null
                        });
                    }
                } else if (alert.alertType === 'atl') {
                    // Alert when price is at or below historical all-time low
                    let minEver = Infinity;
                    const history = (product.priceHistory && product.priceHistory.length > 0)
                        ? product.priceHistory
                        : await db.getPriceHistory(product._id);

                    if (history && history.length > 0) {
                        history.forEach(h => {
                            (h.prices || []).forEach(p => {
                                if (p.price != null && !isNaN(p.price) && p.price > 0 && p.price < minEver) {
                                    minEver = p.price;
                                }
                            });
                        });
                    }

                    const isATL = minEver !== Infinity && product.lowestPrice <= minEver * 1.005;

                    if (isATL) {
                        const hasNeverTriggered = !alert.lastTriggeredAt;
                        const priceDroppedFurther = alert.lastTriggeredPrice != null && product.lowestPrice < alert.lastTriggeredPrice;

                        if (hasNeverTriggered || priceDroppedFurther) {
                            console.log(`[Alert] All-Time Low reached for "${product.title}" (€${product.lowestPrice}). Dispatching notifications...`);

                            try {
                                await discord.sendAllTimeLowAlert({
                                    alert,
                                    product,
                                    currentPrice: product.lowestPrice,
                                    previousPrice: alert.lastTriggeredPrice || null,
                                    storeName,
                                    sourceUrl
                                });
                            } catch (err) {
                                console.error(`[Alert] Discord ATL notification failed:`, err.message);
                            }

                            try {
                                await webPush.sendNotificationToAll({
                                    title: `🔥 All-Time Low: ${product.title}`,
                                    body: `Historic low at €${Number(product.lowestPrice).toFixed(2)} at ${storeName || 'merchant'}`,
                                    icon: product.image || '/images/placeholder.svg',
                                    url: sourceUrl || '/'
                                });
                            } catch (err) {
                                console.error(`[Alert] Web Push ATL notification failed:`, err.message);
                            }

                            await db.updateAlert(alert._id, {
                                lastTriggeredAt: new Date().toISOString(),
                                lastTriggeredPrice: product.lowestPrice,
                                targetPrice: product.lowestPrice
                            });
                        }
                    } else if (!isATL && alert.lastTriggeredAt) {
                        if (alert.notifyOnRise) {
                            console.log(`[Alert] ATL deal ended for "${product.title}". Dispatching deal-ended notifications...`);
                            try {
                                await discord.sendPriceRiseAlert({
                                    alert,
                                    product,
                                    currentPrice: product.lowestPrice,
                                    previousPrice: alert.lastTriggeredPrice,
                                    storeName,
                                    sourceUrl
                                });
                            } catch (err) {}

                            try {
                                await webPush.sendNotificationToAll({
                                    title: `⚠️ ATL Ended: ${product.title}`,
                                    body: `Price is no longer at All-Time Low (now €${Number(product.lowestPrice).toFixed(2)})`,
                                    icon: product.image || '/images/placeholder.svg',
                                    url: sourceUrl || '/'
                                });
                            } catch (err) {}
                        }

                        // Re-arm when price bounces away from ATL
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
