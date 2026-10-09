const express = require('express');
const router = express.Router();
const db = require('../db/adapter');

// GET all preset stores
router.get('/', async (req, res) => {
    try {
        const stores = await db.getStores();
        res.json(stores);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST create preset store
router.post('/', async (req, res) => {
    try {
        const { name, cssSelector, defaultUrl } = req.body;
        if (!name || !cssSelector) {
            return res.status(400).json({ error: 'Name and cssSelector are required' });
        }
        const store = await db.createStore({ name, cssSelector, defaultUrl });
        res.status(201).json(store);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// PUT update preset store (syncs products if requested or auto-syncs selector updates)
router.put('/:id', async (req, res) => {
    try {
        const { name, cssSelector, defaultUrl, syncProducts } = req.body;
        const oldStore = await db.getStoreById(req.params.id);
        if (!oldStore) {
            return res.status(404).json({ error: 'Store not found' });
        }

        const updatedStore = await db.updateStore(req.params.id, { name, cssSelector, defaultUrl });

        let updatedProductsCount = 0;
        if (syncProducts !== false) {
            updatedProductsCount = await db.syncProductsWithStore(oldStore.name, updatedStore.name, updatedStore.cssSelector);
        }

        res.json({ store: updatedStore, updatedProductsCount });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE preset store
router.delete('/:id', async (req, res) => {
    try {
        const store = await db.getStoreById(req.params.id);
        if (!store) {
            return res.status(404).json({ error: 'Store not found' });
        }
        await db.deleteStore(req.params.id);
        res.json({ message: 'Store deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST sync all products with preset stores
router.post('/sync-all', async (req, res) => {
    try {
        const result = await db.syncAllProductsWithStores();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
