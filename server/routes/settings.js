const express = require('express');
const router = express.Router();
const db = require('../db/adapter');
const scheduler = require('../jobs/scheduler');

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

        // Restart the scheduler if the scrape frequency changed
        if (req.body.scrapeFrequency !== undefined) {
            scheduler.restart().catch(err =>
                console.error('Failed to restart scheduler after settings update:', err.message)
            );
        }

        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
