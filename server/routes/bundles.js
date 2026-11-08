const express = require('express');
const router = express.Router();
const db = require('../db/adapter');
const { validate } = require('../middleware/validate');
const { createBundleSchema, updateBundleSchema } = require('../schemas');

/**
 * Helper to normalize date string to YYYY-MM-DD
 */
function normalizeDateStr(dateInput) {
    if (!dateInput) return null;
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput).slice(0, 10);
        return d.toISOString().slice(0, 10);
    } catch {
        return String(dateInput).slice(0, 10);
    }
}

/**
 * Compute combined price evolution timeline across multiple products
 */
function computeBundleTimeline(productsWithHistory) {
    if (!productsWithHistory || productsWithHistory.length === 0) return [];

    // Map: productId -> Map<dateStr, lowestPrice>
    const productDailyPrices = new Map();
    const allDatesSet = new Set();

    productsWithHistory.forEach(prod => {
        const pId = String(prod._id);
        const dailyMap = new Map();
        const history = prod.priceHistory || [];

        history.forEach(entry => {
            const dateStr = normalizeDateStr(entry.date);
            if (!dateStr) return;
            allDatesSet.add(dateStr);

            let lowestOnDate = Infinity;
            (entry.prices || []).forEach(p => {
                if (p.price != null && !isNaN(p.price) && p.price > 0 && p.price < lowestOnDate) {
                    lowestOnDate = Number(p.price);
                }
            });

            if (lowestOnDate !== Infinity) {
                // If multiple scrapes in same day, keep lowest
                const existing = dailyMap.get(dateStr);
                if (existing == null || lowestOnDate < existing) {
                    dailyMap.set(dateStr, lowestOnDate);
                }
            }
        });

        // Also include today's current lowestPrice if available
        if (prod.lowestPrice != null && prod.lowestPrice > 0) {
            const todayStr = new Date().toISOString().slice(0, 10);
            allDatesSet.add(todayStr);
            const existing = dailyMap.get(todayStr);
            if (existing == null || prod.lowestPrice < existing) {
                dailyMap.set(todayStr, Number(prod.lowestPrice));
            }
        }

        productDailyPrices.set(pId, dailyMap);
    });

    const sortedDates = Array.from(allDatesSet).sort();
    if (sortedDates.length === 0) return [];

    // Forward fill running prices for each product across sorted dates
    const runningPrices = new Map();
    const timeline = [];

    sortedDates.forEach(dateStr => {
        productsWithHistory.forEach(prod => {
            const pId = String(prod._id);
            const dailyMap = productDailyPrices.get(pId);
            if (dailyMap && dailyMap.has(dateStr)) {
                runningPrices.set(pId, dailyMap.get(dateStr));
            }
        });

        // Check if all products have an established price by this date
        const allProductsHavePrice = productsWithHistory.every(prod => runningPrices.has(String(prod._id)));

        if (allProductsHavePrice) {
            let total = 0;
            const productBreakdown = {};
            productsWithHistory.forEach(prod => {
                const pId = String(prod._id);
                const pPrice = runningPrices.get(pId);
                total += pPrice;
                productBreakdown[pId] = pPrice;
            });

            timeline.push({
                date: dateStr,
                totalPrice: Number(total.toFixed(2)),
                productPrices: productBreakdown
            });
        }
    });

    return timeline;
}

