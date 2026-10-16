const test = require('node:test');
const assert = require('node:assert/strict');
const MongoDatabase = require('../server/db/mongo-database');

test('Backup & Restore - Database Operations', async (t) => {
    const db = new MongoDatabase();

    // Mock Mongoose model queries
    const mockProducts = [
        { _id: 'prod-1', title: 'Helmet', referencePrice: 150 },
        { _id: 'prod-2', title: 'Gloves', referencePrice: 45 }
    ];
    const mockPriceRecords = [
        { _id: 'rec-1', productId: 'prod-1', date: '2026-10-15', prices: [{ sourceIndex: 0, price: 140 }] }
    ];
    const mockStores = [
        { _id: 'store-1', name: 'Louis Moto', cssSelector: '.price' }
    ];
    const mockAlerts = [
        { _id: 'alert-1', productId: 'prod-1', alertType: 'drop', targetPrice: 130 }
    ];
    const mockSettings = { _id: 'default_settings', theme: 'dark', scrapeFrequency: 3600000 };

    db.Product.find = () => ({ lean: async () => mockProducts });
    db.PriceRecord.find = () => ({ lean: async () => mockPriceRecords });
    db.Store.find = () => ({ lean: async () => mockStores });
    db.Alert.find = () => ({ lean: async () => mockAlerts });
    db.Setting.findOne = () => ({ lean: async () => mockSettings });

    await t.test('exportBackup exports complete snapshot with stats and metadata', async () => {
        const backup = await db.exportBackup();

        assert.equal(backup.app, 'omniprice');
        assert.equal(backup.version, '2.0.0');
        assert.ok(backup.exportedAt);
        assert.deepEqual(backup.stats, {
            productsCount: 2,
            priceRecordsCount: 1,
            storesCount: 1,
            alertsCount: 1
        });
        assert.deepEqual(backup.data.products, mockProducts);
        assert.deepEqual(backup.data.priceRecords, mockPriceRecords);
        assert.deepEqual(backup.data.stores, mockStores);
        assert.deepEqual(backup.data.alerts, mockAlerts);
        assert.deepEqual(backup.data.settings, mockSettings);
    });

    await t.test('importBackup in replace mode removes existing and inserts new collections', async () => {
        let deleted = [];
        let inserted = {};

        db.Product.deleteMany = async () => deleted.push('Product');
        db.PriceRecord.deleteMany = async () => deleted.push('PriceRecord');
        db.Store.deleteMany = async () => deleted.push('Store');
        db.Alert.deleteMany = async () => deleted.push('Alert');

        db.Product.insertMany = async (items) => { inserted.products = items; };
        db.PriceRecord.insertMany = async (items) => { inserted.priceRecords = items; };
        db.Store.insertMany = async (items) => { inserted.stores = items; };
        db.Alert.insertMany = async (items) => { inserted.alerts = items; };
        db.Setting.findOneAndUpdate = async (q, u) => { inserted.settings = u.$set; };

        const payload = {
            data: {
                products: [{ _id: 'p-new', title: 'Boots' }],
                priceRecords: [{ _id: 'r-new', productId: 'p-new', prices: [] }],
                stores: [{ _id: 's-new', name: 'Dafy' }],
                alerts: [{ _id: 'a-new', productId: 'p-new' }],
                settings: { theme: 'light' }
            }
        };

        const result = await db.importBackup(payload, 'replace');

        assert.equal(result.success, true);
        assert.equal(result.mode, 'replace');
        assert.equal(deleted.length, 4);
        assert.equal(result.restored.products, 1);
        assert.equal(result.restored.priceRecords, 1);
        assert.equal(result.restored.stores, 1);
        assert.equal(result.restored.alerts, 1);
        assert.equal(result.restored.settings, true);
        assert.equal(inserted.products[0].title, 'Boots');
    });

    await t.test('importBackup in merge mode upserts documents without deleting', async () => {
        let deleted = [];
        let upserted = [];

        db.Product.deleteMany = async () => deleted.push('Product');
        db.Product.findOneAndUpdate = async (filter, update) => {
            upserted.push({ collection: 'Product', filter, update });
        };
        db.PriceRecord.findOneAndUpdate = async (filter, update) => {
            upserted.push({ collection: 'PriceRecord', filter, update });
        };
        db.Store.findOneAndUpdate = async (filter, update) => {
            upserted.push({ collection: 'Store', filter, update });
        };
        db.Alert.findOneAndUpdate = async (filter, update) => {
            upserted.push({ collection: 'Alert', filter, update });
        };
        db.Setting.findOneAndUpdate = async () => {};

        const payload = {
            products: [{ _id: 'p-merge-1', title: 'Jacket' }],
            stores: [{ _id: 's-merge-1', name: 'Store' }]
        };

        const result = await db.importBackup(payload, 'merge');

        assert.equal(result.success, true);
        assert.equal(result.mode, 'merge');
        assert.equal(deleted.length, 0); // Must not delete anything in merge mode
        assert.equal(upserted.length, 2);
        assert.equal(upserted[0].filter._id, 'p-merge-1');
    });
});
