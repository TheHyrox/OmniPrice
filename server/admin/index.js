const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('../utils/logger');

const metricsRouter = require('./routes/metrics');
const issuesRouter = require('./routes/issues');
const logsRouter = require('./routes/logs');
const scraperDebugRouter = require('./routes/scraper-debug');

const app = express();

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Client error ingestion endpoint
app.post(['/api/client-errors', '/api/admin/client-errors'], (req, res) => {
    try {
        const payload = req.body || {};
        payload.ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        logger.addClientError(payload);
        res.status(200).json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// Admin API endpoints
app.use('/api/admin/metrics', metricsRouter);
app.use('/api/admin/issues', issuesRouter);
app.use('/api/admin/logs', logsRouter);
app.use('/api/admin/scraper', scraperDebugRouter);

// Serve Admin UI static files
app.use(express.static(path.join(__dirname, 'public')));

// Admin UI SPA Fallback
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: `Admin API endpoint ${req.method} ${req.originalUrl} not found` });
    }
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.addLog('error', 'admin', `Admin Express Error: ${err.message}`, err.stack);
    res.status(500).json({ error: 'Internal Admin Server Error', details: err.message });
});

module.exports = app;
