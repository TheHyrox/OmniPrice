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

    getMode() {
        return 'json';
    }
}

module.exports = new DatabaseAdapter();
