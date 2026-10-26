const { z } = require('zod');

const configSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3005),
    MONGO_URI: z.string().default('mongodb://localhost:27017/omniprice'),
    DISCORD_WEBHOOK_URL: z.string().optional().default(''),
    VAPID_PUBLIC_KEY: z.string().optional().default(''),
    VAPID_PRIVATE_KEY: z.string().optional().default(''),
    VAPID_SUBJECT: z.string().optional().default('mailto:admin@example.com'),
    PUPPETEER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
    PUPPETEER_EXECUTABLE_PATH: z.string().optional().or(z.literal('')),
    ALLOW_PRIVATE_NETWORK: z.string().optional().transform(v => v === 'true').default('false')
});

function loadConfig() {
    const parsed = configSchema.safeParse(process.env);
    if (!parsed.success) {
        console.error('[Config] Invalid configuration in environment:', parsed.error.format());
        throw new Error('Environment configuration validation failed');
    }
    return parsed.data;
}

module.exports = loadConfig();
