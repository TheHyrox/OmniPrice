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

        async toggleActive(id, active) {
            return API.request(`/products/${id}/toggle`, {
                method: 'PATCH',
                body: active !== undefined ? { active } : {}
            });
        },

        async getHistory(id) {
            return API.request(`/products/${id}/history`);
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
        },

        async testSelector(url, cssSelector, usePuppeteer = false) {
            return API.request('/scraper/test', {
                method: 'POST',
                body: { url, cssSelector, usePuppeteer }
            });
        },

        async autodiscover(url) {
            return API.request('/scraper/autodiscover', {
                method: 'POST',
                body: { url }
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
        },

        async restoreBackup(data, mode = 'replace') {
            return API.request('/settings/restore', {
                method: 'POST',
                body: { data, mode }
            });
        }
    },

    stores: {
        async getAll() {
            return API.request('/stores');
        },

        async create(data) {
            return API.request('/stores', {
                method: 'POST',
                body: data
            });
        },

        async update(id, data) {
            return API.request(`/stores/${id}`, {
                method: 'PUT',
                body: data
            });
        },

        async delete(id) {
            return API.request(`/stores/${id}`, {
                method: 'DELETE'
            });
        },

        async syncAll() {
            return API.request('/stores/sync-all', {
                method: 'POST'
            });
        }
    },

    alerts: {
        async getAll() {
            return API.request('/alerts');
        },

        async getById(id) {
            return API.request(`/alerts/${id}`);
        },

        async create(data) {
            return API.request('/alerts', {
                method: 'POST',
                body: data
            });
        },

        async update(id, data) {
            return API.request(`/alerts/${id}`, {
                method: 'PUT',
                body: data
            });
        },

        async delete(id) {
            return API.request(`/alerts/${id}`, {
                method: 'DELETE'
            });
        },

        async testWebhook(webhookUrl) {
            return API.request('/alerts/test-webhook', {
                method: 'POST',
                body: { webhookUrl }
            });
        },

        async triggerTest(id) {
            return API.request(`/alerts/${id}/test-trigger`, {
                method: 'POST'
            });
        }
    },

    push: {
        async getVapidKey() {
            return API.request('/alerts/push/vapid-key');
        },

        async subscribe(subscription) {
            return API.request('/alerts/push/subscribe', {
                method: 'POST',
                body: subscription
            });
        },

        async sendTestNotification() {
            return API.request('/alerts/push/test', {
                method: 'POST'
            });
        }
    }
};
