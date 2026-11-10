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

    renderStoreIntelligence() {
        const intelContainer = document.getElementById('storesIntelligenceContainer');
        if (!intelContainer) return;

        const kpi = window.App?.settings?.kpiVisibility || {};
        if (kpi.showStoreVolatility === false || typeof window === 'undefined' || !window.Analytics) {
            intelContainer.innerHTML = '';
            intelContainer.style.display = 'none';
            return;
        }

        const products = window.App?.products || [];
        const intelList = window.Analytics.calculateStoreVolatility(products);

        if (!intelList || intelList.length === 0) {
            intelContainer.innerHTML = '';
            intelContainer.style.display = 'none';
            return;
        }

        intelContainer.style.display = 'block';
        intelContainer.innerHTML = `
            <div class="store-intel-card">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.0625rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            Retailer Volatility & Win-Rate Index
                        </h3>
                        <p style="margin: 3px 0 0 0; font-size: 0.8125rem; color: var(--text-secondary);">
                            Behavioral pricing analysis, discount depths, and lowest-price win rates across all tracked products
                        </p>
                    </div>
                    <span class="badge" style="font-size: 0.75rem; padding: 4px 8px; background: rgba(37, 99, 235, 0.1); color: #2563eb; font-weight: 600; border-radius: 6px;">
                        ${intelList.length} Active Merchant${intelList.length !== 1 ? 's' : ''}
                    </span>
                </div>

                <div class="store-intel-table-wrap">
                    <table class="store-intel-table">
                        <thead>
                            <tr>
                                <th>Store Name</th>
                                <th>Monitored Items</th>
                                <th>Lowest-Price Win Rate</th>
                                <th>Pricing Volatility</th>
                                <th>Price Changes</th>
                                <th>Avg Drop Depth</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${intelList.map(item => `
                                <tr>
                                    <td>
                                        <strong>${Utils.escapeHtml(item.name)}</strong>
                                    </td>
                                    <td>
                                        <span>${item.productsCount} item${item.productsCount !== 1 ? 's' : ''}</span>
                                    </td>
                                    <td>
                                        <div class="winrate-bar-container">
                                            <div class="winrate-bar">
                                                <div class="winrate-bar-fill" style="width: ${item.winRate}%;"></div>
                                            </div>
                                            <span><strong>${item.winRate}%</strong> (${item.cheapestCount})</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span class="volatility-badge ${item.volatilityBadgeClass}">
                                            ${Utils.escapeHtml(item.volatilityLabel)}
                                        </span>
                                    </td>
                                    <td>
                                        <span style="color: var(--text-secondary);">${item.priceChanges} changes (${item.changesPerProduct}/prod)</span>
                                    </td>
                                    <td>
                                        <span style="color: ${item.avgDiscountDepth > 0 ? 'var(--success)' : 'var(--text-secondary)'}; font-weight: 500;">
                                            ${item.avgDiscountDepth > 0 ? `-${item.avgDiscountDepth}%` : '—'}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderStores() {
        this.renderStoreIntelligence();
        const container = document.getElementById('storesGrid');
        if (!container) return;

        if (!this.stores || this.stores.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; padding: 48px;">
                    <div class="empty-state-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-tertiary);">
                            <path d="M3 3h18l-2 9H5L3 3z"></path>
                            <path d="M5 12v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"></path>
                            <path d="M9 22V12"></path>
                            <path d="M15 22V12"></path>
                        </svg>
                    </div>
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
            const defaultUrl = Utils.escapeHtml(store.defaultUrl || '');
            const selectorLines = (store.cssSelector || '').split(/\r?\n|\|/).map(s => s.trim()).filter(Boolean);
            const hasMultipleSelectors = selectorLines.length > 1;

            return `
                <div class="store-card">
                    <div class="store-card-header">
                        <div class="store-icon" title="Store Preset">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 3h18l-2 9H5L3 3z"></path>
                                <path d="M5 12v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"></path>
                                <path d="M9 22V12"></path>
                                <path d="M15 22V12"></path>
                            </svg>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <h3 class="store-name">${name}</h3>
                            ${defaultUrl ? `
                                <a href="${defaultUrl}" target="_blank" rel="noopener" class="store-domain">
                                    <span>${defaultUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}</span>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                </a>
                            ` : '<span class="store-domain" style="color: var(--text-tertiary);">No default domain</span>'}
                        </div>
                    </div>
                    <div class="store-body">
                        <div class="store-meta">
                            <span class="store-meta-label">CSS Price Selectors (${selectorLines.length} in preference order):</span>
                            <ol class="store-card-selector-list">
                                ${selectorLines.map((sel, idx) => `
                                    <li class="store-card-selector-item">
                                        <span class="selector-step-number">${idx + 1}</span>
                                        <code class="store-selector" title="Click to copy selector" onclick="navigator.clipboard.writeText('${Utils.escapeHtml(sel)}'); Toast.info('Selector copied to clipboard!');">${Utils.escapeHtml(sel)}</code>
                                        <span class="selector-rank-badge ${idx === 0 ? 'primary' : 'fallback'}">${idx === 0 ? 'Primary' : 'Fallback'}</span>
                                    </li>
                                `).join('')}
                            </ol>
                        </div>
                    </div>
                    <div class="store-footer">
                        <button class="btn btn-secondary btn-sm" onclick="App.openStoreModal('${id}')">Edit</button>
                        <button class="btn btn-ghost btn-sm" onclick="App.deleteStore('${id}')" style="color: var(--danger); margin-left: auto;">Delete</button>
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

        let selectors = [''];

        if (storeId) {
            const store = this.stores.find(s => s._id === storeId);
            if (store) {
                title.textContent = 'Edit Store Preset';
                document.getElementById('storeId').value = store._id;
                document.getElementById('storeName').value = store.name;
                document.getElementById('storeDefaultUrl').value = store.defaultUrl || '';
                document.getElementById('storeSyncProducts').checked = true;

                const parsed = (store.cssSelector || '').split(/\r?\n|\|/).map(s => s.trim()).filter(Boolean);
                if (parsed.length > 0) {
                    selectors = parsed;
                }
            }
        } else {
            title.textContent = 'Add Store Preset';
            document.getElementById('storeSyncProducts').checked = false;
        }

        this.renderSelectorList(selectors);
        modal.classList.add('active');
        document.getElementById('storeName').focus();
    },

    renderSelectorList(selectors = ['']) {
        const container = document.getElementById('storeSelectorsList');
        if (!container) return;

        const list = selectors.length > 0 ? selectors : [''];

        container.innerHTML = list.map((val, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === list.length - 1;
            const rankLabel = isFirst ? 'Primary' : 'Fallback';
            const placeholder = isFirst ? 'e.g. span.price (Primary selector)' : `e.g. div.price (Fallback #${idx})`;

            return `
                <li class="store-selector-row" data-index="${idx}">
                    <div class="selector-row-badge">${idx + 1}</div>
                    <div class="selector-row-content">
                        <input type="text" class="store-selector-row-input" placeholder="${placeholder}" value="${Utils.escapeHtml(val)}" />
                        <span class="selector-row-tag ${isFirst ? 'primary' : 'fallback'}">${rankLabel}</span>
                    </div>
                    <div class="selector-row-actions">
                        <button type="button" class="selector-btn-icon selector-move-up" title="Move up in preference" ${isFirst ? 'disabled' : ''} onclick="StoresController.moveSelectorRow(${idx}, -1)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>
                        </button>
                        <button type="button" class="selector-btn-icon selector-move-down" title="Move down in preference" ${isLast ? 'disabled' : ''} onclick="StoresController.moveSelectorRow(${idx}, 1)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>
                        <button type="button" class="selector-btn-icon delete selector-remove" title="Remove fallback selector" ${list.length <= 1 ? 'disabled style="opacity: 0.2; pointer-events: none;"' : ''} onclick="StoresController.removeSelectorRow(${idx})">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </li>
            `;
        }).join('');
    },

    getSelectorsFromList() {
        const inputs = document.querySelectorAll('#storeSelectorsList .store-selector-row-input');
        return Array.from(inputs).map(inp => inp.value.trim()).filter(Boolean);
    },

    addSelectorRow(value = '') {
        const current = Array.from(document.querySelectorAll('#storeSelectorsList .store-selector-row-input')).map(inp => inp.value);
        current.push(value);
        this.renderSelectorList(current);

        // Focus the newly created row input
        const allInputs = document.querySelectorAll('#storeSelectorsList .store-selector-row-input');
        const lastInput = allInputs[allInputs.length - 1];
        if (lastInput) lastInput.focus();
    },

    moveSelectorRow(index, direction) {
        const current = Array.from(document.querySelectorAll('#storeSelectorsList .store-selector-row-input')).map(inp => inp.value);
        const target = index + direction;
        if (target < 0 || target >= current.length) return;

        const temp = current[index];
        current[index] = current[target];
        current[target] = temp;

        this.renderSelectorList(current);
    },

    removeSelectorRow(index) {
        const current = Array.from(document.querySelectorAll('#storeSelectorsList .store-selector-row-input')).map(inp => inp.value);
        current.splice(index, 1);
        this.renderSelectorList(current.length > 0 ? current : ['']);
    },

    closeStoreModal() {
        const modal = document.getElementById('storeModal');
        if (modal) modal.classList.remove('active');
    },

    async handleStoreFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('storeId').value;
        const name = document.getElementById('storeName').value.trim();
        const defaultUrl = document.getElementById('storeDefaultUrl').value.trim();
        const syncProducts = document.getElementById('storeSyncProducts').checked;

        const selectors = this.getSelectorsFromList();
        if (!name) {
            Toast.warning('Store name is required.');
            return;
        }

        if (selectors.length === 0) {
            Toast.warning('Please enter at least one CSS price selector.');
            const firstInput = document.querySelector('#storeSelectorsList .store-selector-row-input');
            if (firstInput) firstInput.focus();
            return;
        }

        const cssSelector = selectors.join('\n');
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
