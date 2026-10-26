const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MongoDatabase = require('../server/db/mongo-database');

describe('Database Optimization - getProducts', () => {
    test('getProducts() without includeHistory does not fetch price_records', async () => {
        const db = new MongoDatabase();
        const mockProducts = [
            { _id: 'prod-1', title: 'Helmet', referencePrice: 150 },
            { _id: 'prod-2', title: 'Jacket', referencePrice: 200 }
        ];

        let priceRecordQueried = false;
        db.Product.find = () => ({ lean: async () => mockProducts });
        db.PriceRecord.find = () => {
            priceRecordQueried = true;
            return {
                sort: () => ({ lean: async () => [] })
            };
        };

        const result = await db.getProducts();

        assert.equal(priceRecordQueried, false, 'PriceRecord.find should not be called when includeHistory is omitted');
        assert.equal(result.length, 2);
        assert.deepEqual(result[0].priceHistory, []);
        assert.deepEqual(result[1].priceHistory, []);
    });

    test('getProducts({ includeHistory: true }) loads and groups price_records', async () => {
        const db = new MongoDatabase();
        const mockProducts = [
            { _id: 'prod-1', title: 'Helmet', referencePrice: 150 }
        ];
        const mockRecords = [
            { _id: 'rec-1', productId: 'prod-1', date: '2026-10-20', prices: [{ sourceIndex: 0, price: 139 }] }
        ];

        let priceRecordQueried = false;
        db.Product.find = () => ({ lean: async () => mockProducts });
        db.PriceRecord.find = () => {
            priceRecordQueried = true;
            return {
                sort: () => ({ lean: async () => mockRecords })
            };
        };

        const result = await db.getProducts({ includeHistory: true });

        assert.equal(priceRecordQueried, true, 'PriceRecord.find should be called when includeHistory is true');
        assert.equal(result.length, 1);
        assert.equal(result[0].priceHistory.length, 1);
        assert.equal(result[0].priceHistory[0].prices[0].price, 139);
    });

    test('_updateVirtuals tracks minPriceEver correctly', () => {
        const db = new MongoDatabase();
        const product = {
            referencePrice: 200,
            minPriceEver: 180,
            sources: [
                { siteName: 'Store A', lastPrice: 160 }
            ]
        };

        db._updateVirtuals(product);

        assert.equal(product.lowestPrice, 160);
        assert.equal(product.minPriceEver, 160, 'minPriceEver should update when new lowest price is lower');
        assert.equal(product.priceDelta, -20);
    });
});
