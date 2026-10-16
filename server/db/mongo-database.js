const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const productSchema = new mongoose.Schema({
    _id: { type: String, default: uuidv4 },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    referencePrice: { type: Number, required: true },
    tags: [{ type: String }],
    image: { type: String, default: null },
    sources: [{
        url: { type: String, required: true },
        cssSelector: { type: String, required: true },
        siteName: { type: String, required: true },
        usePuppeteer: { type: Boolean, default: false },
        lastPrice: { type: Number, default: null },
        lastScraped: { type: String, default: null }
    }],
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
    lowestPrice: { type: Number, default: null },
    lowestPriceSource: { type: mongoose.Schema.Types.Mixed, default: null },
    priceDelta: { type: Number, default: null },
    active: { type: Boolean, default: true }
}, { versionKey: false, collection: 'products' });

const priceRecordSchema = new mongoose.Schema({
    _id: { type: String, default: uuidv4 },
    productId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    prices: [{
        sourceIndex: { type: Number, required: true },
        price: { type: Number, required: true },
        url: { type: String, default: '' }
    }]
}, { versionKey: false, collection: 'price_records' });

priceRecordSchema.index({ productId: 1, date: 1 });

const storeSchema = new mongoose.Schema({
    _id: { type: String, default: uuidv4 },
    name: { type: String, required: true },
    cssSelector: { type: String, required: true },
    defaultUrl: { type: String, default: '' }
}, { versionKey: false, collection: 'stores' });

const settingsSchema = new mongoose.Schema({
    _id: { type: String, default: 'default_settings' },
    theme: { type: String, default: 'light' },
    scrapeFrequency: { type: Number, default: 43200000 },
    discordWebhookUrl: { type: String, default: '' }
}, { versionKey: false, collection: 'settings', strict: false });

const alertSchema = new mongoose.Schema({
    _id: { type: String, default: uuidv4 },
    productId: { type: String, required: true },
    targetPrice: { type: Number, default: null },
    thresholdPercent: { type: Number, default: null },
    webhookUrl: { type: String, default: '' },
    active: { type: Boolean, default: true },
    alertType: { type: String, enum: ['drop', 'rise', 'percentage_drop', 'atl'], default: 'drop' },
    notifyOnRise: { type: Boolean, default: false },
    lastTriggeredAt: { type: String, default: null },
    lastTriggeredPrice: { type: Number, default: null },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() }
}, { versionKey: false, collection: 'alerts' });

const Product = mongoose.model('Product', productSchema);
const PriceRecord = mongoose.model('PriceRecord', priceRecordSchema);
const Store = mongoose.model('Store', storeSchema);
const Setting = mongoose.model('Setting', settingsSchema);
const Alert = mongoose.model('Alert', alertSchema);

const defaultStores = [
    { _id: uuidv4(), name: 'Louis Moto', cssSelector: 'span.heading1' },
    { _id: uuidv4(), name: 'Team Axe', cssSelector: 'span.h2.text-secondary.mb-0.mr-2' },
    { _id: uuidv4(), name: 'Dafy Moto', cssSelector: 'span.js-product-main-price' },
    { _id: uuidv4(), name: 'Maxxess', cssSelector: 'span.h4.prixProduit.m-0' },
    { _id: uuidv4(), name: 'Motoblouz', cssSelector: 'span.price' }
];

const defaultSettings = {
    _id: 'default_settings',
    theme: 'light',
    scrapeFrequency: 43200000,
    discordWebhookUrl: ''
};

class MongoDatabase {
    constructor() {
        this.Product = Product;
        this.PriceRecord = PriceRecord;
        this.Store = Store;
        this.Setting = Setting;
        this.Alert = Alert;
    }

    async init() {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/omniprice';
        await mongoose.connect(mongoUri);
        console.log(`Connected to MongoDB at ${mongoUri}`);

        // Seed default stores if empty
        const storeCount = await Store.countDocuments();
        if (storeCount === 0) {
            await Store.insertMany(defaultStores);
        }

        // Seed default settings if empty
        const settingCount = await Setting.countDocuments();
        if (settingCount === 0) {
            await Setting.create(defaultSettings);
        }

        // Migrate legacy embedded priceHistory to price_records collection if present
        const productsWithHistory = await Product.collection.find({ 'priceHistory.0': { $exists: true } }).toArray();
        if (productsWithHistory.length > 0) {
            console.log(`Migrating embedded priceHistory for ${productsWithHistory.length} products to price_records...`);
            for (const prod of productsWithHistory) {
                if (Array.isArray(prod.priceHistory) && prod.priceHistory.length > 0) {
                    for (const entry of prod.priceHistory) {
                        const dateStr = entry.date ? new Date(entry.date).toISOString().split('T')[0] : '';
                        const exists = await PriceRecord.findOne({
                            productId: prod._id,
                            date: { $regex: `^${dateStr}` }
                        });
                        if (!exists) {
                            await PriceRecord.create({
                                _id: uuidv4(),
                                productId: prod._id,
                                date: entry.date,
                                prices: entry.prices || []
                            });
                        }
                    }
                    await Product.collection.updateOne({ _id: prod._id }, { $unset: { priceHistory: 1 } });
                }
            }
            console.log('Migration of priceHistory to price_records completed.');
        }
    }

