const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');

// SSE: Live Server-Sent Events stream for real-time console logs
router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in Pangolin / Nginx

    // Send initial snapshot of recent logs
    const initialLogs = logger.getLogs({ limit: 150 });
    res.write(`event: init\ndata: ${JSON.stringify({ logs: initialLogs })}\n\n`);

    const onLog = (entry) => {
        try {
            res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
        } catch (_) {}
    };

    const onClientError = (clientErr) => {
        try {
            res.write(`event: client-error\ndata: ${JSON.stringify(clientErr)}\n\n`);
        } catch (_) {}
    };

    const onClear = () => {
        try {
            res.write(`event: clear\ndata: {}\n\n`);
        } catch (_) {}
    };

    logger.on('log', onLog);
    logger.on('client-error', onClientError);
    logger.on('clear', onClear);

    // Keep-alive heartbeat every 15s to keep proxy connections healthy
    const heartbeat = setInterval(() => {
        try {
            res.write(': ping\n\n');
        } catch (_) {}
    }, 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
        logger.removeListener('log', onLog);
        logger.removeListener('client-error', onClientError);
        logger.removeListener('clear', onClear);
    });
});

// GET filtered logs
router.get('/', (req, res) => {
    const { limit, level, component, search, sinceId } = req.query;
    const logs = logger.getLogs({ limit, level, component, search, sinceId });
    res.json({
        total: logs.length,
        logs
    });
});

// DELETE clear all logs
router.delete('/', (req, res) => {
    logger.clearLogs();
    res.json({ success: true, message: 'Server logs cleared' });
});

// GET client browser errors
router.get('/client-errors', (req, res) => {
    const { limit, search } = req.query;
    const errors = logger.getClientErrors({ limit, search });
    res.json({
        total: errors.length,
        errors
    });
});

// DELETE clear client browser errors
router.delete('/client-errors', (req, res) => {
    logger.clearClientErrors();
    res.json({ success: true, message: 'Client browser errors cleared' });
});

// POST simulate / trigger test log (useful for testing SSE & verification)
router.post('/test', (req, res) => {
    const { level = 'error', message = 'Simulated test error from Admin Dashboard', component = 'admin' } = req.body;
    
    if (level === 'error') {
        console.error(`[${component}] ${message}`);
    } else if (level === 'warn') {
        console.warn(`[${component}] ${message}`);
    } else {
        console.log(`[${component}] ${message}`);
    }

    res.json({
        success: true,
        message: 'Log entry emitted',
        level,
        component
    });
});

module.exports = router;
