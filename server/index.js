require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const db = require('./db/adapter');
const productRoutes = require('./routes/products');
const scraperRoutes = require('./routes/scraper');
const settingsRoutes = require('./routes/settings');
const storeRoutes = require('./routes/stores');
const alertRoutes = require('./routes/alerts');
const bundleRoutes = require('./routes/bundles');
const scheduler = require('./jobs/scheduler');
const scraper = require('./services/scraper');
const { apiLimiter } = require('./middleware/rate-limiters');

const app = express();
const PORT = config.PORT || process.env.PORT || 3005;

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', apiLimiter);
app.use('/api/products', productRoutes);
app.use('/api/scraper', scraperRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/bundles', bundleRoutes);

// Backup & Restore aliases for direct /api/backup and /api/backup/export calls
app.get(['/api/backup', '/api/backup/export'], (req, res, next) => {
    req.url = '/backup';
    settingsRoutes(req, res, next);
});
app.post(['/api/backup', '/api/backup/restore'], (req, res, next) => {
    req.url = '/restore';
    settingsRoutes(req, res, next);
});

// Explicit 404 handler for API routes to prevent falling back to index.html
app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API endpoint ${req.method} ${req.originalUrl} not found` });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const startServer = async () => {
    try {
        await db.init();
        
        app.listen(PORT, () => {
            console.log(`OmniPrice running at http://localhost:${PORT}`);
            scheduler.start();
        });
    } catch (error) {
        console.error('Error starting server:', error.message);
        process.exit(1);
    }
};

/**
 * Graceful shutdown — called on SIGINT (Ctrl+C) and SIGTERM (Docker stop).
 * Stops the scheduler and closes the Puppeteer browser so no zombie
 * Chrome processes are left behind.
 */
async function gracefulShutdown(signal) {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    scheduler.stop();
    try {
        await scraper.closeBrowser();
        console.log('Puppeteer browser closed');
    } catch (err) {
        console.error('Error closing Puppeteer browser:', err.message);
    }
    process.exit(0);
}

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();

module.exports = app;
