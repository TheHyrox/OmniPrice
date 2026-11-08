/**
 * OmniPrice - Stores Controller
 * Manages store presets, multiple fallback selectors, and store synchronization.
 */
const StoresController = {
    stores: [],

    async loadStores() {
        try {
            this.stores = await API.getStores();
            if (window.App) window.App.stores = this.stores;
            this.renderStores();
        } catch (error) {
            console.error('Failed to load stores:', error);
            Toast.error('Failed to load store presets');
        }
    },

    renderStores() {
        const container = document.getElementById('storesGrid');
        if (!container) return;

        if (!this.stores || this.stores.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; padding: 48px;">
                    <div class="empty-state-icon">🏬</div>
                    <h3>No store presets configured</h3>
                    <p>Add preset templates to quickly auto-fill CSS selectors and recognize merchants when adding product URLs.</p>
                    <button class="btn btn-primary btn-sm" onclick="App.openStoreModal()" style="margin-top: 14px;">+ Create First Store</button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.stores.map(store => {
            const id = Utils.escapeHtml(store._id);
            const name = Utils.escapeHtml(store.name);
            const selector = Utils.escapeHtml(store.cssSelector);
            const defaultUrl = Utils.escapeHtml(store.defaultUrl || '');
            const selectorLines = (store.cssSelector || '').split(/\r?\n|\|/).map(s => s.trim()).filter(Boolean);
            const hasMultipleSelectors = selectorLines.length > 1;

            return `
                <div class="store-card">
                    <div class="store-card-header">
                        <div class="store-icon">🏬</div>
                        <div>
                            <h3 class="store-name">${name}</h3>
                            ${defaultUrl ? `
                                <a href="${defaultUrl}" target="_blank" rel="noopener" class="store-domain">
                                    ${defaultUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]} ↗
                                </a>
                            ` : '<span class="store-domain" style="color: var(--text-tertiary);">No default domain</span>'}
                        </div>
                    </div>
                    <div class="store-body">
                        <div class="store-meta">
                            <span class="store-meta-label">CSS Price Selector${hasMultipleSelectors ? ` (${selectorLines.length} fallbacks)` : ''}:</span>
                            <code class="store-selector" title="Click to copy" onclick="navigator.clipboard.writeText('${selector}'); Toast.info('Selectors copied to clipboard!');">${selector}</code>
                        </div>
                    </div>
                    <div class="store-footer">
                        <button class="btn btn-secondary btn-sm" onclick="App.openStoreModal('${id}')">Edit</button>
                        <button class="btn btn-ghost btn-sm" onclick="App.deleteStore('${id}')" style="color: var(--danger);">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    openStoreModal(storeId = null) {
        const modal = document.getElementById('storeModal');
        const form = document.getElementById('storeForm');
        const title = document.getElementById('storeModalTitle');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('storeId').value = '';

        if (storeId) {
            const store = this.stores.find(s => s._id === storeId);
            if (store) {
                title.textContent = 'Edit Store Preset';
                document.getElementById('storeId').value = store._id;
                document.getElementById('storeName').value = store.name;
                document.getElementById('storeCssSelector').value = store.cssSelector;
                document.getElementById('storeDefaultUrl').value = store.defaultUrl || '';
                document.getElementById('storeSyncProducts').checked = true;
            }
        } else {
            title.textContent = 'Add Store Preset';
            document.getElementById('storeSyncProducts').checked = false;
        }

        modal.classList.add('active');
        document.getElementById('storeName').focus();
    },

    closeStoreModal() {
        const modal = document.getElementById('storeModal');
        if (modal) modal.classList.remove('active');
    },

    async handleStoreFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('storeId').value;
        const name = document.getElementById('storeName').value.trim();
        const cssSelector = document.getElementById('storeCssSelector').value.trim();
        const defaultUrl = document.getElementById('storeDefaultUrl').value.trim();
        const syncProducts = document.getElementById('storeSyncProducts').checked;

        if (!name || !cssSelector) {
            Toast.warning('Store name and CSS selector are required.');
            return;
        }

        const data = { name, cssSelector, defaultUrl, syncProducts };

        try {
            if (id) {
                await API.updateStore(id, data);
                Toast.success(`Store "${name}" updated successfully!`);
            } else {
                await API.createStore(data);
                Toast.success(`Store "${name}" created successfully!`);
            }

            this.closeStoreModal();
            await this.loadStores();
            if (window.App && typeof window.App.loadProducts === 'function') {
                window.App.loadProducts();
            }
        } catch (error) {
            Toast.error('Error saving store: ' + error.message);
        }
    },

    async deleteStore(id) {
        const store = this.stores.find(s => s._id === id);
        const name = store ? store.name : 'this store preset';

        const confirmed = await Confirm.ask({
            title: 'Delete Store Preset',
            message: `Are you sure you want to delete "${name}"? Existing product sources using this preset will not be deleted, but auto-fill for this merchant will stop.`,
            confirmText: 'Delete Preset',
            danger: true
        });

        if (!confirmed) return;

        try {
            await API.deleteStore(id);
            Toast.success('Store preset deleted successfully');
            await this.loadStores();
        } catch (error) {
            Toast.error('Error deleting store: ' + error.message);
        }
    },

    async syncAllStores() {
        const confirmed = await Confirm.ask({
            title: 'Sync Products with Stores',
            message: 'This will update the CSS selector of every product source matching any store preset name. Continue?',
            confirmText: 'Sync All'
        });

        if (!confirmed) return;

        const btn = document.getElementById('syncAllStoresBtn');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Syncing...';
        }

        try {
            const res = await API.syncAllProductsWithStores();
            Toast.success(`Sync complete! Updated ${res.updatedSourcesCount} source(s) across ${res.updatedProductsCount} product(s).`);
            if (window.App && typeof window.App.loadProducts === 'function') {
                await window.App.loadProducts();
            }
        } catch (error) {
            Toast.error('Error syncing stores: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    }
};

window.StoresController = StoresController;
