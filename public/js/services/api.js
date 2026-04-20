const API = {
    baseUrl: '/api',

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        const response = await fetch(url, config);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || 'Request failed');
        }

        return response.json();
    },

    products: {
        async getAll() {
            return API.request('/products');
        },

        async getById(id) {
            return API.request(`/products/${id}`);
        },

        async create(data) {
            return API.request('/products', {
                method: 'POST',
                body: data
            });
        },

        async update(id, data) {
            return API.request(`/products/${id}`, {
                method: 'PUT',
                body: data
            });
        },

        async delete(id) {
            return API.request(`/products/${id}`, {
                method: 'DELETE'
            });
        },

        async getTags() {
            return API.request('/products/meta/tags');
        }
    },

    scraper: {
        async scrapeSource(productId, sourceIndex) {
            return API.request(`/scraper/product/${productId}/source/${sourceIndex}`, {
                method: 'POST'
            });
        },

        async scrapeProduct(productId) {
            return API.request(`/scraper/product/${productId}`, {
                method: 'POST'
            });
        },

        async scrapeAll() {
            return API.request('/scraper/all', {
                method: 'POST'
            });
        }
    },

    settings: {
        async get() {
            return API.request('/settings');
        },

        async update(data) {
            return API.request('/settings', {
                method: 'PUT',
                body: data
            });
        }
    }
};
