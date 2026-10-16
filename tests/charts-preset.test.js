const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Read Charts implementation from public/js/components/charts.js
const chartsCode = fs.readFileSync(path.join(__dirname, '../public/js/components/charts.js'), 'utf8');

// Minimal sandbox to execute Charts object
const fn = new Function('ProductCard', `${chartsCode}; return Charts;`);
const Charts = fn({
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
    }
});

test('Charts - hasPriceChangedInTimeframe', async (t) => {
    const now = new Date();
    const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    await t.test('returns true when price lowered within timeframe (30 days)', () => {
        const product = {
            _id: 'p1',
            referencePrice: 100,
            priceHistory: [
                { date: daysAgo(20), prices: [{ price: 100 }] },
                { date: daysAgo(5), prices: [{ price: 80 }] }
            ]
        };
        assert.strictEqual(Charts.hasPriceChangedInTimeframe(product, 30), true);
    });

    await t.test('returns true when price raised within timeframe (30 days)', () => {
        const product = {
            _id: 'p2',
            referencePrice: 100,
            priceHistory: [
                { date: daysAgo(15), prices: [{ price: 80 }] },
                { date: daysAgo(2), prices: [{ price: 95 }] }
            ]
        };
        assert.strictEqual(Charts.hasPriceChangedInTimeframe(product, 30), true);
    });

    await t.test('returns false when price remained unchanged within timeframe', () => {
        const product = {
            _id: 'p3',
            referencePrice: 100,
            priceHistory: [
                { date: daysAgo(20), prices: [{ price: 80 }] },
                { date: daysAgo(5), prices: [{ price: 80 }] }
            ]
        };
        assert.strictEqual(Charts.hasPriceChangedInTimeframe(product, 30), false);
    });

    await t.test('returns true when price changed entering timeframe from preceding period', () => {
        const product = {
            _id: 'p4',
            referencePrice: 100,
            priceHistory: [
                { date: daysAgo(40), prices: [{ price: 100 }] },
                { date: daysAgo(10), prices: [{ price: 75 }] }
            ]
        };
        // In 30 days: only entry at daysAgo(10) with 75. But previous price was 100.
        assert.strictEqual(Charts.hasPriceChangedInTimeframe(product, 30), true);
    });

    await t.test('returns false when previous price and in-range price are identical', () => {
        const product = {
            _id: 'p5',
            referencePrice: 100,
            priceHistory: [
                { date: daysAgo(45), prices: [{ price: 90 }] },
                { date: daysAgo(10), prices: [{ price: 90 }] }
            ]
        };
        assert.strictEqual(Charts.hasPriceChangedInTimeframe(product, 30), false);
    });

    await t.test('returns false when price changed outside timeframe (older than range)', () => {
        const product = {
            _id: 'p6',
            referencePrice: 100,
            priceHistory: [
                { date: daysAgo(50), prices: [{ price: 100 }] },
                { date: daysAgo(40), prices: [{ price: 80 }] }
            ]
        };
        // In 5 days: no records exist
        assert.strictEqual(Charts.hasPriceChangedInTimeframe(product, 5), false);
    });

    await t.test('returns false for newly added product with only 1 history point', () => {
        const product = {
            _id: 'p7',
            referencePrice: 100,
            priceHistory: [
                { date: daysAgo(3), prices: [{ price: 80 }] }
            ]
        };
        assert.strictEqual(Charts.hasPriceChangedInTimeframe(product, 30), false);
    });

    await t.test('returns false when priceHistory is empty or null', () => {
        assert.strictEqual(Charts.hasPriceChangedInTimeframe({ _id: 'p8', priceHistory: [] }, 30), false);
        assert.strictEqual(Charts.hasPriceChangedInTimeframe({ _id: 'p9' }, 30), false);
    });

    await t.test('All-Time (timeframe = 0): returns true if price fluctuated historically', () => {
        const product = {
            _id: 'p10',
            referencePrice: 100,
            priceHistory: [
                { date: daysAgo(400), prices: [{ price: 120 }] },
                { date: daysAgo(200), prices: [{ price: 90 }] }
            ]
        };
        assert.strictEqual(Charts.hasPriceChangedInTimeframe(product, 0), true);
    });

    await t.test('All-Time (timeframe = 0): returns false if price never changed', () => {
        const product = {
            _id: 'p11',
            referencePrice: 100,
            priceHistory: [
                { date: daysAgo(400), prices: [{ price: 100 }] },
                { date: daysAgo(200), prices: [{ price: 100 }] }
            ]
        };
        assert.strictEqual(Charts.hasPriceChangedInTimeframe(product, 0), false);
    });
});
