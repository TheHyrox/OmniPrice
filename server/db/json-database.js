const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '../../data/db.json');

const defaultData = {
    products: [],
    settings: {
        theme: 'light',
        scrapeFrequency: 43200000
    }
};

class JsonDatabase {
    constructor() {
        this.db = null;
    }

    async init() {
        const adapter = new JSONFile(dbPath);
        this.db = new Low(adapter, defaultData);
        await this.db.read();
        
        if (!this.db.data.products) this.db.data.products = [];
        if (!this.db.data.settings) this.db.data.settings = defaultData.settings;
        
        await this.db.write();
        console.log('✓ JSON Database initialized');
    }

    async save() {
        await this.db.write();
    }

    // Products
    async getProducts() {
        return this.db.data.products || [];
    }

    async getProductById(id) {
        return this.db.data.products.find(p => p._id === id);
    }

    async createProduct(data) {
        const product = {
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
        this.db.data.products.push(product);
        await this.save();
        return product;
    }

    async updateProduct(id, data) {
        const index = this.db.data.products.findIndex(p => p._id === id);
        if (index === -1) return null;

        const product = {
            ...this.db.data.products[index],
            ...data,
            _id: id,
            createdAt: this.db.data.products[index].createdAt,
            updatedAt: new Date().toISOString()
        };

        this.db.data.products[index] = product;
        await this.save();
        return product;
    }

    async deleteProduct(id) {
        const index = this.db.data.products.findIndex(p => p._id === id);
        if (index === -1) return false;

        this.db.data.products.splice(index, 1);
        await this.save();
        return true;
    }

    async addPriceHistory(productId, sourceIndex, price) {
        const product = this.db.data.products.find(p => p._id === productId);
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
                url: product.sources[sourceIndex].url
            });
        }

        product.sources[sourceIndex].lastPrice = price;
        product.sources[sourceIndex].lastScraped = new Date().toISOString();

        this._updateVirtuals(product);

        await this.save();
        return product;
    }

    _updateVirtuals(product) {
        const prices = product.sources
            .filter(s => s.lastPrice !== null)
            .map(s => s.lastPrice);

        product.lowestPrice = prices.length > 0 ? Math.min(...prices) : null;

        if (product.lowestPrice !== null) {
            product.lowestPriceSource = product.sources.find(s => s.lastPrice === product.lowestPrice);
            if (product.referencePrice > 0) {
                product.priceDelta = ((product.lowestPrice - product.referencePrice) / product.referencePrice) * 100;
            }
        } else {
            product.lowestPriceSource = null;
            product.priceDelta = null;
        }
    }

    async getSettings() {
        return this.db.data.settings || defaultData.settings;
    }

    async updateSettings(data) {
        this.db.data.settings = { ...this.db.data.settings, ...data };
        await this.save();
        return this.db.data.settings;
    }
}

module.exports = JsonDatabase;
