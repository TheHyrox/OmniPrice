const test = require('node:test');
const assert = require('node:assert/strict');
const { createAlertSchema, updateAlertSchema, testScrapeSchema } = require('../server/schemas');

test('Schema - createAlertSchema', async (t) => {
    await t.test('accepts valid drop alert with default alertType', () => {
        const input = {
            productId: 'prod-123',
            targetPrice: 199.99
        };
        const parsed = createAlertSchema.parse(input);
        assert.equal(parsed.productId, 'prod-123');
        assert.equal(parsed.targetPrice, 199.99);
        assert.equal(parsed.alertType, 'drop');
        assert.equal(parsed.notifyOnRise, false);
        assert.equal(parsed.active, true);
    });

    await t.test('accepts rise alert with notifyOnRise true', () => {
        const input = {
            productId: 'prod-456',
            targetPrice: 250,
            alertType: 'rise',
            notifyOnRise: true,
            webhookUrl: 'https://discord.com/api/webhooks/123/abc'
        };
        const parsed = createAlertSchema.parse(input);
        assert.equal(parsed.alertType, 'rise');
        assert.equal(parsed.notifyOnRise, true);
        assert.equal(parsed.webhookUrl, 'https://discord.com/api/webhooks/123/abc');
    });

    await t.test('accepts percentage_drop alert with thresholdPercent', () => {
        const input = {
            productId: 'prod-pct',
            alertType: 'percentage_drop',
            thresholdPercent: 15,
            notifyOnRise: true
        };
        const parsed = createAlertSchema.parse(input);
        assert.equal(parsed.productId, 'prod-pct');
        assert.equal(parsed.alertType, 'percentage_drop');
        assert.equal(parsed.thresholdPercent, 15);
        assert.equal(parsed.notifyOnRise, true);
    });

    await t.test('rejects percentage_drop alert without thresholdPercent', () => {
        const input = {
            productId: 'prod-pct',
            alertType: 'percentage_drop'
        };
        assert.throws(() => createAlertSchema.parse(input));
    });

    await t.test('accepts all-time low (atl) alert without targetPrice', () => {
        const input = {
            productId: 'prod-atl',
            alertType: 'atl'
        };
        const parsed = createAlertSchema.parse(input);
        assert.equal(parsed.productId, 'prod-atl');
        assert.equal(parsed.alertType, 'atl');
        assert.equal(parsed.active, true);
    });

    await t.test('rejects invalid alertType', () => {
        const input = {
            productId: 'prod-789',
            targetPrice: 50,
            alertType: 'invalid-type'
        };
        assert.throws(() => createAlertSchema.parse(input));
    });
});

test('Schema - updateAlertSchema', async (t) => {
    await t.test('allows partial update of alertType and notifyOnRise', () => {
        const input = {
            alertType: 'rise',
            notifyOnRise: true
        };
        const parsed = updateAlertSchema.parse(input);
        assert.equal(parsed.alertType, 'rise');
        assert.equal(parsed.notifyOnRise, true);
    });
});

test('Schema - testScrapeSchema', async (t) => {
    await t.test('accepts valid test scrape request', () => {
        const input = {
            url: 'https://example.com/product/1',
            cssSelector: '.price-now',
            usePuppeteer: true
        };
        const parsed = testScrapeSchema.parse(input);
        assert.equal(parsed.url, 'https://example.com/product/1');
        assert.equal(parsed.cssSelector, '.price-now');
        assert.equal(parsed.usePuppeteer, true);
    });

    await t.test('rejects invalid url', () => {
        const input = {
            url: 'not-a-valid-url',
            cssSelector: '.price'
        };
        assert.throws(() => testScrapeSchema.parse(input));
    });
});
