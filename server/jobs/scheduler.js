const db = require('../db/adapter');
const scraper = require('../services/scraper');
const alertChecker = require('../services/alert-checker');

class Scheduler {
    constructor() {
        this.intervalId = null;
    }

    async getFrequency() {
        try {
            const settings = await db.getSettings();
            return settings.scrapeFrequency || 43200000; // Default 12h
        } catch {
            return 43200000;
        }
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
            
            for (const product of products) {
                console.log(`  Scraping: ${product.title}`);
                
                const results = await scraper.scrapeAllSources(product);

                for (let i = 0; i < results.length; i++) {
                    if (results[i].success) {
                        await db.addPriceHistory(product._id, i, results[i].price);
                        console.log(`    [OK] ${product.sources[i].siteName}: €${results[i].price}`);
                    } else {
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

            console.log(`[${new Date().toISOString()}] Scrape complete. ${products.length} products processed.`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Scrape error:`, error.message);
        }
    }

    async start() {
        const frequency = await this.getFrequency();

        if (frequency > 0) {
            console.log(`Scheduler started. Scraping every ${frequency / 3600000} hours.`);

            // Only fire the startup scrape if enough time has passed since the last one.
            // This prevents hammering external sites on every container restart/redeploy.
            const lastScrape = await this.getLastGlobalScrapeTime();
            const timeSinceLast = Date.now() - lastScrape;

            if (lastScrape === 0 || timeSinceLast >= frequency) {
                console.log('Scheduler: No recent scrape found — running initial scrape in 5s.');
                setTimeout(() => this.scrapeAllProducts(), 5000);
            } else {
                // Schedule the next scrape for the remaining time in the current interval
                const nextIn = frequency - timeSinceLast;
                console.log(`Scheduler: Last scrape was ${Math.round(timeSinceLast / 60000)}m ago. Next scrape in ${Math.round(nextIn / 60000)}m.`);
                setTimeout(() => {
                    this.scrapeAllProducts();
                    // After the catch-up scrape, set the regular interval
                    this.intervalId = setInterval(() => this.scrapeAllProducts(), frequency);
                }, nextIn);
                return; // Don't set the regular interval yet — the setTimeout above will do it
            }

            this.intervalId = setInterval(() => this.scrapeAllProducts(), frequency);
        } else {
            console.log('Scheduler: Scraping only at startup');
            setTimeout(() => this.scrapeAllProducts(), 5000);
        }
    }

    stop() {
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
