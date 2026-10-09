const JsonDatabase = require('./json-database');

class DatabaseAdapter {
    constructor() {
        this.primary = null;
    }

    async init() {
        this.primary = new JsonDatabase();
        await this.primary.init();
        console.log('Using JSON database');
    }

    async _execute(method, ...args) {
        return this.primary[method](...args);
    }

    async getProducts() { return this._execute('getProducts'); }
    async getProductById(id) { return this._execute('getProductById', id); }
    async createProduct(data) { return this._execute('createProduct', data); }
    async updateProduct(id, data) { return this._execute('updateProduct', id, data); }
    async deleteProduct(id) { return this._execute('deleteProduct', id); }
    async addPriceHistory(productId, sourceIndex, price) { 
        return this._execute('addPriceHistory', productId, sourceIndex, price); 
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

    getMode() {
        return 'json';
    }
}

module.exports = new DatabaseAdapter();
