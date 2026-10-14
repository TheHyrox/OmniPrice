const { z } = require('zod');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const positiveNumber = z.number({ invalid_type_error: 'Must be a number' }).positive('Must be a positive number');

const sourceSchema = z.object({
    url: z.string().url('Source URL must be a valid URL'),
    cssSelector: z.string().min(1, 'CSS selector is required').max(500),
    siteName: z.string().min(1, 'Store name is required').max(100),
    usePuppeteer: z.boolean().optional().default(false),
});

// ─── Products ─────────────────────────────────────────────────────────────────

const createProductSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(2000).optional().default(''),
    referencePrice: positiveNumber,
    tags: z.array(z.string().max(50)).max(20).optional().default([]),
    // Supports external URLs, internal /images/... paths, or base64 data URLs up to ~25MB
    image: z.string().max(25 * 1024 * 1024, 'Image payload exceeds 25MB limit').nullable().optional(),
    sources: z.array(sourceSchema).min(1, 'At least one source is required').max(20),
});

const updateProductSchema = createProductSchema.partial().extend({
    sources: z.array(sourceSchema).min(1, 'At least one source is required').max(20).optional(),
});

// ─── Stores ───────────────────────────────────────────────────────────────────

const createStoreSchema = z.object({
    name: z.string().min(1, 'Store name is required').max(100),
    cssSelector: z.string().min(1, 'CSS selector is required').max(500),
    defaultUrl: z.string().url('Default URL must be a valid URL').optional().or(z.literal('')).nullable(),
});

const updateStoreSchema = createStoreSchema.partial().extend({
    syncProducts: z.boolean().optional(),
});

// ─── Alerts ───────────────────────────────────────────────────────────────────

const createAlertSchema = z.object({
    productId: z.string().min(1, 'Product ID is required'),
    targetPrice: positiveNumber,
    webhookUrl: z
        .string()
        .url('Webhook URL must be a valid URL')
        .optional()
        .or(z.literal(''))
        .nullable(),
    active: z.boolean().optional().default(true),
});

const updateAlertSchema = z.object({
    targetPrice: positiveNumber.optional(),
    webhookUrl: z.string().url().optional().or(z.literal('')).nullable(),
    active: z.boolean().optional(),
});

const testWebhookSchema = z.object({
    webhookUrl: z.string().url('Webhook URL must be a valid URL').optional().or(z.literal('')).nullable(),
});

// ─── Settings ─────────────────────────────────────────────────────────────────

const updateSettingsSchema = z.object({
    theme: z.enum(['light', 'dark']).optional(),
    scrapeFrequency: z.number().int().min(0).optional(),
    discordWebhookUrl: z
        .string()
        .url('Webhook URL must be a valid URL')
        .optional()
        .or(z.literal(''))
        .nullable(),
}).strict();

// ─── Scraper ──────────────────────────────────────────────────────────────────

const testScrapeSchema = z.object({
    url: z.string().url('URL must be a valid URL'),
    cssSelector: z.string().min(1, 'CSS selector is required').max(500),
    usePuppeteer: z.boolean().optional().default(false),
});

module.exports = {
    createProductSchema,
    updateProductSchema,
    createStoreSchema,
    updateStoreSchema,
    createAlertSchema,
    updateAlertSchema,
    testWebhookSchema,
    updateSettingsSchema,
    testScrapeSchema,
};
