const test = require('node:test');
const assert = require('node:assert/strict');
const alertChecker = require('../server/services/alert-checker');
const db = require('../server/db/adapter');
const discord = require('../server/services/discord');
const webPush = require('../server/services/web-push');

test('AlertChecker - Trigger Evaluation', async (t) => {
    // Save original methods
    const originalGetAlertsByProductId = db.primary.getAlertsByProductId;
    const originalUpdateAlert = db.primary.updateAlert;
    const originalGetPriceHistory = db.primary.getPriceHistory;

    // Mock discord and webPush to avoid external I/O and DB timeout during unit tests
    const originalSendPriceAlert = discord.sendPriceAlert;
    const originalSendPriceRiseAlert = discord.sendPriceRiseAlert;
    const originalSendPercentageDropAlert = discord.sendPercentageDropAlert;
    const originalSendAllTimeLowAlert = discord.sendAllTimeLowAlert;
    const originalSendNotificationToAll = webPush.sendNotificationToAll;

    discord.sendPriceAlert = async () => ({ success: true });
    discord.sendPriceRiseAlert = async () => ({ success: true });
    discord.sendPercentageDropAlert = async () => ({ success: true });
    discord.sendAllTimeLowAlert = async () => ({ success: true });
    webPush.sendNotificationToAll = async () => ({ sent: 0, failed: 0 });

    let updatedAlerts = [];
    db.primary.updateAlert = async (id, data) => {
        updatedAlerts.push({ id, ...data });
        return { _id: id, ...data };
    };

    t.after(() => {
        db.primary.getAlertsByProductId = originalGetAlertsByProductId;
        db.primary.updateAlert = originalUpdateAlert;
        db.primary.getPriceHistory = originalGetPriceHistory;

        discord.sendPriceAlert = originalSendPriceAlert;
        discord.sendPriceRiseAlert = originalSendPriceRiseAlert;
        discord.sendPercentageDropAlert = originalSendPercentageDropAlert;
        discord.sendAllTimeLowAlert = originalSendAllTimeLowAlert;
        webPush.sendNotificationToAll = originalSendNotificationToAll;
    });

    await t.test('percentage_drop triggers when price drops by more than threshold %', async () => {
        updatedAlerts = [];
        const product = {
            _id: 'prod-1',
            title: 'Test Helmet',
            referencePrice: 100,
            lowestPrice: 80, // 20% drop
            lowestPriceSource: { siteName: 'Store A', url: 'https://example.com' }
        };

        db.primary.getAlertsByProductId = async () => [{
            _id: 'alert-pct-1',
            productId: 'prod-1',
            alertType: 'percentage_drop',
            thresholdPercent: 15,
            active: true,
            lastTriggeredAt: null,
            lastTriggeredPrice: null
        }];

        await alertChecker.checkProduct(product);

        assert.equal(updatedAlerts.length, 1);
        assert.equal(updatedAlerts[0].id, 'alert-pct-1');
        assert.equal(updatedAlerts[0].lastTriggeredPrice, 80);
        assert.equal(updatedAlerts[0].targetPrice, 85);
        assert.ok(updatedAlerts[0].lastTriggeredAt);
    });

    await t.test('percentage_drop does not trigger when price drop is below threshold %', async () => {
        updatedAlerts = [];
        const product = {
            _id: 'prod-1',
            title: 'Test Helmet',
            referencePrice: 100,
            lowestPrice: 90, // only 10% drop, alert is 15%
            lowestPriceSource: { siteName: 'Store A', url: 'https://example.com' }
        };

        db.primary.getAlertsByProductId = async () => [{
            _id: 'alert-pct-2',
            productId: 'prod-1',
            alertType: 'percentage_drop',
            thresholdPercent: 15,
            active: true,
            lastTriggeredAt: null,
            lastTriggeredPrice: null
        }];

        await alertChecker.checkProduct(product);

        assert.equal(updatedAlerts.length, 0);
    });

    await t.test('all-time low (atl) triggers when current price hits historic record', async () => {
        updatedAlerts = [];
        const product = {
            _id: 'prod-2',
            title: 'Leather Jacket',
            referencePrice: 300,
            lowestPrice: 199,
            priceHistory: [
                { prices: [{ price: 280 }, { price: 250 }] },
                { prices: [{ price: 230 }] }
            ],
            lowestPriceSource: { siteName: 'Store B', url: 'https://example.com' }
        };

        db.primary.getAlertsByProductId = async () => [{
            _id: 'alert-atl-1',
            productId: 'prod-2',
            alertType: 'atl',
            active: true,
            lastTriggeredAt: null,
            lastTriggeredPrice: null
        }];

        await alertChecker.checkProduct(product);

        assert.equal(updatedAlerts.length, 1);
        assert.equal(updatedAlerts[0].id, 'alert-atl-1');
        assert.equal(updatedAlerts[0].lastTriggeredPrice, 199);
        assert.ok(updatedAlerts[0].lastTriggeredAt);
    });

    await t.test('all-time low (atl) does not trigger if current price is above historical minimum', async () => {
        updatedAlerts = [];
        const product = {
            _id: 'prod-2',
            title: 'Leather Jacket',
            referencePrice: 300,
            lowestPrice: 240,
            priceHistory: [
                { prices: [{ price: 200 }] } // historic min is 200, current is 240
            ],
            lowestPriceSource: { siteName: 'Store B', url: 'https://example.com' }
        };

        db.primary.getAlertsByProductId = async () => [{
            _id: 'alert-atl-2',
            productId: 'prod-2',
            alertType: 'atl',
            active: true,
            lastTriggeredAt: null,
            lastTriggeredPrice: null
        }];

        await alertChecker.checkProduct(product);

        assert.equal(updatedAlerts.length, 0);
    });

    await t.test('re-arms percentage_drop alert when price bounces back up', async () => {
        updatedAlerts = [];
        const product = {
            _id: 'prod-1',
            title: 'Test Helmet',
            referencePrice: 100,
            lowestPrice: 95, // rose back above 85
            lowestPriceSource: { siteName: 'Store A', url: 'https://example.com' }
        };

        db.primary.getAlertsByProductId = async () => [{
            _id: 'alert-pct-rearm',
            productId: 'prod-1',
            alertType: 'percentage_drop',
            thresholdPercent: 15,
            active: true,
            lastTriggeredAt: '2026-10-15T00:00:00.000Z',
            lastTriggeredPrice: 80,
            notifyOnRise: false
        }];

        await alertChecker.checkProduct(product);

        assert.equal(updatedAlerts.length, 1);
        assert.equal(updatedAlerts[0].id, 'alert-pct-rearm');
        assert.equal(updatedAlerts[0].lastTriggeredAt, null);
        assert.equal(updatedAlerts[0].lastTriggeredPrice, null);
    });
});
