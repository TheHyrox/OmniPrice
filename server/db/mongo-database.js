const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

function toIdQuery(id) {
    if (!id) return { _id: id };
    const idStr = String(id);
    if (mongoose.Types.ObjectId.isValid(idStr) && String(new mongoose.Types.ObjectId(idStr)) === idStr) {
        return {
            $or: [
                { _id: idStr },
                { _id: new mongoose.Types.ObjectId(idStr) }
            ]
        };
    }
    return { _id: idStr };
}

function toProductIdQuery(productId) {
    if (!productId) return { productId };
    const idStr = String(productId);
    if (mongoose.Types.ObjectId.isValid(idStr) && String(new mongoose.Types.ObjectId(idStr)) === idStr) {
        return {
            $or: [
                { productId: idStr },
                { productId: new mongoose.Types.ObjectId(idStr) }
            ]
        };
    }
    return { productId: idStr };
}

const productSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.Mixed, default: uuidv4 },
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
        lastScraped: { type: String, default: null },
        lastStatus: { type: String, default: null },
        lastError: { type: String, default: null }
    }],
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
    lowestPrice: { type: Number, default: null },
    lowestPriceSource: { type: mongoose.Schema.Types.Mixed, default: null },
    priceDelta: { type: Number, default: null },
    minPriceEver: { type: Number, default: null },
    healthStatus: { type: String, default: 'unknown' },
    active: { type: Boolean, default: true },
    archived: { type: Boolean, default: false }
}, { versionKey: false, collection: 'products' });

productSchema.index({ active: 1 });
productSchema.index({ archived: 1 });
productSchema.index({ tags: 1 });

const priceRecordSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.Mixed, default: uuidv4 },
    productId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    date: { type: String, required: true },
    prices: [{
        sourceIndex: { type: Number, required: true },
        price: { type: Number, required: true },
        url: { type: String, default: '' }
    }]
}, { versionKey: false, collection: 'price_records' });

priceRecordSchema.index({ productId: 1, date: 1 });

const storeSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.Mixed, default: uuidv4 },
    name: { type: String, required: true },
    cssSelector: { type: String, required: true },
    defaultUrl: { type: String, default: '' }
}, { versionKey: false, collection: 'stores' });

const settingsSchema = new mongoose.Schema({
    _id: { type: String, default: 'default_settings' },
    theme: { type: String, default: 'light' },
    currency: { type: String, default: 'EUR' },
    scrapeFrequency: { type: Number, default: 43200000 },
    discordWebhookUrl: { type: String, default: '' }
}, { versionKey: false, collection: 'settings', strict: false });

const alertSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.Mixed, default: uuidv4 },
    productId: { type: mongoose.Schema.Types.Mixed, required: true },
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

alertSchema.index({ productId: 1, active: 1 });

const bundleSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.Mixed, default: uuidv4 },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    productIds: [{ type: mongoose.Schema.Types.Mixed, required: true }],
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() }
}, { versionKey: false, collection: 'bundles' });

bundleSchema.index({ createdAt: -1 });

const Product = mongoose.model('Product', productSchema);
const PriceRecord = mongoose.model('PriceRecord', priceRecordSchema);
const Store = mongoose.model('Store', storeSchema);
const Setting = mongoose.model('Setting', settingsSchema);
const Alert = mongoose.model('Alert', alertSchema);
const Bundle = mongoose.model('Bundle', bundleSchema);

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
    currency: 'EUR',
    scrapeFrequency: 43200000,
    discordWebhookUrl: '',
    kpiVisibility: {
        showTrackedKpi: true,
        showRecordLowsKpi: true,
        showTotalSavingsKpi: true,
        showStoreFeedsKpi: true,
        showDealScoreBadge: true,
        showBuyAdvice: true,
        showStoreVolatility: true
    }
};

