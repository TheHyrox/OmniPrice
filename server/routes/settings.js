const express = require('express');
const router = express.Router();
const db = require('../db/adapter');

// GET settings
router.get('/', async (req, res) => {
    try {
        const settings = await db.getSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT update settings
router.put('/', async (req, res) => {
    try {
        const settings = await db.updateSettings(req.body);
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
