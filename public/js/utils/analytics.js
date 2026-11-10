/**
 * OmniPrice - Analytics & Market Intelligence Engine
 * Computes Deal Score, Historical Percentiles, Buy Advice, and Store Volatility Index.
 */

(function () {
    const Analytics = {
        /**
         * Cleans and sanitizes numerical price values.
         */
        sanitizePrice(price, refPrice) {
            if (price == null || isNaN(price) || price <= 0) return null;
            let p = Number(price);
            if (refPrice && refPrice > 0) {
                if (p > refPrice * 20 && (p / 100) <= refPrice * 2.5) {
                    p = p / 100;
                } else if (p > refPrice * 20 && (p / 1000) <= refPrice * 2.5) {
                    p = p / 1000;
                } else if (p > refPrice * 10) {
                    return null;
                }
            }
            return p;
        },

        /**
         * Normalizes date inputs to YYYY-MM-DD
         */
        normalizeDateStr(dateInput) {
            if (!dateInput) return null;
            try {
                const d = new Date(dateInput);
                if (isNaN(d.getTime())) return String(dateInput).slice(0, 10);
                return d.toISOString().slice(0, 10);
            } catch {
                return String(dateInput).slice(0, 10);
            }
        },

        /**
         * Computes the Deal Score (1-100), Historical Percentile, and Buy Advice.
         * @param {Object} product - Product document with priceHistory, referencePrice, lowestPrice.
         * @param {number} timeframeDays - 30, 90, 365, or 0 (all-time). Defaults to 90.
         * @returns {Object} Analytical assessment with dealScore, rating, advice, and stats.
         */
        calculateDealScore(product, timeframeDays = 90) {
            if (!product) {
                return { available: false, reason: 'No product data' };
            }

            const currentPrice = this.sanitizePrice(product.lowestPrice, product.referencePrice);
            if (currentPrice == null) {
                return { available: false, reason: 'No valid current price' };
            }

            // Cutoff date for timeframe
            let cutoffDateStr = null;
            if (timeframeDays > 0) {
                const cutoff = new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000);
                cutoffDateStr = cutoff.toISOString().slice(0, 10);
            }

            // Daily lowest price aggregation
            const dailyPricesMap = new Map();
            const history = Array.isArray(product.priceHistory) ? product.priceHistory : [];

            history.forEach(entry => {
                const dateStr = this.normalizeDateStr(entry.date);
                if (!dateStr) return;
                if (cutoffDateStr && dateStr < cutoffDateStr) return;

                let lowestOnDate = Infinity;
                (entry.prices || []).forEach(p => {
                    const clean = this.sanitizePrice(p.price, product.referencePrice);
                    if (clean != null && clean > 0 && clean < lowestOnDate) {
                        lowestOnDate = clean;
                    }
                });

                if (lowestOnDate !== Infinity) {
                    const prev = dailyPricesMap.get(dateStr);
                    if (prev == null || lowestOnDate < prev) {
                        dailyPricesMap.set(dateStr, lowestOnDate);
                    }
                }
            });

            const histPrices = Array.from(dailyPricesMap.values());
            const refPrice = product.referencePrice && product.referencePrice > 0 ? product.referencePrice : null;
            const discountVsRef = refPrice ? ((refPrice - currentPrice) / refPrice) * 100 : null;

            // Scenario A: No historical records (only current price and optional reference price)
            if (histPrices.length === 0) {
                let score = 50;
                if (discountVsRef != null) {
                    score = Math.min(Math.max(50 + discountVsRef * 1.5, 15), 95);
                }
                const roundedScore = Math.round(score);
                const rating = this._getRating(roundedScore);

                return {
                    available: true,
                    dealScore: roundedScore,
                    percentile: null,
                    cheaperPercent: null,
                    rating,
                    stats: {
                        currentPrice,
                        minPrice: currentPrice,
                        maxPrice: currentPrice,
                        avgPrice: currentPrice,
                        discountVsRef: discountVsRef != null ? Math.round(discountVsRef * 10) / 10 : null,
                        dataPoints: 0,
                        timeframeDays
                    }
                };
            }

            // Scenario B: With historical timeline
            const allPrices = [...histPrices, currentPrice];
            const minPrice = Math.min(...allPrices);
            const maxPrice = Math.max(...allPrices);
            const sum = histPrices.reduce((a, b) => a + b, 0);
            const avgPrice = sum / histPrices.length;

            // Percentile: proportion of historical days strictly cheaper than today
            const cheaperDays = histPrices.filter(p => p < currentPrice - 0.005).length;
            const percentile = (cheaperDays / histPrices.length) * 100;
            const cheaperPercent = Math.max(0, Math.min(100, Math.round(100 - percentile)));

            // Range position (0 = at minPrice, 100 = at maxPrice)
            const rangeSpan = maxPrice - minPrice;
            const rangePosition = rangeSpan > 0 ? ((currentPrice - minPrice) / rangeSpan) * 100 : 50;

            // Base score from distribution
            const percentileScore = 100 - percentile;
            const rangeScore = 100 - rangePosition;
            let compositeScore = (percentileScore * 0.65) + (rangeScore * 0.35);

            // Ref price adjustment if present
            if (discountVsRef != null) {
                if (discountVsRef > 0) {
                    // Bonus for MSRP discount
                    compositeScore += Math.min(discountVsRef * 0.35, 15);
                } else {
                    // Penalty if above MSRP
                    compositeScore += Math.max(discountVsRef * 0.5, -25);
                }
            }

            // Boost for All-Time Low
            const isAtl = (product.minPriceEver != null && currentPrice <= product.minPriceEver * 1.005) ||
                          (currentPrice <= minPrice * 1.005);
            if (isAtl) {
                compositeScore = Math.max(compositeScore, 92);
            }

            // Severe penalty if at maximum peak
            if (currentPrice >= maxPrice * 0.999 && histPrices.length >= 5) {
                compositeScore = Math.min(compositeScore, 35);
            }

            const finalScore = Math.round(Math.min(Math.max(compositeScore, 1), 100));
            const rating = this._getRating(finalScore);

            return {
                available: true,
                dealScore: finalScore,
                percentile: Math.round(percentile),
                cheaperPercent,
                isAtl,
                rating,
                stats: {
                    currentPrice,
                    minPrice,
                    maxPrice,
                    avgPrice: Math.round(avgPrice * 100) / 100,
                    discountVsRef: discountVsRef != null ? Math.round(discountVsRef * 10) / 10 : null,
                    dataPoints: histPrices.length,
                    timeframeDays
                }
            };
        },

        /**
         * Returns rating badge and advice based on numeric deal score.
         */
        _getRating(score) {
            if (score >= 85) {
                return {
                    level: 'exceptional',
                    badgeText: 'Exceptional Deal',
                    badgeClass: 'deal-exceptional',
                    actionText: 'Buy Now',
                    adviceText: 'Price is near historical low. Rare discount — strong buy opportunity.',
                    emoji: '🔥',
                    color: '#10b981'
                };
            }
            if (score >= 70) {
                return {
                    level: 'great',
                    badgeText: 'Great Deal',
                    badgeClass: 'deal-great',
                    actionText: 'Good Price',
                    adviceText: 'Cheaper than most recorded days. Solid time to buy.',
                    emoji: '✨',
                    color: '#2563eb'
                };
            }
            if (score >= 45) {
                return {
                    level: 'fair',
                    badgeText: 'Fair Price',
                    badgeClass: 'deal-fair',
                    actionText: 'Fair Price',
                    adviceText: 'Standard market rate. Buy if you need it now.',
                    emoji: '⚖️',
                    color: '#f59e0b'
                };
            }
            if (score >= 25) {
                return {
                    level: 'mediocre',
                    badgeText: 'High Price',
                    badgeClass: 'deal-mediocre',
                    actionText: 'Consider Waiting',
                    adviceText: 'Price is above historical average. Likely to drop in upcoming cycles.',
                    emoji: '⏳',
                    color: '#ea580c'
                };
            }
            return {
                level: 'poor',
                badgeText: 'Overpriced',
                badgeClass: 'deal-poor',
                actionText: 'Wait',
                adviceText: 'Near recorded peak. We recommend holding off for a sale.',
                emoji: '🛑',
                color: '#ef4444'
            };
        },

        /**
         * Analyzes store pricing behaviors across all tracked products:
         * Win rate (% of products where store is cheapest), price change frequency, and volatility index.
         * @param {Array} products - Array of product objects.
         * @returns {Array} List of store intelligence summaries.
         */
        calculateStoreVolatility(products) {
            if (!Array.isArray(products) || products.length === 0) {
                return [];
            }

            const storeMap = new Map();

            // Helper to get store record
            const getOrCreateStore = (rawName) => {
                const name = (rawName || '').trim() || 'Unknown Store';
                const key = name.toLowerCase();
                if (!storeMap.has(key)) {
                    storeMap.set(key, {
                        name,
                        productIds: new Set(),
                        cheapestCount: 0,
                        priceChangeEvents: 0,
                        discountDrops: [],
                        totalScrapes: 0
                    });
                }
                return storeMap.get(key);
            };

            products.forEach(prod => {
                if (!prod || prod.archived) return;

                const sources = Array.isArray(prod.sources) ? prod.sources : [];
                if (sources.length === 0) return;

                const cleanLowest = this.sanitizePrice(prod.lowestPrice, prod.referencePrice);
                const lowestStoreName = prod.lowestPriceSource?.siteName?.trim()?.toLowerCase();

                sources.forEach((s, srcIdx) => {
                    const storeData = getOrCreateStore(s.siteName);
                    storeData.productIds.add(String(prod._id));

                    const cleanSourcePrice = this.sanitizePrice(s.lastPrice, prod.referencePrice);
                    if (cleanSourcePrice != null && cleanLowest != null && (
                        (lowestStoreName && storeData.name.toLowerCase() === lowestStoreName) ||
                        cleanSourcePrice === cleanLowest
                    )) {
                        storeData.cheapestCount++;
                    }
                });

                // Analyze historical changes for each source
                const history = Array.isArray(prod.priceHistory) ? prod.priceHistory : [];
                if (history.length >= 2) {
                    sources.forEach((s, srcIdx) => {
                        const storeData = getOrCreateStore(s.siteName);
                        let prevPrice = null;

                        history.forEach(entry => {
                            const match = (entry.prices || []).find(p => p.sourceIndex === srcIdx);
                            if (match && match.price != null && !isNaN(match.price) && match.price > 0) {
                                storeData.totalScrapes++;
                                const currentP = match.price;
                                if (prevPrice != null && Math.abs(currentP - prevPrice) > 0.01) {
                                    storeData.priceChangeEvents++;
                                    if (currentP < prevPrice) {
                                        const dropPercent = ((prevPrice - currentP) / prevPrice) * 100;
                                        storeData.discountDrops.push(dropPercent);
                                    }
                                }
                                prevPrice = currentP;
                            }
                        });
                    });
                }
            });

            const results = [];
            storeMap.forEach(store => {
                const productsCount = store.productIds.size;
                if (productsCount === 0) return;

                const winRate = productsCount > 0 ? Math.round((store.cheapestCount / productsCount) * 100) : 0;
                const changesPerProduct = productsCount > 0 ? (store.priceChangeEvents / productsCount) : 0;
                const avgDiscountDepth = store.discountDrops.length > 0
                    ? Math.round((store.discountDrops.reduce((a, b) => a + b, 0) / store.discountDrops.length) * 10) / 10
                    : 0;

                let volatilityLevel = 'stable';
                let volatilityLabel = 'Stable Pricing';
                let volatilityBadgeClass = 'volatility-stable';
                let volatilityEmoji = '🛡️';
                let volatilityDesc = 'Prices rarely change between seasonal sales';

                if (changesPerProduct >= 2.0 || store.priceChangeEvents >= 5) {
                    volatilityLevel = 'dynamic';
                    volatilityLabel = 'Dynamic Pricing';
                    volatilityBadgeClass = 'volatility-dynamic';
                    volatilityEmoji = '⚡';
                    volatilityDesc = 'Algorithmic or frequent adjustments';
                } else if (changesPerProduct >= 0.5 || store.priceChangeEvents >= 2) {
                    volatilityLevel = 'moderate';
                    volatilityLabel = 'Moderate Volatility';
                    volatilityBadgeClass = 'volatility-moderate';
                    volatilityEmoji = '🔄';
                    volatilityDesc = 'Occasional price drops or sales';
                }

                results.push({
                    name: store.name,
                    productsCount,
                    cheapestCount: store.cheapestCount,
                    winRate,
                    priceChanges: store.priceChangeEvents,
                    changesPerProduct: Math.round(changesPerProduct * 10) / 10,
                    avgDiscountDepth,
                    volatilityLevel,
                    volatilityLabel,
                    volatilityBadgeClass,
                    volatilityEmoji,
                    volatilityDesc
                });
            });

            // Sort by products monitored descending, then winRate
            results.sort((a, b) => b.productsCount - a.productsCount || b.winRate - a.winRate);
            return results;
        }
    };

    if (typeof window !== 'undefined') {
        window.Analytics = Analytics;
    }
    if (typeof module !== 'undefined') {
        module.exports = Analytics;
    }
})();
