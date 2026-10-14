const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class Scraper {
    constructor() {
        this.browser = null;
        this.launchPromise = null;
    }

    async getBrowser() {
        // Return existing healthy browser instance if still connected
        if (this.browser && typeof this.browser.isConnected === 'function' && this.browser.isConnected()) {
            return this.browser;
        }

        // Avoid race conditions if multiple concurrent calls trigger a launch
        if (this.launchPromise) {
            return this.launchPromise;
        }

        this.launchPromise = (async () => {
            // Clean up any stale/broken instance
            if (this.browser) {
                try {
                    await this.browser.close();
                } catch (_) {}
                this.browser = null;
            }

            try {
                const browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });

                // Auto-recover state on unexpected process termination or disconnect
                browser.once('disconnected', () => {
                    console.warn('[Scraper] Puppeteer browser disconnected or crashed.');
                    if (this.browser === browser) {
                        this.browser = null;
                    }
                });

                this.browser = browser;
                return browser;
            } finally {
                this.launchPromise = null;
            }
        })();

        return this.launchPromise;
    }

    async restartBrowser() {
        console.warn('[Scraper] Restarting Puppeteer browser...');
        await this.closeBrowser();
        return this.getBrowser();
    }

    async closeBrowser() {
        const browser = this.browser;
        this.browser = null;
        this.launchPromise = null;
        if (browser) {
            try {
                await browser.close();
            } catch (err) {
                console.warn('Error closing Puppeteer browser:', err.message);
            }
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
            lowerMsg.includes('protocol error') ||
            lowerMsg.includes('browser has disconnected') ||
            lowerMsg.includes('crashed') ||
            lowerMsg.includes('navigating frame was detached') ||
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
        let browser;
        try {
            browser = await this.getBrowser();
        } catch (launchErr) {
            console.error('[Scraper] Failed to acquire Puppeteer browser, retrying with fresh instance...', launchErr.message);
            await this.closeBrowser();
            browser = await this.getBrowser();
        }

        let page = null;
        try {
            page = await browser.newPage();
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
        } catch (error) {
            const msg = (error.message || '').toLowerCase();
            const isCrash =
                !browser ||
                (typeof browser.isConnected === 'function' && !browser.isConnected()) ||
                msg.includes('target closed') ||
                msg.includes('session closed') ||
                msg.includes('protocol error') ||
                msg.includes('browser has disconnected') ||
                msg.includes('crashed') ||
                msg.includes('navigating frame was detached');

            if (isCrash) {
                console.warn(`[Scraper] Puppeteer crash or disconnection detected (${error.message}). Discarding crashed browser instance for recovery.`);
                await this.closeBrowser();
            }

            throw error;
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (closeErr) {
                    // Page may have already closed if navigation failed or browser crashed
                }
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
        if (!product || !Array.isArray(product.sources) || product.sources.length === 0) {
            return [];
        }

        const promises = product.sources.map(source =>
            this.scrapePrice(
                source.url,
                source.cssSelector,
                source.usePuppeteer
            )
        );

        const settledResults = await Promise.allSettled(promises);

        return settledResults.map((result, i) => {
            const source = product.sources[i];
            if (result.status === 'fulfilled') {
                return {
                    success: true,
                    price: result.value,
                    url: source.url
                };
            } else {
                return {
                    success: false,
                    error: result.reason?.message || 'Unknown scrape error',
                    url: source.url
                };
            }
        });
    }
}

module.exports = new Scraper();
