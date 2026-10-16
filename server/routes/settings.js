const express = require('express');
const router = express.Router();
const db = require('../db/adapter');
const scheduler = require('../jobs/scheduler');
const { validate } = require('../middleware/validate');
const { updateSettingsSchema } = require('../schemas');

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
router.put('/', validate(updateSettingsSchema), async (req, res) => {
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

// GET backup database
router.get('/backup', async (req, res) => {
    try {
        const backup = await db.exportBackup();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `omniprice-backup-${timestamp}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.json(backup);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST restore database
router.post('/restore', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload || typeof payload !== 'object') {
            return res.status(400).json({ error: 'Invalid backup JSON payload' });
        }

        const mode = payload.mode === 'merge' ? 'merge' : 'replace';
        const backupData = payload.data || payload;

        if (!backupData || (typeof backupData !== 'object')) {
            return res.status(400).json({ error: 'Backup payload must contain data' });
        }

        const result = await db.importBackup(backupData, mode);

        // Restart scheduler if scrapeFrequency in settings was restored
        scheduler.restart().catch(() => {});

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