class MongoDatabase {
    constructor() {
        this.Product = Product;
        this.PriceRecord = PriceRecord;
        this.Store = Store;
        this.Setting = Setting;
        this.Alert = Alert;
        this.Bundle = Bundle;
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

        // Backfill minPriceEver on products if missing
        const productsMissingMin = await Product.find({ minPriceEver: { $exists: false } });
        if (productsMissingMin.length > 0) {
            for (const prod of productsMissingMin) {
                let minEver = prod.lowestPrice || null;
                const records = await PriceRecord.find({ productId: prod._id }).lean();
                for (const rec of records) {
                    for (const p of (rec.prices || [])) {
                        if (p.price != null && p.price > 0 && (minEver == null || p.price < minEver)) {
                            minEver = p.price;
                        }
                    }
                }
                await Product.updateOne({ _id: prod._id }, { $set: { minPriceEver: minEver } });
            }
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
            if (product.minPriceEver == null || product.lowestPrice < product.minPriceEver) {
                product.minPriceEver = product.lowestPrice;
            }
        } else {
            product.lowestPriceSource = null;
            product.priceDelta = null;
        }

        if (Array.isArray(product.sources) && product.sources.length > 0) {
            const statuses = product.sources.map(s => s.lastStatus).filter(Boolean);
            if (statuses.length === 0) {
                product.healthStatus = 'unknown';
            } else if (statuses.every(s => s === 'ok')) {
                product.healthStatus = 'ok';
            } else if (statuses.every(s => s === 'error')) {
                product.healthStatus = 'error';
            } else {
                product.healthStatus = 'warning';
            }
        } else {
            product.healthStatus = 'unknown';
        }
    }

    // Products
    async getProducts(options = {}) {
        const includeHistory = options && options.includeHistory === true;

        if (!includeHistory) {
            const products = await Product.find({}).lean();
            return products.map(p => ({
                ...p,
                active: p.active !== false,
                archived: Boolean(p.archived),
                priceHistory: []
            }));
        }

        const [products, records] = await Promise.all([
            Product.find({}).lean(),
            PriceRecord.find({}).sort({ date: 1 }).lean()
        ]);

        const historyByProduct = new Map();
        for (const rec of records) {
            const pidStr = String(rec.productId);
            if (!historyByProduct.has(pidStr)) {
                historyByProduct.set(pidStr, []);
            }
            historyByProduct.get(pidStr).push({ ...rec, _id: String(rec._id), productId: pidStr });
        }

        return products.map(p => ({
            ...p,
            _id: String(p._id),
            active: p.active !== false,
            archived: Boolean(p.archived),
            priceHistory: historyByProduct.get(String(p._id)) || []
        }));
    }

    async getProductById(id) {
        const product = await Product.findOne(toIdQuery(id)).lean();
        if (!product) return null;

        const priceHistory = await PriceRecord.find(toProductIdQuery(id)).sort({ date: 1 }).lean();
        return {
            ...product,
            _id: String(product._id),
            active: product.active !== false,
            archived: Boolean(product.archived),
            priceHistory: priceHistory.map(h => ({ ...h, _id: String(h._id), productId: String(h.productId) }))
        };
    }

    async getPriceHistory(productId) {
        const records = await PriceRecord.find(toProductIdQuery(productId)).sort({ date: 1 }).lean();
        return records.map(h => ({ ...h, _id: String(h._id), productId: String(h.productId) }));
    }