    _updateVirtuals(product) {
        const prices = (product.sources || [])
            .filter(s => s.lastPrice !== null && s.lastPrice !== undefined)
            .map(s => s.lastPrice);

        product.lowestPrice = prices.length > 0 ? Math.min(...prices) : null;

        if (product.lowestPrice !== null) {
            product.lowestPriceSource = product.sources.find(s => s.lastPrice === product.lowestPrice) || null;
            if (product.referencePrice > 0) {
                product.priceDelta = ((product.lowestPrice - product.referencePrice) / product.referencePrice) * 100;
            } else {
                product.priceDelta = null;
            }
        } else {
            product.lowestPriceSource = null;
            product.priceDelta = null;
        }
    }

    // Products
    async getProducts() {
        const [products, records] = await Promise.all([
            Product.find({}).lean(),
            PriceRecord.find({}).sort({ date: 1 }).lean()
        ]);

        const historyByProduct = new Map();
        for (const rec of records) {
            if (!historyByProduct.has(rec.productId)) {
                historyByProduct.set(rec.productId, []);
            }
            historyByProduct.get(rec.productId).push(rec);
        }

        return products.map(p => ({
            ...p,
            active: p.active !== false,
            priceHistory: historyByProduct.get(p._id) || []
        }));
    }

    async getProductById(id) {
        const product = await Product.findOne({ _id: id }).lean();
        if (!product) return null;

        const priceHistory = await PriceRecord.find({ productId: id }).sort({ date: 1 }).lean();
        return {
            ...product,
            active: product.active !== false,
            priceHistory
        };
    }

    async getPriceHistory(productId) {
        return PriceRecord.find({ productId }).sort({ date: 1 }).lean();
    }

    async createProduct(data) {
        const productData = {
            _id: uuidv4(),
            ...data,
            active: data.active !== undefined ? Boolean(data.active) : true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sources: data.sources || [],
            lowestPrice: null,
            lowestPriceSource: null,
            priceDelta: null
        };
        const product = new Product(productData);
        await product.save();
        const obj = product.toObject();
        obj.priceHistory = [];
        return obj;
    }

    async updateProduct(id, data) {
        const product = await Product.findOne({ _id: id });
        if (!product) return null;

        Object.assign(product, data);
        if (data.active !== undefined) {
            product.active = Boolean(data.active);
        }
        product.updatedAt = new Date().toISOString();
        this._updateVirtuals(product);
        await product.save();

        const obj = product.toObject();
        obj.priceHistory = await PriceRecord.find({ productId: id }).sort({ date: 1 }).lean();
        return obj;
    }

    async deleteProduct(id) {
        const [res] = await Promise.all([
            Product.deleteOne({ _id: id }),
            PriceRecord.deleteMany({ productId: id })
        ]);
        return res.deletedCount > 0;
    }

    async addPriceHistory(productId, sourceIndex, price) {
        const product = await Product.findOne({ _id: productId });
        if (!product) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        let record = await PriceRecord.findOne({
            productId,
            date: { $regex: `^${todayStr}` }
        });

        if (!record) {
            record = new PriceRecord({
                _id: uuidv4(),
                productId,
                date: new Date().toISOString(),
                prices: []
            });
        }

        const priceIndex = record.prices.findIndex(p => p.sourceIndex === sourceIndex);
        if (priceIndex >= 0) {
            record.prices[priceIndex].price = price;
            if (product.sources[sourceIndex]?.url) {
                record.prices[priceIndex].url = product.sources[sourceIndex].url;
            }
        } else {
            record.prices.push({
                sourceIndex,
                price,
                url: product.sources[sourceIndex] ? product.sources[sourceIndex].url : ''
            });
        }
        await record.save();

        if (product.sources[sourceIndex]) {
            product.sources[sourceIndex].lastPrice = price;
            product.sources[sourceIndex].lastScraped = new Date().toISOString();
        }

        this._updateVirtuals(product);
        await product.save();

        const productObj = product.toObject();
        productObj.priceHistory = await PriceRecord.find({ productId }).sort({ date: 1 }).lean();
        return productObj;
    }

    // Stores
    async getStores() {
        return Store.find({}).lean();
    }

