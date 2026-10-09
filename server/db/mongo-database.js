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
    priceHistory: [{
        date: { type: String, required: true },
        prices: [{
            sourceIndex: { type: Number, required: true },
            price: { type: Number, required: true },
            url: { type: String }
        }]
    }],
    lowestPrice: { type: Number, default: null },
    lowestPriceSource: { type: mongoose.Schema.Types.Mixed, default: null },
    priceDelta: { type: Number, default: null }
}, { versionKey: false, collection: 'products' });

const storeSchema = new mongoose.Schema({
    _id: { type: String, default: uuidv4 },
    name: { type: String, required: true },
    cssSelector: { type: String, required: true },
    defaultUrl: { type: String, default: '' }
}, { versionKey: false, collection: 'stores' });

const settingsSchema = new mongoose.Schema({
    _id: { type: String, default: 'default_settings' },
    theme: { type: String, default: 'light' },
    scrapeFrequency: { type: Number, default: 43200000 }
}, { versionKey: false, collection: 'settings' });

const Product = mongoose.model('Product', productSchema);
const Store = mongoose.model('Store', storeSchema);
const Setting = mongoose.model('Setting', settingsSchema);

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
    scrapeFrequency: 43200000
};

class MongoDatabase {
    constructor() {
        this.Product = Product;
        this.Store = Store;
        this.Setting = Setting;
    }

    async init() {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/omniprice';
        await mongoose.connect(mongoUri);
        console.log(`✓ MongoDB Database initialized connected to ${mongoUri}`);

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
        return Product.find({}).lean();
    }

    async getProductById(id) {
        return Product.findOne({ _id: id }).lean();
    }

    async createProduct(data) {
        const productData = {
            _id: uuidv4(),
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sources: data.sources || [],
            priceHistory: [],
            lowestPrice: null,
            lowestPriceSource: null,
            priceDelta: null
        };
        const product = new Product(productData);
        await product.save();
        return product.toObject();
    }

    async updateProduct(id, data) {
        const product = await Product.findOne({ _id: id });
        if (!product) return null;

        Object.assign(product, data);
        product.updatedAt = new Date().toISOString();
        this._updateVirtuals(product);
        await product.save();
        return product.toObject();
    }

    async deleteProduct(id) {
        const res = await Product.deleteOne({ _id: id });
        return res.deletedCount > 0;
    }

    async addPriceHistory(productId, sourceIndex, price) {
        const product = await Product.findOne({ _id: productId });
        if (!product) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        let historyEntry = product.priceHistory.find(h => {
            const hDate = new Date(h.date);
            hDate.setHours(0, 0, 0, 0);
            return hDate.toISOString().split('T')[0] === todayStr;
        });

        if (!historyEntry) {
            historyEntry = {
                date: new Date().toISOString(),
                prices: []
            };
            product.priceHistory.push(historyEntry);
        }

        const priceIndex = historyEntry.prices.findIndex(p => p.sourceIndex === sourceIndex);
        if (priceIndex >= 0) {
            historyEntry.prices[priceIndex].price = price;
        } else {
            historyEntry.prices.push({
                sourceIndex,
                price,
                url: product.sources[sourceIndex] ? product.sources[sourceIndex].url : ''
            });
        }

        if (product.sources[sourceIndex]) {
            product.sources[sourceIndex].lastPrice = price;
            product.sources[sourceIndex].lastScraped = new Date().toISOString();
        }

        this._updateVirtuals(product);
        await product.save();
        return product.toObject();
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
}

module.exports = MongoDatabase;