    async createProduct(data) {
        const productData = {
            _id: uuidv4(),
            ...data,
            active: data.active !== undefined ? Boolean(data.active) : true,
            archived: Boolean(data.archived),
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
        obj._id = String(obj._id);
        obj.priceHistory = [];
        return obj;
    }

    async updateProduct(id, data) {
        const product = await Product.findOne(toIdQuery(id));
        if (!product) return null;

        if (Array.isArray(data.sources)) {
            const oldSources = product.sources || [];
            data.sources = data.sources.map(newSrc => {
                const existing = oldSources.find(s => s.url === newSrc.url) 
                    || oldSources.find(s => s.siteName === newSrc.siteName);

                return {
                    ...newSrc,
                    lastPrice: newSrc.lastPrice !== undefined 
                        ? newSrc.lastPrice 
                        : (existing ? existing.lastPrice : null),
                    lastScraped: newSrc.lastScraped !== undefined 
                        ? newSrc.lastScraped 
                        : (existing ? existing.lastScraped : null)
                };
            });
        }

        Object.assign(product, data);
        if (data.active !== undefined) {
            product.active = Boolean(data.active);
        }
        if (data.archived !== undefined) {
            product.archived = Boolean(data.archived);
        }
        product.updatedAt = new Date().toISOString();
        this._updateVirtuals(product);
        await product.save();

        const obj = product.toObject();
        obj._id = String(obj._id);
        const priceHistory = await PriceRecord.find(toProductIdQuery(id)).sort({ date: 1 }).lean();
        obj.priceHistory = priceHistory.map(h => ({ ...h, _id: String(h._id), productId: String(h.productId) }));
        return obj;
    }

    async deleteProduct(id) {
        const [res] = await Promise.all([
            Product.deleteOne(toIdQuery(id)),
            PriceRecord.deleteMany(toProductIdQuery(id))
        ]);
        return res.deletedCount > 0;
    }

    async addPriceHistory(productId, sourceIndex, price, options = {}) {
        const product = await Product.findOne(toIdQuery(productId));
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
            product.sources[sourceIndex].lastStatus = 'ok';
            product.sources[sourceIndex].lastError = null;
        }

        this._updateVirtuals(product);
        await product.save();

        const productObj = product.toObject();
        productObj.priceHistory = await PriceRecord.find({ productId }).sort({ date: 1 }).lean();
        return productObj;
    }

    async recordScrapeError(productId, sourceIndex, errorMsg) {
        const product = await Product.findOne(toIdQuery(productId));
        if (!product || !product.sources || !product.sources[sourceIndex]) return null;

        product.sources[sourceIndex].lastScraped = new Date().toISOString();
        product.sources[sourceIndex].lastStatus = 'error';
        product.sources[sourceIndex].lastError = String(errorMsg || 'Scrape failed');

        this._updateVirtuals(product);
        await product.save();

        const productObj = product.toObject();
        productObj._id = String(productObj._id);
        const priceHistory = await PriceRecord.find(toProductIdQuery(productId)).sort({ date: 1 }).lean();
        productObj.priceHistory = priceHistory.map(h => ({ ...h, _id: String(h._id), productId: String(h.productId) }));
        return productObj;
    }

    // Stores
    async getStores() {
        const stores = await Store.find({}).lean();
        return stores.map(s => ({ ...s, _id: String(s._id) }));
    }

    async getStoreById(id) {
        const store = await Store.findOne(toIdQuery(id)).lean();
        return store ? { ...store, _id: String(store._id) } : null;
    }

    async createStore(data) {
        const store = new Store({
            _id: uuidv4(),
            name: data.name.trim(),
            cssSelector: data.cssSelector.trim(),
            defaultUrl: data.defaultUrl ? data.defaultUrl.trim() : ''
        });
        await store.save();
        const obj = store.toObject();
        obj._id = String(obj._id);
        return obj;
    }

    async updateStore(id, data) {
        const store = await Store.findOne(toIdQuery(id));
        if (!store) return null;

        if (data.name !== undefined) store.name = data.name.trim();
        if (data.cssSelector !== undefined) store.cssSelector = data.cssSelector.trim();
        if (data.defaultUrl !== undefined) store.defaultUrl = data.defaultUrl.trim();

        await store.save();
        const obj = store.toObject();
        obj._id = String(obj._id);
        return obj;
    }