// GET all bundles (enriched with current totals and basic items preview)
router.get('/', async (req, res) => {
    try {
        const [bundles, allProducts] = await Promise.all([
            db.getBundles(),
            db.getProducts({ includeHistory: false })
        ]);

        const productMap = new Map(allProducts.map(p => [String(p._id), p]));

        const enriched = bundles.map(bundle => {
            const pIds = bundle.productIds || [];
            const includedProducts = pIds.map(id => productMap.get(String(id))).filter(Boolean);

            let currentPrice = 0;
            let referencePrice = 0;
            let hasMissingPrice = false;

            includedProducts.forEach(p => {
                if (p.lowestPrice != null && p.lowestPrice > 0) {
                    currentPrice += Number(p.lowestPrice);
                } else {
                    hasMissingPrice = true;
                }
                if (p.referencePrice != null && p.referencePrice > 0) {
                    referencePrice += Number(p.referencePrice);
                }
            });

            const savings = (referencePrice > currentPrice && currentPrice > 0)
                ? (referencePrice - currentPrice)
                : 0;
            const savingsPercent = (referencePrice > 0 && savings > 0)
                ? (savings / referencePrice) * 100
                : 0;

            return {
                ...bundle,
                productsCount: includedProducts.length,
                currentPrice: Number(currentPrice.toFixed(2)),
                referencePrice: Number(referencePrice.toFixed(2)),
                savings: Number(savings.toFixed(2)),
                savingsPercent: Number(savingsPercent.toFixed(1)),
                hasMissingPrice,
                products: includedProducts.map(p => ({
                    _id: p._id,
                    title: p.title,
                    image: p.image,
                    lowestPrice: p.lowestPrice,
                    referencePrice: p.referencePrice,
                    lowestPriceSource: p.lowestPriceSource,
                    active: p.active !== false,
                    archived: Boolean(p.archived)
                }))
            };
        });

        res.json(enriched);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET single bundle with full products and combined price history timeline
router.get('/:id', async (req, res) => {
    try {
        const bundle = await db.getBundleById(req.params.id);
        if (!bundle) {
            return res.status(404).json({ error: 'Bundle not found' });
        }

        const pIds = bundle.productIds || [];
        const productsWithHistory = await Promise.all(
            pIds.map(async id => {
                const prod = await db.getProductById(id);
                return prod;
            })
        );

        const validProducts = productsWithHistory.filter(Boolean);

        let currentPrice = 0;
        let referencePrice = 0;
        let hasMissingPrice = false;

        validProducts.forEach(p => {
            if (p.lowestPrice != null && p.lowestPrice > 0) {
                currentPrice += Number(p.lowestPrice);
            } else {
                hasMissingPrice = true;
            }
            if (p.referencePrice != null && p.referencePrice > 0) {
                referencePrice += Number(p.referencePrice);
            }
        });

        const savings = (referencePrice > currentPrice && currentPrice > 0)
            ? (referencePrice - currentPrice)
            : 0;
        const savingsPercent = (referencePrice > 0 && savings > 0)
            ? (savings / referencePrice) * 100
            : 0;

        const timeline = computeBundleTimeline(validProducts);

        let atlPrice = currentPrice;
        if (timeline.length > 0) {
            const minRecorded = Math.min(...timeline.map(t => t.totalPrice));
            atlPrice = Math.min(minRecorded, currentPrice > 0 ? currentPrice : minRecorded);
        }

        res.json({
            ...bundle,
            productsCount: validProducts.length,
            currentPrice: Number(currentPrice.toFixed(2)),
            referencePrice: Number(referencePrice.toFixed(2)),
            savings: Number(savings.toFixed(2)),
            savingsPercent: Number(savingsPercent.toFixed(1)),
            hasMissingPrice,
            atlPrice: Number(atlPrice.toFixed(2)),
            products: validProducts,
            timeline
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST create bundle
router.post('/', validate(createBundleSchema), async (req, res) => {
    try {
        const { name, description, productIds } = req.body;
        const bundle = await db.createBundle({
            name,
            description: description || '',
            productIds
        });
        res.status(201).json(bundle);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// PUT update bundle
router.put('/:id', validate(updateBundleSchema), async (req, res) => {
    try {
        const existing = await db.getBundleById(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Bundle not found' });
        }

        const updated = await db.updateBundle(req.params.id, req.body);
        res.json(updated);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE bundle
router.delete('/:id', async (req, res) => {
    try {
        const existing = await db.getBundleById(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Bundle not found' });
        }

        await db.deleteBundle(req.params.id);
        res.json({ success: true, message: 'Bundle deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
