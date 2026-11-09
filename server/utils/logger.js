const EventEmitter = require('events');
const util = require('util');

class Logger extends EventEmitter {
    constructor(maxEntries = 1000) {
        super();
        this.maxEntries = maxEntries;
        this.logs = [];
        this.clientErrors = [];
        this.maxClientErrors = 200;
        this.nextId = 1;
        this.nextClientErrorId = 1;
        this.isInitialized = false;

        // Keep references to original console methods
        this.originalConsole = {
            log: console.log.bind(console),
            info: console.info.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console)
        };
    }

    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        const self = this;

        console.log = function (...args) {
            self.originalConsole.log(...args);
            self._captureConsole('info', args);
        };

        console.info = function (...args) {
            self.originalConsole.info(...args);
            self._captureConsole('info', args);
        };

        console.warn = function (...args) {
            self.originalConsole.warn(...args);
            self._captureConsole('warn', args);
        };

        console.error = function (...args) {
            self.originalConsole.error(...args);
            self._captureConsole('error', args);
        };

        // Listen for unhandled errors at process level
        process.on('unhandledRejection', (reason) => {
            const msg = reason && reason.stack ? reason.stack : String(reason);
            self.addLog('error', 'process', `Unhandled Rejection: ${msg}`);
        });

        process.on('uncaughtException', (err) => {
            const msg = err && err.stack ? err.stack : String(err);
            self.addLog('error', 'process', `Uncaught Exception: ${msg}`);
        });
    }

    _detectComponent(text) {
        if (!text || typeof text !== 'string') return 'system';

        const bracketMatch = text.match(/\[([a-zA-Z0-9_\- ]+)\]/);
        if (bracketMatch) {
            const tag = bracketMatch[1].trim().toLowerCase();
            if (tag.includes('scraper')) return 'scraper';
            if (tag.includes('alert')) return 'alert';
            if (tag.includes('scheduler')) return 'scheduler';
            if (tag.includes('discord')) return 'discord';
            if (tag.includes('webpush') || tag.includes('push')) return 'push';
            if (tag.includes('client')) return 'client';
            if (tag.includes('mongo') || tag.includes('db')) return 'database';
            if (tag.includes('http') || tag.includes('api')) return 'http';
            if (tag.includes('config')) return 'config';
            return tag;
        }

        const lower = text.toLowerCase();
        if (lower.includes('puppeteer') || lower.includes('cheerio') || lower.includes('scrape') || lower.includes('scraping')) return 'scraper';
        if (lower.includes('scheduler')) return 'scheduler';
        if (lower.includes('alert')) return 'alert';
        if (lower.includes('mongo') || lower.includes('database')) return 'database';
        if (lower.includes('discord')) return 'discord';
        if (lower.includes('vapid') || lower.includes('webpush')) return 'push';
        if (lower.includes('client') || lower.includes('browser')) return 'client';

        return 'system';
    }

    _captureConsole(defaultLevel, args) {
        try {
            const formatted = util.format(...args);
            let level = defaultLevel;

            // Auto-detect error/warn keywords if logged via console.log
            if (level === 'info') {
                const lower = formatted.toLowerCase();
                if (lower.includes('[failed]') || lower.includes('error:') || lower.includes('scrape error')) {
                    level = 'error';
                } else if (lower.includes('warn:') || lower.includes('warning:') || lower.includes('retry')) {
                    level = 'warn';
                }
            }

            const component = this._detectComponent(formatted);

            // Separate details if first argument was a string and an Error object followed
            let details = null;
            for (let i = 1; i < args.length; i++) {
                if (args[i] instanceof Error) {
                    details = args[i].stack || args[i].message;
                    break;
                }
            }

            this.addLog(level, component, formatted, details);
        } catch (_) {
            // Failsafe: never break console
        }
    }

    addLog(level, component, message, details = null) {
        const entry = {
            id: this.nextId++,
            timestamp: new Date().toISOString(),
            level: level || 'info',
            component: component || 'system',
            message: String(message),
            details: details ? String(details) : null
        };

        this.logs.push(entry);
        if (this.logs.length > this.maxEntries) {
            this.logs.shift();
        }

        this.emit('log', entry);
        return entry;
    }

    addClientError(payload) {
        const errorRecord = {
            id: this.nextClientErrorId++,
            timestamp: new Date().toISOString(),
            type: payload.type || 'uncaught_exception',
            message: String(payload.message || 'Unknown browser error'),
            stack: payload.stack ? String(payload.stack) : '',
            source: payload.source || payload.url || 'unknown',
            lineno: payload.lineno || null,
            colno: payload.colno || null,
            url: payload.url || '',
            userAgent: payload.userAgent || '',
            ip: payload.ip || 'unknown'
        };

        this.clientErrors.unshift(errorRecord);
        if (this.clientErrors.length > this.maxClientErrors) {
            this.clientErrors.pop();
        }

        // Also add to console log stream so it's visible in the live console
        this.addLog('error', 'client', `[Client] ${errorRecord.message} (${errorRecord.url || errorRecord.source})`, errorRecord.stack);

        this.emit('client-error', errorRecord);
        return errorRecord;
    }

    getLogs(options = {}) {
        let results = [...this.logs];

        if (options.level && options.level !== 'all') {
            results = results.filter(e => e.level.toLowerCase() === options.level.toLowerCase());
        }

        if (options.component && options.component !== 'all') {
            results = results.filter(e => e.component.toLowerCase() === options.component.toLowerCase());
        }

        if (options.search) {
            const q = options.search.toLowerCase();
            results = results.filter(e => 
                (e.message && e.message.toLowerCase().includes(q)) ||
                (e.details && e.details.toLowerCase().includes(q)) ||
                (e.component && e.component.toLowerCase().includes(q))
            );
        }

        if (options.sinceId) {
            const sid = Number(options.sinceId);
            results = results.filter(e => e.id > sid);
        }

        const limit = Math.min(Number(options.limit) || 200, 1000);
        if (results.length > limit) {
            results = results.slice(results.length - limit);
        }

        return results;
    }

    getClientErrors(options = {}) {
        let results = [...this.clientErrors];

        if (options.search) {
            const q = options.search.toLowerCase();
            results = results.filter(e => 
                (e.message && e.message.toLowerCase().includes(q)) ||
                (e.url && e.url.toLowerCase().includes(q)) ||
                (e.source && e.source.toLowerCase().includes(q))
            );
        }

        const limit = Math.min(Number(options.limit) || 100, 500);
        return results.slice(0, limit);
    }

    clearLogs() {
        this.logs = [];
        this.emit('clear');
        return { success: true };
    }

    clearClientErrors() {
        this.clientErrors = [];
        return { success: true };
    }

    getStats() {
        let errors = 0;
        let warnings = 0;
        let info = 0;

        for (const log of this.logs) {
            if (log.level === 'error') errors++;
            else if (log.level === 'warn') warnings++;
            else info++;
        }

        return {
            totalLogs: this.logs.length,
            errorCount: errors,
            warnCount: warnings,
            infoCount: info,
            clientErrorCount: this.clientErrors.length
        };
    }
}

const singleton = new Logger();
singleton.init();

module.exports = singleton;
