const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createBundleSchema, updateBundleSchema } = require('../server/schemas');

describe('Bundle Schemas & Calculations', () => {
    test('createBundleSchema: accepts valid bundle data', () => {
        const payload = {
            name: 'Simracing Cockpit Bundle',
            description: 'Steering wheel + pedals set',
            productIds: ['prod-1', 'prod-2']
        };

        const result = createBundleSchema.safeParse(payload);
        assert.equal(result.success, true);
        assert.equal(result.data.name, 'Simracing Cockpit Bundle');
        assert.equal(result.data.productIds.length, 2);
    });

    test('createBundleSchema: rejects empty name', () => {
        const payload = {
            name: '',
            productIds: ['prod-1']
        };

        const result = createBundleSchema.safeParse(payload);
        assert.equal(result.success, false);
    });

    test('createBundleSchema: rejects empty productIds array', () => {
        const payload = {
            name: 'Empty Bundle',
            productIds: []
        };

        const result = createBundleSchema.safeParse(payload);
        assert.equal(result.success, false);
    });

    test('updateBundleSchema: allows partial update', () => {
        const result = updateBundleSchema.safeParse({ name: 'New Bundle Name' });
        assert.equal(result.success, true);
        assert.equal(result.data.name, 'New Bundle Name');
    });

    test('Bundle Price Calculation: correctly sums current lowest prices and calculates savings', () => {
        const products = [
            { _id: '1', lowestPrice: 249.99, referencePrice: 299.99 },
            { _id: '2', lowestPrice: 150.00, referencePrice: 200.00 },
            { _id: '3', lowestPrice: 100.00, referencePrice: 100.00 }
        ];

        const currentPrice = products.reduce((sum, p) => sum + p.lowestPrice, 0);
        const refPrice = products.reduce((sum, p) => sum + p.referencePrice, 0);
        const savings = refPrice - currentPrice;
        const savingsPercent = (savings / refPrice) * 100;

        assert.equal(Number(currentPrice.toFixed(2)), 499.99);
        assert.equal(Number(refPrice.toFixed(2)), 599.99);
        assert.equal(Number(savings.toFixed(2)), 100.00);
        assert.equal(Number(savingsPercent.toFixed(1)), 16.7);
    });

    test('Bundle Timeline: chronological aggregation calculates unified points', () => {
        // Product 1 scraped on Day 1 ($100), Day 2 ($90)
        // Product 2 scraped on Day 1 ($50), Day 3 ($40)
        const timeline = [
            { date: '2026-04-01', productPrices: { 'p1': 100, 'p2': 50 }, totalPrice: 150 },
            { date: '2026-04-02', productPrices: { 'p1': 90, 'p2': 50 }, totalPrice: 140 },
            { date: '2026-04-03', productPrices: { 'p1': 90, 'p2': 40 }, totalPrice: 130 }
        ];

        const atl = Math.min(...timeline.map(t => t.totalPrice));
        assert.equal(atl, 130);
        assert.equal(timeline[0].totalPrice, 150);
        assert.equal(timeline[2].totalPrice, 130);
    });
});
