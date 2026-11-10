const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const Analytics = require('../public/js/utils/analytics');

describe('Analytics - Deal Score & Buy Advice', () => {
    test('calculateDealScore: returns unavailable when no valid price exists', () => {
        const result = Analytics.calculateDealScore({ title: 'Null Product' });
        assert.equal(result.available, false);
    });

    test('calculateDealScore: evaluates product with no history based on reference price discount', () => {
        const product = {
            title: 'Wireless Headphones',
            lowestPrice: 80,
            referencePrice: 100
        };

        const result = Analytics.calculateDealScore(product);
        assert.equal(result.available, true);
        assert.ok(result.dealScore >= 70, `Expected score >= 70 for 20% discount, got ${result.dealScore}`);
        assert.equal(result.rating.actionText, 'Good Price');
    });

    test('calculateDealScore: gives high score for All-Time Low with multi-day history', () => {
        const today = new Date().toISOString().slice(0, 10);
        const product = {
            title: 'Gaming Monitor',
            referencePrice: 350,
            lowestPrice: 249,
            minPriceEver: 249,
            priceHistory: [
                { date: '2026-10-01', prices: [{ sourceIndex: 0, price: 349 }] },
                { date: '2026-10-15', prices: [{ sourceIndex: 0, price: 320 }] },
                { date: '2026-10-30', prices: [{ sourceIndex: 0, price: 299 }] },
                { date: '2026-11-05', prices: [{ sourceIndex: 0, price: 279 }] },
                { date: today, prices: [{ sourceIndex: 0, price: 249 }] }
            ]
        };

        const result = Analytics.calculateDealScore(product, 90);
        assert.equal(result.available, true);
        assert.ok(result.dealScore >= 90, `Expected score >= 90 for ATL, got ${result.dealScore}`);
        assert.equal(result.rating.level, 'exceptional');
        assert.equal(result.rating.actionText, 'Buy Now');
        assert.equal(result.cheaperPercent, 100);
    });

    test('calculateDealScore: gives low score and "Wait" advice when at price peak', () => {
        const today = new Date().toISOString().slice(0, 10);
        const product = {
            title: 'Coffee Maker',
            referencePrice: 100,
            lowestPrice: 120, // above MSRP and peak
            priceHistory: [
                { date: '2026-10-01', prices: [{ sourceIndex: 0, price: 89 }] },
                { date: '2026-10-10', prices: [{ sourceIndex: 0, price: 92 }] },
                { date: '2026-10-20', prices: [{ sourceIndex: 0, price: 85 }] },
                { date: '2026-10-25', prices: [{ sourceIndex: 0, price: 95 }] },
                { date: '2026-11-01', prices: [{ sourceIndex: 0, price: 105 }] },
                { date: today, prices: [{ sourceIndex: 0, price: 120 }] }
            ]
        };

        const result = Analytics.calculateDealScore(product, 90);
        assert.equal(result.available, true);
        assert.ok(result.dealScore <= 35, `Expected score <= 35 at peak, got ${result.dealScore}`);
        assert.equal(result.rating.actionText, 'Wait');
    });

    test('calculateDealScore: timeframe filter respects date cutoffs', () => {
        const product = {
            title: 'Action Camera',
            referencePrice: 200,
            lowestPrice: 150,
            priceHistory: [
                { date: '2025-01-01', prices: [{ sourceIndex: 0, price: 99 }] }, // Old, >365d
                { date: '2026-11-01', prices: [{ sourceIndex: 0, price: 180 }] }  // Recent
            ]
        };

        const result30d = Analytics.calculateDealScore(product, 30);
        assert.equal(result30d.stats.dataPoints, 1);

        const resultAll = Analytics.calculateDealScore(product, 0);
        assert.equal(resultAll.stats.dataPoints, 2);
    });
});

describe('Analytics - Store Volatility & Win-Rate Index', () => {
    test('calculateStoreVolatility: correctly computes win rates and changes', () => {
        const products = [
            {
                _id: 'p1',
                title: 'Keyboard',
                lowestPrice: 100,
                lowestPriceSource: { siteName: 'Amazon' },
                sources: [
                    { siteName: 'Amazon', lastPrice: 100 },
                    { siteName: 'Fnac', lastPrice: 120 }
                ],
                priceHistory: [
                    { date: '2026-11-01', prices: [{ sourceIndex: 0, price: 110 }, { sourceIndex: 1, price: 120 }] },
                    { date: '2026-11-05', prices: [{ sourceIndex: 0, price: 100 }, { sourceIndex: 1, price: 120 }] }
                ]
            },
            {
                _id: 'p2',
                title: 'Mouse',
                lowestPrice: 50,
                lowestPriceSource: { siteName: 'Amazon' },
                sources: [
                    { siteName: 'Amazon', lastPrice: 50 },
                    { siteName: 'Fnac', lastPrice: 60 }
                ],
                priceHistory: [
                    { date: '2026-11-01', prices: [{ sourceIndex: 0, price: 55 }, { sourceIndex: 1, price: 60 }] },
                    { date: '2026-11-08', prices: [{ sourceIndex: 0, price: 50 }, { sourceIndex: 1, price: 60 }] }
                ]
            }
        ];

        const summary = Analytics.calculateStoreVolatility(products);
        assert.equal(summary.length, 2);

        const amazon = summary.find(s => s.name === 'Amazon');
        const fnac = summary.find(s => s.name === 'Fnac');

        assert.ok(amazon);
        assert.ok(fnac);

        assert.equal(amazon.productsCount, 2);
        assert.equal(amazon.winRate, 100); // cheapest on both
        assert.ok(amazon.priceChanges >= 2);

        assert.equal(fnac.productsCount, 2);
        assert.equal(fnac.winRate, 0); // cheapest on neither
        assert.equal(fnac.priceChanges, 0); // static price at 120 and 60
        assert.equal(fnac.volatilityLevel, 'stable');
    });

    test('calculateStoreVolatility: returns empty array on empty products', () => {
        const result = Analytics.calculateStoreVolatility([]);
        assert.deepEqual(result, []);
    });
});

describe('Settings - KPI Visibility Schema Validation', () => {
    const { updateSettingsSchema } = require('../server/schemas');

    test('accepts valid kpiVisibility boolean options', () => {
        const payload = {
            currency: 'EUR',
            kpiVisibility: {
                showTrackedKpi: true,
                showRecordLowsKpi: false,
                showTotalSavingsKpi: true,
                showStoreFeedsKpi: true,
                showDealScoreBadge: true,
                showBuyAdvice: false,
                showStoreVolatility: true
            }
        };

        const parsed = updateSettingsSchema.safeParse(payload);
        assert.equal(parsed.success, true);
    });

    test('rejects unrecognized properties in strict mode', () => {
        const payload = {
            kpiVisibility: {
                showTrackedKpi: true,
                invalidKey: 'should-fail'
            }
        };

        const parsed = updateSettingsSchema.safeParse(payload);
        assert.equal(parsed.success, false);
    });
});