    async deleteStore(id) {
        const res = await Store.deleteOne(toIdQuery(id));
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
        } else {
            // Ensure default kpiVisibility fields exist even for legacy documents
            settings.kpiVisibility = {
                ...defaultSettings.kpiVisibility,
                ...(settings.kpiVisibility || {})
            };
        }
        return settings;
    }

    async updateSettings(data) {
        let settings = await Setting.findOne({ _id: 'default_settings' });
        if (!settings) {
            settings = new Setting({ _id: 'default_settings', ...data });
        } else {
            if (data.kpiVisibility) {
                const existingKpi = settings.kpiVisibility || { ...defaultSettings.kpiVisibility };
                data.kpiVisibility = { ...existingKpi, ...data.kpiVisibility };
                settings.markModified('kpiVisibility');
            }
            Object.assign(settings, data);
        }
        await settings.save();
        const obj = settings.toObject();
        obj.kpiVisibility = {
            ...defaultSettings.kpiVisibility,
            ...(obj.kpiVisibility || {})
        };
        return obj;
    }

    // Alerts
    async getAlerts() {
        const alerts = await Alert.find({}).lean();
        return alerts.map(a => ({ ...a, _id: String(a._id), productId: String(a.productId) }));
    }

    async getAlertById(id) {
        const alert = await Alert.findOne(toIdQuery(id)).lean();
        return alert ? { ...alert, _id: String(alert._id), productId: String(alert.productId) } : null;
    }

    async getAlertsByProductId(productId) {
        const alerts = await Alert.find(toProductIdQuery(productId)).lean();
        return alerts.map(a => ({ ...a, _id: String(a._id), productId: String(a.productId) }));
    }

    async createAlert(data) {
        const alert = new Alert({
            _id: uuidv4(),
            productId: String(data.productId),
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
        const obj = alert.toObject();
        obj._id = String(obj._id);
        obj.productId = String(obj.productId);
        return obj;
    }

    async updateAlert(id, data) {
        const updateData = { ...data, updatedAt: new Date().toISOString() };
        if (updateData.productId) updateData.productId = String(updateData.productId);
        if (updateData.targetPrice !== undefined) {
            updateData.targetPrice = updateData.targetPrice != null ? Number(updateData.targetPrice) : null;
        }
        if (updateData.thresholdPercent !== undefined) {
            updateData.thresholdPercent = updateData.thresholdPercent != null ? Number(updateData.thresholdPercent) : null;
        }
        const alert = await Alert.findOneAndUpdate(
            toIdQuery(id),
            { $set: updateData },
            { new: true }
        ).lean();
        return alert ? { ...alert, _id: String(alert._id), productId: String(alert.productId) } : null;
    }

    async deleteAlert(id) {
        const result = await Alert.deleteOne(toIdQuery(id));
        return result.deletedCount > 0;
    }

    // Bundles
    async getBundles() {
        const bundles = await Bundle.find({}).sort({ createdAt: -1 }).lean();
        return bundles.map(b => ({
            ...b,
            _id: String(b._id),
            productIds: (b.productIds || []).map(String)
        }));
    }

    async getBundleById(id) {
        const bundle = await Bundle.findOne(toIdQuery(id)).lean();
        return bundle ? {
            ...bundle,
            _id: String(bundle._id),
            productIds: (bundle.productIds || []).map(String)
        } : null;
    }

    async createBundle(data) {
        const bundle = new Bundle({
            _id: uuidv4(),
            name: data.name.trim(),
            description: (data.description || '').trim(),
            productIds: (data.productIds || []).map(String),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        await bundle.save();
        const obj = bundle.toObject();
        obj._id = String(obj._id);
        obj.productIds = (obj.productIds || []).map(String);
        return obj;
    }

    async updateBundle(id, data) {
        const updateData = { updatedAt: new Date().toISOString() };
        if (data.name !== undefined) updateData.name = data.name.trim();
        if (data.description !== undefined) updateData.description = data.description.trim();
        if (data.productIds !== undefined) updateData.productIds = (data.productIds || []).map(String);

        const bundle = await Bundle.findOneAndUpdate(
            toIdQuery(id),
            { $set: updateData },
            { new: true }
        ).lean();
        return bundle ? {
            ...bundle,
            _id: String(bundle._id),
            productIds: (bundle.productIds || []).map(String)
        } : null;
    }

    async deleteBundle(id) {
        const result = await Bundle.deleteOne(toIdQuery(id));
        return result.deletedCount > 0;
    }

    async exportBackup() {
        const [products, priceRecords, stores, alerts, bundles, settings] = await Promise.all([
            this.Product.find({}).lean(),
            this.PriceRecord.find({}).lean(),
            this.Store.find({}).lean(),
            this.Alert.find({}).lean(),
            this.Bundle.find({}).lean(),
            this.Setting.findOne({ _id: 'default_settings' }).lean()
        ]);

        return {
            app: 'omniprice',
            version: '2.0.0',
            exportedAt: new Date().toISOString(),
            stats: {
                productsCount: products.length,
                priceRecordsCount: priceRecords.length,
                storesCount: stores.length,
                alertsCount: alerts.length,
                bundlesCount: bundles.length
            },
            data: {
                products,
                priceRecords,
                stores,
                alerts,
                bundles,
                settings: settings || defaultSettings
            }
        };
    }

    async importBackup(payload, mode = 'replace') {
        let data = (payload && payload.data) ? payload.data : (payload || {});
        if (data && data.data && (Array.isArray(data.data.products) || Array.isArray(data.data.stores) || Array.isArray(data.data.alerts))) {
            data = data.data;
        }
        const products = Array.isArray(data.products) ? data.products : [];
        const priceRecords = Array.isArray(data.priceRecords) ? data.priceRecords : (Array.isArray(data.price_records) ? data.price_records : []);
        const stores = Array.isArray(data.stores) ? data.stores : [];
        const alerts = Array.isArray(data.alerts) ? data.alerts : [];
        const bundles = Array.isArray(data.bundles) ? data.bundles : [];
        const settings = data.settings || null;

        if (mode === 'replace') {
            await Promise.all([
                this.Product.deleteMany({}),
                this.PriceRecord.deleteMany({}),
                this.Store.deleteMany({}),
                this.Alert.deleteMany({}),
                this.Bundle.deleteMany({})
            ]);

            if (products.length > 0) await this.Product.insertMany(products);
            if (priceRecords.length > 0) await this.PriceRecord.insertMany(priceRecords);
            if (stores.length > 0) await this.Store.insertMany(stores);
            if (alerts.length > 0) await this.Alert.insertMany(alerts);
            if (bundles.length > 0) await this.Bundle.insertMany(bundles);
            if (settings) {
                const settingsData = { ...settings, _id: 'default_settings' };
                await this.Setting.findOneAndUpdate(
                    { _id: 'default_settings' },
                    { $set: settingsData },
                    { upsert: true, new: true }
                );
            }
        } else {
            // mode === 'merge'
            for (const prod of products) {
                const prodId = prod._id || uuidv4();
                await this.Product.findOneAndUpdate(
                    { _id: prodId },
                    { $set: { ...prod, _id: prodId } },
                    { upsert: true, new: true }
                );
            }

            for (const record of priceRecords) {
                const recId = record._id || uuidv4();
                await this.PriceRecord.findOneAndUpdate(
                    { _id: recId },
                    { $set: { ...record, _id: recId } },
                    { upsert: true, new: true }
                );
            }

            for (const store of stores) {
                const storeId = store._id || uuidv4();
                await this.Store.findOneAndUpdate(
                    { _id: storeId },
                    { $set: { ...store, _id: storeId } },
                    { upsert: true, new: true }
                );
            }

            for (const alert of alerts) {
                const alertId = alert._id || uuidv4();
                await this.Alert.findOneAndUpdate(
                    { _id: alertId },
                    { $set: { ...alert, _id: alertId } },
                    { upsert: true, new: true }
                );
            }

            for (const bundle of bundles) {
                const bundleId = bundle._id || uuidv4();
                await this.Bundle.findOneAndUpdate(
                    { _id: bundleId },
                    { $set: { ...bundle, _id: bundleId } },
                    { upsert: true, new: true }
                );
            }

            if (settings) {
                await this.Setting.findOneAndUpdate(
                    { _id: 'default_settings' },
                    { $set: settings },
                    { upsert: true, new: true }
                );
            }
        }

        return {
            success: true,
            mode,
            restored: {
                products: products.length,
                priceRecords: priceRecords.length,
                stores: stores.length,
                alerts: alerts.length,
                bundles: bundles.length,
                settings: Boolean(settings)
            }
        };
    }
}

module.exports = MongoDatabase;
