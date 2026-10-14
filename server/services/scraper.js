const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class Scraper {
    constructor() {
        this.browser = null;
    }

    async getBrowser() {
        if (!this.browser || (typeof this.browser.isConnected === 'function' && !this.browser.isConnected())) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }
        return this.browser;
    }

    async closeBrowser() {
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (err) {
                console.warn('Error closing Puppeteer browser:', err.message);
            }
            this.browser = null;
        }
    }

    isTransientError(error) {
        if (!error) return false;

        // Permanent failures that must NOT be retried
        if (error.message && (
            error.message.includes('Selector "') ||
            error.message.includes('Could not parse price from') ||
            error.message.includes('not found')
        )) {
            return false;
        }

        // HTTP status codes: retry 408, 429, 500, 502, 503, 504; fail fast on 400, 401, 404
        const status = error.response?.status;
        if (status) {
            if ([408, 429, 500, 502, 503, 504].includes(status)) {
                return true;
            }
            if ([400, 401, 404].includes(status)) {
                return false;
            }
        }

        // Common transient network errors
        const transientCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'];
        if (error.code && transientCodes.includes(error.code)) {
            return true;
        }

        // Puppeteer / Axios timeout or connection drop strings
        const lowerMsg = (error.message || '').toLowerCase();
        if (
            lowerMsg.includes('timeout') ||
            lowerMsg.includes('navigation timeout') ||
            lowerMsg.includes('session closed') ||
            lowerMsg.includes('target closed') ||
            lowerMsg.includes('socket hang up') ||
            lowerMsg.includes('network error')
        ) {
            return true;
        }

        return false;
    }

    async withRetry(operation, { maxRetries = 2, baseDelay = 1000, description = 'Operation' } = {}) {
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (err) {
                lastError = err;

                const isTransient = this.isTransientError(err);
                if (!isTransient || attempt === maxRetries) {
                    throw err;
                }

                // Exponential backoff with small random jitter
                const jitter = Math.floor(Math.random() * 300);
                const delay = (baseDelay * Math.pow(2, attempt)) + jitter;

                console.warn(`[Scraper] ${description} attempt ${attempt + 1}/${maxRetries + 1} failed (${err.message}). Retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }

        throw lastError;
    }

    parsePrice(priceText) {
        if (!priceText) return null;

        let cleaned = priceText
            .replace(/[€$£¥]/g, '')
            .replace(/\s/g, '')
            .replace(/[^\d,.\-]/g, '')
            .trim();

        if (cleaned.includes(',') && cleaned.includes('.')) {
            if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
                cleaned = cleaned.replace(/\./g, '').replace(',', '.');
            } else {
                cleaned = cleaned.replace(/,/g, '');
            }
        } else if (cleaned.includes(',')) {
            const parts = cleaned.split(',');
            if (parts.length === 2 && parts[1].length <= 2) {
                cleaned = cleaned.replace(',', '.');
            } else {
                cleaned = cleaned.replace(/,/g, '');
            }
        }
        
        const price = parseFloat(cleaned);
        return isNaN(price) ? null : price;
    }

    async scrapeWithCheerio(url, cssSelector) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                timeout: 15000
            });
            
            const $ = cheerio.load(response.data);
            const element = $(cssSelector).first().clone();
            element.find('sup, script, style').remove();
            
            if (element.length === 0) {
                throw new Error(`Selector "${cssSelector}" not found`);
            }
            
            const priceText = element.text().trim();
            const price = this.parsePrice(priceText);
            
            if (price === null) {
                throw new Error(`Could not parse price from: "${priceText}"`);
            }
            
            return price;
        } catch (error) {
            if (error.response?.status === 403 || error.response?.status === 429) {
                throw new Error('Access blocked - try enabling Puppeteer');
            }
            throw error;
        }
    }

    async scrapeWithPuppeteer(url, cssSelector) {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        
        try {
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
            
            await page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            await page.waitForSelector(cssSelector, { timeout: 10000 });
            
            const priceText = await page.$eval(cssSelector, el => {
                const clone = el.cloneNode(true);
                clone.querySelectorAll('sup, script, style').forEach(node => node.remove());
                return clone.textContent.trim();
            });
            const price = this.parsePrice(priceText);
            
            if (price === null) {
                throw new Error(`Could not parse price from: "${priceText}"`);
            }
            
            return price;
        } finally {
            try {
                await page.close();
            } catch (closeErr) {
                // Page may have already closed if navigation failed
            }
        }
    }

    async scrapePrice(url, cssSelector, usePuppeteer = false, options = {}) {
        const { maxRetries = 2, baseDelay = 1000 } = options;

        return this.withRetry(async () => {
            if (usePuppeteer) {
                return this.scrapeWithPuppeteer(url, cssSelector);
            }
            
            try {
                return await this.scrapeWithCheerio(url, cssSelector);
            } catch (error) {
                // If it was an access block, immediately try Puppeteer
                if (error.message?.includes('Access blocked') || error.response?.status === 403) {
                    console.log(`Cheerio access blocked for ${url}, auto-falling back to Puppeteer...`);
                    return await this.scrapeWithPuppeteer(url, cssSelector);
                }

                // If transient network error, throw to let withRetry retry
                if (this.isTransientError(error)) {
                    throw error;
                }

                // For selector/parsing issues, try Puppeteer once in case dynamic client-side JS was required
                console.log(`Cheerio failed for ${url} (${error.message}), auto-falling back to Puppeteer...`);
                return await this.scrapeWithPuppeteer(url, cssSelector);
            }
        }, {
            maxRetries,
            baseDelay,
            description: `Scraping ${url}`
        });
    }

    async scrapeAllSources(product) {
        const results = [];
        
        for (const source of product.sources) {
            try {
                const price = await this.scrapePrice(
                    source.url, 
                    source.cssSelector, 
                    source.usePuppeteer
                );
                results.push({
                    success: true,
                    price,
                    url: source.url
                });
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    url: source.url
                });
            }
        }
        
        return results;
    }
}

module.exports = new Scraper();
