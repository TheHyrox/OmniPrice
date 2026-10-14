const rateLimit = require('express-rate-limit');

/**
 * Limiter for scrape-all operations across all products/sources.
 * Prevents hammering external stores, IP blocking, and high server memory usage.
 */
const scrapeAllLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 3, // 3 scrape-all calls per 5 minutes per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many scrape-all requests. Please wait a few minutes before trying again.'
    }
});

/**
 * Limiter for single-product or single-source on-demand scraping.
 */
const scrapeProductLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // max 20 calls per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many scrape requests for this item. Please wait a moment before trying again.'
    }
});

/**
 * Limiter for Discord webhook test notifications.
 * Prevents triggering Discord's API rate limits or spamming webhook channels.
 */
const webhookTestLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // max 10 tests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many webhook test requests. Please wait a moment before trying again.'
    }
});

/**
 * General API limiter for basic denial of service prevention.
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many requests from this IP. Please try again later.'
    }
});

module.exports = {
    scrapeAllLimiter,
    scrapeProductLimiter,
    webhookTestLimiter,
    apiLimiter
};
