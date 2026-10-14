const webpush = require('web-push');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const pushSubscriptionSchema = new mongoose.Schema({
    _id: { type: String, default: uuidv4 },
    endpoint: { type: String, required: true, unique: true },
    keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true }
    },
    createdAt: { type: String, default: () => new Date().toISOString() }
}, { versionKey: false, collection: 'push_subscriptions' });

const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);

class WebPushService {
    constructor() {
        this.PushSubscription = PushSubscription;
        this.vapidKeys = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        let publicKey = process.env.VAPID_PUBLIC_KEY;
        let privateKey = process.env.VAPID_PRIVATE_KEY;
        const subject = process.env.VAPID_SUBJECT || 'mailto:admin@omniprice.local';

        // If keys are not in environment variables, retrieve from database or generate new ones
        if (!publicKey || !privateKey) {
            const Setting = mongoose.model('Setting');
            const settings = await Setting.findOne({ _id: 'default_settings' });

            if (settings && settings.vapidPublicKey && settings.vapidPrivateKey) {
                publicKey = settings.vapidPublicKey;
                privateKey = settings.vapidPrivateKey;
            } else {
                const generated = webpush.generateVAPIDKeys();
                publicKey = generated.publicKey;
                privateKey = generated.privateKey;

                await Setting.updateOne(
                    { _id: 'default_settings' },
                    { $set: { vapidPublicKey: publicKey, vapidPrivateKey: privateKey } },
                    { upsert: true }
                );
                console.log('[WebPush] Auto-generated persistent VAPID keys for Web Push notifications.');
            }
        }

        this.vapidKeys = { publicKey, privateKey, subject };
        webpush.setVapidDetails(subject, publicKey, privateKey);
        this.initialized = true;
    }

    async getPublicKey() {
        await this.init();
        return this.vapidKeys.publicKey;
    }

    async subscribe(subscriptionData) {
        await this.init();
        if (!subscriptionData || !subscriptionData.endpoint || !subscriptionData.keys) {
            throw new Error('Invalid push subscription payload');
        }

        const existing = await this.PushSubscription.findOne({ endpoint: subscriptionData.endpoint });
        if (existing) {
            existing.keys = subscriptionData.keys;
            await existing.save();
            return existing.toObject();
        }

        const newSub = new this.PushSubscription({
            _id: uuidv4(),
            endpoint: subscriptionData.endpoint,
            keys: subscriptionData.keys
        });

        await newSub.save();
        return newSub.toObject();
    }

    async sendNotificationToAll(payload) {
        await this.init();
        const subscriptions = await this.PushSubscription.find({}).lean();
        if (subscriptions.length === 0) return { delivered: 0 };

        const message = JSON.stringify({
            title: payload.title || 'OmniPrice Alert',
            body: payload.body || 'Price update available',
            icon: payload.icon || '/images/placeholder.svg',
            data: { url: payload.url || '/' }
        });

        let delivered = 0;
        const toDelete = [];

        await Promise.allSettled(subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: sub.keys
                }, message);
                delivered++;
            } catch (err) {
                // Subscription has expired or was unsubscribed by the user
                if (err.statusCode === 404 || err.statusCode === 410) {
                    toDelete.push(sub.endpoint);
                } else {
                    console.warn(`[WebPush] Failed to dispatch to ${sub.endpoint.slice(0, 30)}...:`, err.message);
                }
            }
        }));

        if (toDelete.length > 0) {
            await this.PushSubscription.deleteMany({ endpoint: { $in: toDelete } });
        }

        return { delivered, total: subscriptions.length };
    }
}

module.exports = new WebPushService();
