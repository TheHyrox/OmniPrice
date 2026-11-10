const db = require('../db/adapter');
const scraper = require('../services/scraper');
const alertChecker = require('../services/alert-checker');

class Scheduler {
    constructor() {
        this.intervalId = null;
        this.timeoutId = null;
    }

    async getFrequency() {
        try {
            const settings = await db.getSettings();
            return settings.scrapeFrequency !== undefined ? settings.scrapeFrequency : 43200000; // Default 12h
        } catch {
            return 43200000;
        }
    }

    async getScrapeTime() {
        try {
            const settings = await db.getSettings();
            return settings.scrapeTime || '00:00';
        } catch {
            return '00:00';
        }
    }

    /**
     * Calculates the next execution Date aligned to frequency and scheduled scrapeTime (hh:mm).
     * @param {number} frequency - Interval in ms
     * @param {string} scrapeTime - Time string 'HH:mm'
     * @param {Date} fromTime - Reference date/time (default new Date())
     * @returns {Date|null}
     */
    getNextScheduledTime(frequency, scrapeTime = '00:00', fromTime = new Date()) {
        if (!frequency || frequency <= 0) return null;

        const parts = (scrapeTime || '00:00').split(':').map(Number);
        const hours = (Number.isInteger(parts[0]) && parts[0] >= 0 && parts[0] <= 23) ? parts[0] : 0;
        const minutes = (Number.isInteger(parts[1]) && parts[1] >= 0 && parts[1] <= 59) ? parts[1] : 0;

        const fromMs = fromTime.getTime();

        // For daily (24h), anchor to calendar day so clock hour remains preserved across DST
        if (frequency === 86400000) {
            const todayTarget = new Date(fromTime.getFullYear(), fromTime.getMonth(), fromTime.getDate(), hours, minutes, 0, 0);
            if (todayTarget.getTime() > fromMs) {
                return todayTarget;
            }
            return new Date(fromTime.getFullYear(), fromTime.getMonth(), fromTime.getDate() + 1, hours, minutes, 0, 0);
        }

        const anchor = new Date(fromTime.getFullYear(), fromTime.getMonth(), fromTime.getDate(), hours, minutes, 0, 0);
        const anchorMs = anchor.getTime();
        const diff = fromMs - anchorMs;
        const k = Math.floor(diff / frequency) + 1;
        const nextMs = anchorMs + k * frequency;
        return new Date(nextMs);
    }

    /**
     * Returns the timestamp (ms) of the most recent lastScraped value across
     * all products and their sources. Returns 0 if nothing has ever been scraped.
     */
    async getLastGlobalScrapeTime() {
        try {
            const products = await db.getProducts();
            let latest = 0;
            for (const product of products) {
                if (product.active === false || product.archived === true) continue;
                for (const source of (product.sources || [])) {
                    if (source.lastScraped) {
                        const t = new Date(source.lastScraped).getTime();
                        if (t > latest) latest = t;
                    }
                }
            }
            return latest;
        } catch {
            return 0;
        }
    }

    async scrapeAllProducts() {
        console.log(`[${new Date().toISOString()}] Starting scheduled scrape...`);
        
        try {
            const products = await db.getProducts();
            let processedCount = 0;
            let skippedCount = 0;
            
            for (const product of products) {
                if (product.active === false || product.archived === true) {
                    skippedCount++;
                    continue;
                }

                processedCount++;
                console.log(`  Scraping: ${product.title}`);
                
                const results = await scraper.scrapeAllSources(product);

                for (let i = 0; i < results.length; i++) {
                    if (results[i].success) {
                        await db.addPriceHistory(product._id, i, results[i].price);
                        console.log(`    [OK] ${product.sources[i].siteName}: €${results[i].price}`);
                    } else {
                        await db.recordScrapeError(product._id, i, results[i].error);
                        console.log(`    [FAILED] ${product.sources[i].siteName}: ${results[i].error}`);
                    }
                }

                // Evaluate alerts for the updated product
                try {
                    const updatedProduct = await db.getProductById(product._id);
                    if (updatedProduct) {
                        await alertChecker.checkProduct(updatedProduct);
                    }
                } catch (err) {
                    console.error(`  Alert check error for ${product.title}:`, err.message);
                }
            }

            console.log(`[${new Date().toISOString()}] Scrape complete. ${processedCount} active products processed (${skippedCount} paused).`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Scrape error:`, error.message);
        }
    }

    scheduleNext(frequency, scrapeTime) {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        if (!frequency || frequency <= 0) return;

        const nextTime = this.getNextScheduledTime(frequency, scrapeTime, new Date());
        if (!nextTime) return;

        const delay = Math.max(1000, nextTime.getTime() - Date.now());
        console.log(`Scheduler: Next scrape scheduled at ${nextTime.toISOString()} (in ${Math.round(delay / 60000)}m)`);

        this.timeoutId = setTimeout(async () => {
            await this.scrapeAllProducts();
            this.scheduleNext(frequency, scrapeTime);
        }, delay);
    }

    async start() {
        const frequency = await this.getFrequency();
        const scrapeTime = await this.getScrapeTime();

        if (frequency > 0) {
            const freqDesc = frequency >= 3600000
                ? `${frequency / 3600000} hour${frequency / 3600000 !== 1 ? 's' : ''}`
                : `${Math.round(frequency / 60000)} minute${Math.round(frequency / 60000) !== 1 ? 's' : ''}`;
            console.log(`Scheduler started. Scraping every ${freqDesc} (scheduled hour: ${scrapeTime}).`);

            // Only fire the startup scrape if enough time has passed since the last one.
            // This prevents hammering external sites on every container restart/redeploy.
            const lastScrape = await this.getLastGlobalScrapeTime();
            const timeSinceLast = Date.now() - lastScrape;

            if (lastScrape === 0 || timeSinceLast >= frequency) {
                console.log('Scheduler: No recent scrape found — running initial scrape in 5s.');
                this.timeoutId = setTimeout(async () => {
                    await this.scrapeAllProducts();
                    this.scheduleNext(frequency, scrapeTime);
                }, 5000);
            } else {
                this.scheduleNext(frequency, scrapeTime);
            }
        } else {
            console.log('Scheduler: Scraping only at startup');
            this.timeoutId = setTimeout(() => this.scrapeAllProducts(), 5000);
        }
    }

    stop() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async restart() {
        this.stop();
        await this.start();
    }
}

module.exports = new Scheduler();
