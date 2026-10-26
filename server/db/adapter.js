const MongoDatabase = require('./mongo-database');

class DatabaseAdapter {
    constructor() {
        this.primary = new MongoDatabase();
        this.mode = 'mongodb';
    }

    async init() {
        await this.primary.init();
        console.log(`Database initialized in [${this.mode}] mode`);
    }

    async _execute(method, ...args) {
        return this.primary[method](...args);
    }

    async getProducts(options) { return this._execute('getProducts', options); }
    async getProductById(id) { return this._execute('getProductById', id); }
    async createProduct(data) { return this._execute('createProduct', data); }
    async updateProduct(id, data) { return this._execute('updateProduct', id, data); }
    async deleteProduct(id) { return this._execute('deleteProduct', id); }
    async addPriceHistory(productId, sourceIndex, price) { 
        return this._execute('addPriceHistory', productId, sourceIndex, price); 
    }
    async getPriceHistory(productId) { 
        return this._execute('getPriceHistory', productId); 
    }
    async getSettings() { return this._execute('getSettings'); }
    async updateSettings(data) { return this._execute('updateSettings', data); }
    async getStores() { return this._execute('getStores'); }
    async getStoreById(id) { return this._execute('getStoreById', id); }
    async createStore(data) { return this._execute('createStore', data); }
    async updateStore(id, data) { return this._execute('updateStore', id, data); }
    async deleteStore(id) { return this._execute('deleteStore', id); }
    async syncProductsWithStore(oldStoreName, newStoreName, newCssSelector) {
        return this._execute('syncProductsWithStore', oldStoreName, newStoreName, newCssSelector);
    }
    async syncAllProductsWithStores() {
        return this._execute('syncAllProductsWithStores');
    }
    async getAlerts() { return this._execute('getAlerts'); }
    async getAlertById(id) { return this._execute('getAlertById', id); }
    async getAlertsByProductId(productId) { return this._execute('getAlertsByProductId', productId); }
    async createAlert(data) { return this._execute('createAlert', data); }
    async updateAlert(id, data) { return this._execute('updateAlert', id, data); }
    async deleteAlert(id) { return this._execute('deleteAlert', id); }
    async exportBackup() { return this._execute('exportBackup'); }
    async importBackup(data, mode) { return this._execute('importBackup', data, mode); }

    getMode() {
        return this.mode;
    }
}

module.exports = new DatabaseAdapter();
