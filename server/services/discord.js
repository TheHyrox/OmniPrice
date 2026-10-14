const axios = require('axios');
const db = require('../db/adapter');

class DiscordNotifier {
    /**
     * Resolves the default Discord webhook URL from DB settings or process.env.
     */
    async getDefaultWebhookUrl() {
        try {
            const settings = await db.getSettings();
            if (settings && settings.discordWebhookUrl) {
                return settings.discordWebhookUrl.trim();
            }
        } catch (err) {
            console.warn('[Discord] Could not load DB settings:', err.message);
        }
        return (process.env.DISCORD_WEBHOOK_URL || '').trim();
    }

    /**
     * Sends a test message to verify the Discord webhook.
     */
    async testWebhook(webhookUrl = null) {
        const url = webhookUrl ? webhookUrl.trim() : await this.getDefaultWebhookUrl();

        if (!url) {
            throw new Error('No Discord Webhook URL provided or configured in Settings.');
        }

        if (!url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) {
            throw new Error('Invalid Discord Webhook URL format. It should start with https://discord.com/api/webhooks/...');
        }

        const payload = {
            username: 'OmniPrice',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/3135/3135706.png',
            embeds: [
                {
                    title: 'OmniPrice Notification Connected',
                    description: 'Your Discord webhook is working properly. You will receive alerts in this channel whenever a tracked product reaches or drops below your target price.',
                    color: 0x5865F2, // Discord Blurple
                    fields: [
                        {
                            name: 'Status',
                            value: 'Webhook Operational',
                            inline: true
                        },
                        {
                            name: 'Triggered At',
                            value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                            inline: true
                        }
                    ],
                    footer: {
                        text: 'OmniPrice Price Tracker'
                    },
                    timestamp: new Date().toISOString()
                }
            ]
        };

        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        return {
            success: true,
            status: response.status,
            message: 'Test message sent to Discord successfully!'
        };
    }

    /**
     * Sends a price drop notification embed to Discord.
     */
    async sendPriceAlert({ alert, product, currentPrice, storeName, sourceUrl }) {
        const webhookUrl = (alert.webhookUrl && alert.webhookUrl.trim()) 
            ? alert.webhookUrl.trim() 
            : await this.getDefaultWebhookUrl();

        if (!webhookUrl) {
            throw new Error('No Discord webhook configured for this alert or in Settings.');
        }

        const targetPrice = alert.targetPrice;
        const discountAmount = targetPrice > currentPrice ? (targetPrice - currentPrice) : 0;
        const discountPercent = targetPrice > 0 ? ((discountAmount / targetPrice) * 100).toFixed(1) : '0';

        const fields = [
            {
                name: 'Lowest Price',
                value: `**€${Number(currentPrice).toFixed(2)}**`,
                inline: true
            },
            {
                name: 'Target Price',
                value: `€${Number(targetPrice).toFixed(2)}`,
                inline: true
            }
        ];

        if (discountAmount > 0) {
            fields.push({
                name: 'Below Target By',
                value: `-€${discountAmount.toFixed(2)} (-${discountPercent}%)`,
                inline: true
            });
        }

        if (product.referencePrice) {
            fields.push({
                name: 'Base Price',
                value: `~~€${Number(product.referencePrice).toFixed(2)}~~`,
                inline: true
            });
        }

        if (storeName) {
            fields.push({
                name: 'Merchant',
                value: storeName,
                inline: true
            });
        }

        if (sourceUrl) {
            fields.push({
                name: 'Store Link',
                value: `[View Deal at ${storeName || 'Merchant'}](${sourceUrl})`,
                inline: false
            });
        }

        const embed = {
            title: `Price Drop: ${product.title}`,
            url: sourceUrl || undefined,
            color: 0x10B981, // Green
            description: `Great news! **${product.title}** has dropped to or below your target price.`,
            fields,
            footer: {
                text: 'OmniPrice Alert System'
            },
            timestamp: new Date().toISOString()
        };

        if (product.image && (product.image.startsWith('http://') || product.image.startsWith('https://'))) {
            embed.thumbnail = { url: product.image };
        }

        const payload = {
            username: 'OmniPrice',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/3135/3135706.png',
            embeds: [embed]
        };

        const response = await axios.post(webhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        return {
            success: true,
            status: response.status
        };
    }
}

module.exports = new DiscordNotifier();
