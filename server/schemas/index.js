const { z } = require('zod');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const positiveNumber = z.number({ invalid_type_error: 'Must be a number' }).positive('Must be a positive number');

const sourceSchema = z.object({
    url: z.string().url('Source URL must be a valid URL'),
    cssSelector: z.string().min(1, 'CSS selector is required').max(1000),
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
    active: z.boolean().optional().default(true),
    archived: z.boolean().optional().default(false),
});

const updateProductSchema = createProductSchema.partial().extend({
    sources: z.array(sourceSchema).min(1, 'At least one source is required').max(20).optional(),
    active: z.boolean().optional(),
    archived: z.boolean().optional(),
});

// ─── Stores ───────────────────────────────────────────────────────────────────

const createStoreSchema = z.object({
    name: z.string().min(1, 'Store name is required').max(100),
    cssSelector: z.string().min(1, 'CSS selector is required').max(1000),
    defaultUrl: z.string().url('Default URL must be a valid URL').optional().or(z.literal('')).nullable(),
});

const updateStoreSchema = createStoreSchema.partial().extend({
    syncProducts: z.boolean().optional(),
});

// ─── Alerts ───────────────────────────────────────────────────────────────────

const createAlertSchema = z.object({
    productId: z.string().min(1, 'Product ID is required'),
    targetPrice: positiveNumber.optional().nullable(),
    thresholdPercent: z.number().positive('Percentage must be greater than 0').max(99.9, 'Percentage must be less than 100').optional().nullable(),
    webhookUrl: z
        .string()
        .url('Webhook URL must be a valid URL')
        .optional()
        .or(z.literal(''))
        .nullable(),
    active: z.boolean().optional().default(true),
    alertType: z.enum(['drop', 'rise', 'percentage_drop', 'atl']).optional().default('drop'),
    notifyOnRise: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
    if (data.alertType === 'drop' || data.alertType === 'rise') {
        if (data.targetPrice == null || isNaN(data.targetPrice) || data.targetPrice <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Target price is required for price drop/rise alerts',
                path: ['targetPrice']
            });
        }
    }
    if (data.alertType === 'percentage_drop') {
        if (data.thresholdPercent == null || isNaN(data.thresholdPercent) || data.thresholdPercent <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Percentage drop threshold is required for % drop alerts',
                path: ['thresholdPercent']
            });
        }
    }
});

const updateAlertSchema = z.object({
    targetPrice: positiveNumber.optional().nullable(),
    thresholdPercent: z.number().positive('Percentage must be greater than 0').max(99.9, 'Percentage must be less than 100').optional().nullable(),
    webhookUrl: z.string().url().optional().or(z.literal('')).nullable(),
    active: z.boolean().optional(),
    alertType: z.enum(['drop', 'rise', 'percentage_drop', 'atl']).optional(),
    notifyOnRise: z.boolean().optional(),
});

const testWebhookSchema = z.object({
    webhookUrl: z.string().url('Webhook URL must be a valid URL').optional().or(z.literal('')).nullable(),
});

// ─── Settings ─────────────────────────────────────────────────────────────────

const updateSettingsSchema = z.object({
    theme: z.enum(['light', 'dark']).optional(),
    currency: z.enum(['EUR', 'USD', 'GBP', 'CAD', 'JPY', 'CHF', 'AUD']).optional(),
    scrapeFrequency: z.number().int().min(0).optional(),
    discordWebhookUrl: z
        .string()
        .url('Webhook URL must be a valid URL')
        .optional()
        .or(z.literal(''))
        .nullable(),
    kpiVisibility: z.object({
        showTrackedKpi: z.boolean().optional(),
        showRecordLowsKpi: z.boolean().optional(),
        showTotalSavingsKpi: z.boolean().optional(),
        showStoreFeedsKpi: z.boolean().optional(),
        showAvgDiscountKpi: z.boolean().optional(),
        showMarketTrendKpi: z.boolean().optional(),
        showDealScoreBadge: z.boolean().optional(),
        showPriceFreshness: z.boolean().optional(),
        showStoreSpread: z.boolean().optional(),
        showAtlProximity: z.boolean().optional(),
        showBuyAdvice: z.boolean().optional(),
        showDayOfWeekSweetSpot: z.boolean().optional(),
        showDropCycleMetrics: z.boolean().optional(),
        showMovingAverageBenchmark: z.boolean().optional(),
        showStoreVolatility: z.boolean().optional(),
        showStoreVolatilityTable: z.boolean().optional(),
        showStoreLatencyHealth: z.boolean().optional(),
        showAlertRealismScore: z.boolean().optional(),
    }).strict().optional(),
}).strict();

// ─── Bundles ──────────────────────────────────────────────────────────────────

const createBundleSchema = z.object({
    name: z.string().min(1, 'Bundle name is required').max(200),
    description: z.string().max(2000).optional().default(''),
    productIds: z.array(z.string().min(1)).min(1, 'At least one product is required in a bundle').max(50),
});

const updateBundleSchema = createBundleSchema.partial();

// ─── Scraper ──────────────────────────────────────────────────────────────────

const testScrapeSchema = z.object({
    url: z.string().url('URL must be a valid URL'),
    cssSelector: z.string().min(1, 'CSS selector is required').max(1000),
    usePuppeteer: z.boolean().optional().default(false),
});

module.exports = {
    createProductSchema,
    updateProductSchema,
    createStoreSchema,
    updateStoreSchema,
    createAlertSchema,
    updateAlertSchema,
    createBundleSchema,
    updateBundleSchema,
    testWebhookSchema,
    updateSettingsSchema,
    testScrapeSchema,
};