    async getStoreById(id) {
        return Store.findOne({ _id: id }).lean();
    }

    async createStore(data) {
        const store = new Store({
            _id: uuidv4(),
            name: data.name.trim(),
            cssSelector: data.cssSelector.trim(),
            defaultUrl: data.defaultUrl ? data.defaultUrl.trim() : ''
        });
        await store.save();
        return store.toObject();
    }

    async updateStore(id, data) {
        const store = await Store.findOne({ _id: id });
        if (!store) return null;

        if (data.name !== undefined) store.name = data.name.trim();
        if (data.cssSelector !== undefined) store.cssSelector = data.cssSelector.trim();
        if (data.defaultUrl !== undefined) store.defaultUrl = data.defaultUrl.trim();

        await store.save();
        return store.toObject();
    }

    async deleteStore(id) {
        const res = await Store.deleteOne({ _id: id });
        return res.deletedCount > 0;
    }

    async syncProductsWithStore(oldStoreName, newStoreName, newCssSelector) {
        const products = await Product.find({});
        let updatedCount = 0;

        for (const product of products) {
            let modified = false;
            if (product.sources) {
                for (const source of product.sources) {
                    if (source.siteName === oldStoreName || source.siteName === newStoreName) {
                        source.siteName = newStoreName;
                        source.cssSelector = newCssSelector;
                        modified = true;
                    }
                }
            }
            if (modified) {
                this._updateVirtuals(product);
                await product.save();
                updatedCount++;
            }
        }
        return updatedCount;
    }

    async syncAllProductsWithStores() {
        const stores = await Store.find({}).lean();
        const storeMap = new Map();
        for (const store of stores) {
            storeMap.set(store.name.toLowerCase(), store);
        }

        const products = await Product.find({});
        let updatedProductsCount = 0;
        let updatedSourcesCount = 0;

        for (const product of products) {
            let productModified = false;
            if (product.sources) {
                for (const source of product.sources) {
                    const matchedStore = storeMap.get((source.siteName || '').toLowerCase());
                    if (matchedStore) {
                        if (source.cssSelector !== matchedStore.cssSelector || source.siteName !== matchedStore.name) {
                            source.siteName = matchedStore.name;
                            source.cssSelector = matchedStore.cssSelector;
                            productModified = true;
                            updatedSourcesCount++;
                        }
                    }
                }
            }
            if (productModified) {
                this._updateVirtuals(product);
                await product.save();
                updatedProductsCount++;
            }
        }

        return { updatedProductsCount, updatedSourcesCount };
    }

    // Settings
    async getSettings() {
        let settings = await Setting.findOne({ _id: 'default_settings' }).lean();
        if (!settings) {
            const newSettings = new Setting(defaultSettings);
            await newSettings.save();
            settings = newSettings.toObject();
        }
        return settings;
    }

    async updateSettings(data) {
        let settings = await Setting.findOne({ _id: 'default_settings' });
        if (!settings) {
            settings = new Setting({ _id: 'default_settings', ...data });
        } else {
            Object.assign(settings, data);
        }
        await settings.save();
        return settings.toObject();
    }

    // Alerts
    async getAlerts() {
        return Alert.find({}).lean();
    }

    async getAlertById(id) {
        return Alert.findOne({ _id: id }).lean();
    }

    async getAlertsByProductId(productId) {
        return Alert.find({ productId }).lean();
    }

    async createAlert(data) {
        const alert = new Alert({
            _id: uuidv4(),
            productId: data.productId,
            targetPrice: data.targetPrice != null ? Number(data.targetPrice) : null,
            thresholdPercent: data.thresholdPercent != null ? Number(data.thresholdPercent) : null,
            webhookUrl: data.webhookUrl ? data.webhookUrl.trim() : '',
            active: data.active !== undefined ? Boolean(data.active) : true,
            alertType: data.alertType || 'drop',
            notifyOnRise: Boolean(data.notifyOnRise),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        await alert.save();
        return alert.toObject();
    }

    async updateAlert(id, data) {
        const updateData = { ...data, updatedAt: new Date().toISOString() };
        if (updateData.targetPrice !== undefined) {
            updateData.targetPrice = updateData.targetPrice != null ? Number(updateData.targetPrice) : null;
        }
        if (updateData.thresholdPercent !== undefined) {
            updateData.thresholdPercent = updateData.thresholdPercent != null ? Number(updateData.thresholdPercent) : null;
        }
        const alert = await Alert.findOneAndUpdate(
            { _id: id },
            { $set: updateData },
            { new: true }
        ).lean();
        return alert;
    }

    async deleteAlert(id) {
        const result = await Alert.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }
}

module.exports = MongoDatabase;
