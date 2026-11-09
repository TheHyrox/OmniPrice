const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../server/utils/logger');
const adminApp = require('../server/admin');

describe('Admin Telemetry & Logger', () => {
    test('captures and formats logs with correct level and component', () => {
        logger.clearLogs();
        logger.addLog('info', 'scraper', 'Test scraping message');
        logger.addLog('error', 'scheduler', 'Test scheduler error');

        const logs = logger.getLogs();
        assert.equal(logs.length, 2);
        assert.equal(logs[0].level, 'info');
        assert.equal(logs[0].component, 'scraper');
        assert.equal(logs[1].level, 'error');
        assert.equal(logs[1].component, 'scheduler');
    });

    test('filters logs by level and component', () => {
        logger.clearLogs();
        logger.addLog('info', 'scraper', 'Info scraper message');
        logger.addLog('warn', 'scraper', 'Warn scraper message');
        logger.addLog('error', 'scheduler', 'Error scheduler message');

        const errorLogs = logger.getLogs({ level: 'error' });
        assert.equal(errorLogs.length, 1);
        assert.equal(errorLogs[0].component, 'scheduler');

        const scraperLogs = logger.getLogs({ component: 'scraper' });
        assert.equal(scraperLogs.length, 2);
    });

    test('records and queries client browser errors', () => {
        logger.clearClientErrors();
        logger.addClientError({
            message: 'Uncaught TypeError: Cannot read properties of undefined',
            stack: 'TypeError at app.js:42:15',
            url: 'http://localhost:3005/products',
            userAgent: 'Mozilla/5.0 Test'
        });

        const clientErrors = logger.getClientErrors();
        assert.equal(clientErrors.length, 1);
        assert.equal(clientErrors[0].message, 'Uncaught TypeError: Cannot read properties of undefined');
        assert.equal(clientErrors[0].url, 'http://localhost:3005/products');
        assert.equal(clientErrors[0].type, 'uncaught_exception');
    });

    test('calculates correct log statistics', () => {
        logger.clearLogs();
        logger.addLog('error', 'scraper', 'Err 1');
        logger.addLog('error', 'db', 'Err 2');
        logger.addLog('warn', 'puppeteer', 'Warn 1');
        logger.addLog('info', 'system', 'Info 1');

        const stats = logger.getStats();
        assert.equal(stats.totalLogs, 4);
        assert.equal(stats.errorCount, 2);
        assert.equal(stats.warnCount, 1);
        assert.equal(stats.infoCount, 1);
    });
});
