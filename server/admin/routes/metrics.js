const express = require('express');
const router = express.Router();
const os = require('os');
const db = require('../../db/adapter');
const scheduler = require('../../jobs/scheduler');
const config = require('../../config');
const logger = require('../../utils/logger');
const scraper = require('../../services/scraper');

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

router.get('/', async (req, res) => {
    try {
        const mem = process.memoryUsage();
        const totalSysMem = os.totalmem();
        const freeSysMem = os.freemem();
        const usedSysMem = totalSysMem - freeSysMem;

        let dbStats = {
            status: 'unknown',
            totalProducts: 0,
            activeProducts: 0,
            totalSources: 0,
            failingSources: 0,
            totalAlerts: 0,
            totalStores: 0,
            totalBundles: 0
        };

        try {
            const products = await db.getProducts({ includeHistory: false });
            const stores = await db.getStores();
            const alerts = await db.getAlerts();
            const bundles = await db.getBundles();

            let totalSources = 0;
            let failingSources = 0;
            let activeProducts = 0;

            for (const p of products) {
                if (p.active !== false && !p.archived) activeProducts++;
                if (Array.isArray(p.sources)) {
                    totalSources += p.sources.length;
                    for (const s of p.sources) {
                        if (s.lastStatus === 'error') failingSources++;
                    }
                }
            }

            dbStats = {
                status: 'connected',
                totalProducts: products.length,
                activeProducts,
                totalSources,
                failingSources,
                totalAlerts: (alerts || []).length,
                totalStores: (stores || []).length,
                totalBundles: (bundles || []).length
            };
        } catch (dbErr) {
            dbStats.status = 'error';
            dbStats.error = dbErr.message;
        }

        let schedulerFrequency = 0;
        let lastScrapeTime = 0;
        try {
            schedulerFrequency = await scheduler.getFrequency();
            lastScrapeTime = await scheduler.getLastGlobalScrapeTime();
        } catch (_) {}

        const logStats = logger.getStats();

        res.json({
            timestamp: new Date().toISOString(),
            process: {
                uptimeSeconds: Math.floor(process.uptime()),
                uptimeFormatted: formatUptime(process.uptime()),
                pid: process.pid,
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                memory: {
                    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10,
                    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024 * 10) / 10,
                    rssMB: Math.round(mem.rss / 1024 / 1024 * 10) / 10,
                    externalMB: Math.round(mem.external / 1024 / 1024 * 10) / 10
                }
            },
            system: {
                cpuCount: os.cpus().length,
                loadAverage: os.loadavg(),
                totalMemMB: Math.round(totalSysMem / 1024 / 1024),
                freeMemMB: Math.round(freeSysMem / 1024 / 1024),
                usedMemMB: Math.round(usedSysMem / 1024 / 1024),
                usedPercent: Math.round((usedSysMem / totalSysMem) * 100)
            },
            database: dbStats,
            scheduler: {
                isRunning: Boolean(scheduler.intervalId),
                frequencyMs: schedulerFrequency,
                frequencyHours: Math.round((schedulerFrequency / 3600000) * 10) / 10,
                lastGlobalScrape: lastScrapeTime ? new Date(lastScrapeTime).toISOString() : null
            },
            scraper: {
                puppeteerConcurrency: config.PUPPETEER_CONCURRENCY,
                allowPrivateNetwork: config.ALLOW_PRIVATE_NETWORK
            },
            ports: {
                main: config.PORT,
                admin: config.ADMIN_PORT
            },
            logs: logStats
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
