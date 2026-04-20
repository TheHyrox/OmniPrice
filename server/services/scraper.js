const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

class Scraper {
    constructor() {
        this.browser = null;
    }

    async getBrowser() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }
        return this.browser;
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
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
                }
            });
            
            const $ = cheerio.load(response.data);
            const element = $(cssSelector).first();
            
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
            
            const priceText = await page.$eval(cssSelector, el => el.textContent.trim());
            const price = this.parsePrice(priceText);
            
            if (price === null) {
                throw new Error(`Could not parse price from: "${priceText}"`);
            }
            
            return price;
        } finally {
            await page.close();
        }
    }

    async scrapePrice(url, cssSelector, usePuppeteer = false) {
        if (usePuppeteer) {
            return this.scrapeWithPuppeteer(url, cssSelector);
        }
        
        try {
            return await this.scrapeWithCheerio(url, cssSelector);
        } catch (error) {
            if (error.message.includes('Access blocked')) {
                console.log(`Cheerio blocked for ${url}, trying Puppeteer...`);
                return this.scrapeWithPuppeteer(url, cssSelector);
            }
            throw error;
        }
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
