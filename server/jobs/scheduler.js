const db = require('../db/adapter');
const scraper = require('../services/scraper');

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
                        console.log(`    ✓ ${product.sources[i].siteName}: €${results[i].price}`);
                    } else {
                        console.log(`    ✗ ${product.sources[i].siteName}: ${results[i].error}`);
                    }
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

            setTimeout(() => this.scrapeAllProducts(), 5000);

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
