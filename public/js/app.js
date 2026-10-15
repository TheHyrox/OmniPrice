const App = {
    products: [],
    stores: [],
    alerts: [],
    currentView: 'card',
    currentSort: 'delta',
    filters: {
        search: '',
        priceMin: null,
        priceMax: null,
        tags: [],
        dealType: 'all' // 'all' | 'deals' | 'atl' | 'active' | 'paused'
    },
    allTags: [],

    async init() {
        this.bindEvents();
        this.loadTheme();
        await this.loadStores();
        await this.loadProducts();
        await this.loadAlerts();
        await this.loadSettings();
        this.setupChartTimeframes();
        this.initServiceWorkerAndPush();
    },

    bindEvents() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateToTab(link.dataset.tab);
            });
        });

        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.querySelectorAll('.theme-opt').forEach(btn => {
            btn.addEventListener('click', () => this.setTheme(btn.dataset.theme));
        });

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setView(btn.dataset.view));
        });

        document.getElementById('sortSelect').addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.renderProducts();
        });

        // Search Input with Clear Button
        const searchInput = document.getElementById('searchInput');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value.toLowerCase().trim();
                if (clearSearchBtn) clearSearchBtn.style.display = e.target.value ? 'block' : 'none';
                this.renderProducts();
            });
            if (clearSearchBtn) {
                clearSearchBtn.addEventListener('click', () => {
                    searchInput.value = '';
                    this.filters.search = '';
                    clearSearchBtn.style.display = 'none';
                    this.renderProducts();
                });
            }
        }

        // Quick Filters (All, Deals, ATL, Active, Paused)
        document.querySelectorAll('.quick-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filters.dealType = btn.dataset.filter;
                this.renderProducts();
            });
        });

        // Price Min & Max with Clear Button
        const priceMin = document.getElementById('priceMin');
        const priceMax = document.getElementById('priceMax');
        const clearPriceBtn = document.getElementById('clearPriceFilterBtn');
        const updatePriceClear = () => {
            if (clearPriceBtn) {
                clearPriceBtn.style.display = (priceMin?.value || priceMax?.value) ? 'inline-block' : 'none';
            }
        };

        priceMin?.addEventListener('input', (e) => {
            this.filters.priceMin = e.target.value ? parseFloat(e.target.value) : null;
            updatePriceClear();
            this.renderProducts();
        });
        priceMax?.addEventListener('input', (e) => {
            this.filters.priceMax = e.target.value ? parseFloat(e.target.value) : null;
            updatePriceClear();
            this.renderProducts();
        });
        clearPriceBtn?.addEventListener('click', () => {
            if (priceMin) priceMin.value = '';
            if (priceMax) priceMax.value = '';
            this.filters.priceMin = null;
            this.filters.priceMax = null;
            updatePriceClear();
            this.renderProducts();
        });

        document.getElementById('addProductBtn').addEventListener('click', () => this.openModal());
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelModal').addEventListener('click', () => this.closeModal());
        document.getElementById('productForm').addEventListener('submit', (e) => this.handleFormSubmit(e));

        document.getElementById('imageUrl').addEventListener('input', (e) => this.previewImageUrl(e.target.value));
        document.getElementById('imageFile').addEventListener('change', (e) => this.handleImageFile(e));

        document.getElementById('addSourceBtn').addEventListener('click', () => this.addSourceRow());

        document.getElementById('addStoreBtn')?.addEventListener('click', () => this.openStoreModal());
        document.getElementById('closeStoreModal')?.addEventListener('click', () => this.closeStoreModal());
        document.getElementById('cancelStoreModal')?.addEventListener('click', () => this.closeStoreModal());
        document.getElementById('storeForm')?.addEventListener('submit', (e) => this.handleStoreFormSubmit(e));
        document.getElementById('syncAllStoresBtn')?.addEventListener('click', () => this.syncAllStores());

        // Alerts Modal
        document.getElementById('addAlertBtn')?.addEventListener('click', () => this.openAlertModal());
        document.getElementById('closeAlertModal')?.addEventListener('click', () => this.closeAlertModal());
        document.getElementById('cancelAlertModal')?.addEventListener('click', () => this.closeAlertModal());
        document.getElementById('alertForm')?.addEventListener('submit', (e) => this.handleAlertFormSubmit(e));
        document.getElementById('alertProductSelect')?.addEventListener('change', (e) => this.onAlertProductSelectChange(e));
        document.getElementById('alertTypeSelect')?.addEventListener('change', (e) => {
            const notifyGroup = document.getElementById('notifyOnRiseGroup');
            if (notifyGroup) {
                notifyGroup.style.display = e.target.value === 'rise' ? 'none' : 'block';
            }
        });

        // Notifications: Discord & Web Push
        document.getElementById('saveDiscordBtn')?.addEventListener('click', () => this.saveDiscordSettings());
        document.getElementById('testDiscordBtn')?.addEventListener('click', () => this.testDiscordWebhook());
        document.getElementById('enablePushBtn')?.addEventListener('click', () => this.subscribeToPush());
        document.getElementById('testPushBtn')?.addEventListener('click', () => this.sendTestPush());

        document.getElementById('backToProducts').addEventListener('click', () => this.navigateToTab('products'));

        document.getElementById('productsGrid').addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (card && !e.target.closest('a')) {
                this.showProductDetail(card.dataset.id);
            }
        });

        document.getElementById('scrapeAllBtn')?.addEventListener('click', () => this.scrapeAll());

        document.getElementById('scrapeFrequency')?.addEventListener('change', async (e) => {
            await API.settings.update({ scrapeFrequency: parseInt(e.target.value) });
        });
    },

    previousTab: 'products',

    navigateToTab(tabName) {
        if (tabName !== 'product-detail') {
            this.previousTab = tabName;
        }

        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.tab === tabName);
        });

        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`)?.classList.add('active');

        if (tabName === 'charts' && this.products.length > 0) {
            setTimeout(() => Charts.init(this.products), 100);
        }
        if (tabName === 'alerts') {
            this.loadAlerts();
        }
        if (tabName === 'settings') {
            this.loadSettings();
        }
    },

    backToPreviousTab() {
        this.navigateToTab(this.previousTab || 'products');
    },

    async loadProducts() {
        const grid = document.getElementById('productsGrid');
        grid.innerHTML = ProductCard.renderLoading();

        try {
            this.products = await API.products.getAll();
            this.updateTags();
            this.renderProducts();
            if (document.getElementById('charts-tab')?.classList.contains('active')) {
                Charts.init(this.products);
            }
        } catch (error) {
            grid.innerHTML = `<div class="empty-state"><p>Error loading products: ${error.message}</p></div>`;
        }
    },

    renderProductsKpis() {
        const container = document.getElementById('productsKpiContainer');
        if (!container) return;

        if (!this.products || this.products.length === 0) {
            container.innerHTML = '';
            return;
        }

        const totalCount = this.products.length;
        const activeCount = this.products.filter(p => p.active !== false).length;
        const pausedCount = totalCount - activeCount;
        const dealsCount = this.products.filter(p => p.priceDelta != null && p.priceDelta < 0).length;
        const atlCount = this.products.filter(p => ProductCard.isAtAllTimeLow(p)).length;

        let topDeal = null;
        let bestDelta = 0;
        this.products.forEach(p => {
            if (p.priceDelta != null && p.priceDelta < bestDelta) {
                bestDelta = p.priceDelta;
                topDeal = p;
            }
        });

        container.innerHTML = `
            <div class="product-kpi-card">
                <div class="kpi-header">
                    <span>Monitored Products</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value">${totalCount}</span>
                    <span class="kpi-badge ${pausedCount === 0 ? 'positive' : 'neutral'}">${activeCount} Active</span>
                </div>
                <span class="kpi-sub">${pausedCount > 0 ? `${pausedCount} paused · ` : ''}${this.stores ? this.stores.length : 0} preset stores</span>
            </div>

            <div class="product-kpi-card">
                <div class="kpi-header">
                    <span>Active Price Drops</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value">${dealsCount}</span>
                    <span class="kpi-badge ${dealsCount > 0 ? 'positive' : 'neutral'}">${dealsCount > 0 ? 'Savings' : 'None'}</span>
                </div>
                <span class="kpi-sub">Items below reference price</span>
            </div>

            <div class="product-kpi-card">
                <div class="kpi-header">
                    <span>At All-Time Low</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value">${atlCount}</span>
                    <span class="kpi-badge ${atlCount > 0 ? 'positive' : 'neutral'}">${atlCount > 0 ? 'Lowest Ever' : 'None'}</span>
                </div>
                <span class="kpi-sub">Historic price minimums</span>
            </div>

            <div class="product-kpi-card">
                <div class="kpi-header">
                    <span>Top Bargain</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value">${topDeal ? `${bestDelta.toFixed(1)}%` : '—'}</span>
                    ${topDeal ? `<span class="kpi-badge positive">Deal</span>` : ''}
                </div>
                <span class="kpi-sub" title="${escapeHtml(topDeal?.title || '')}">
                    ${escapeHtml(topDeal?.title || 'No discounts yet')}
                </span>
            </div>
        `;
    },

    renderProducts() {
        this.renderProductsKpis();
        const grid = document.getElementById('productsGrid');
        if (!grid) return;
        
        let filtered = this.products.filter(p => {
            if (this.filters.search) {
                const searchMatch = p.title.toLowerCase().includes(this.filters.search) ||
                    (p.tags || []).some(t => t.toLowerCase().includes(this.filters.search));
                if (!searchMatch) return false;
            }
            
            const price = ProductCard.sanitizePrice(p.lowestPrice, p.referencePrice);
            if (this.filters.priceMin !== null && (price === null || price < this.filters.priceMin)) return false;
            if (this.filters.priceMax !== null && (price === null || price > this.filters.priceMax)) return false;
            if (this.filters.tags.length > 0) {
                if (!this.filters.tags.some(t => (p.tags || []).includes(t))) return false;
            }

            if (this.filters.dealType === 'deals') {
                if (p.priceDelta == null || p.priceDelta >= 0) return false;
            } else if (this.filters.dealType === 'atl') {
                if (!ProductCard.isAtAllTimeLow(p)) return false;
            } else if (this.filters.dealType === 'active') {
                if (p.active === false) return false;
            } else if (this.filters.dealType === 'paused') {
                if (p.active !== false) return false;
            }
            
            return true;
        });

        filtered.sort((a, b) => {
            const pA = ProductCard.sanitizePrice(a.lowestPrice, a.referencePrice) ?? Infinity;
            const pB = ProductCard.sanitizePrice(b.lowestPrice, b.referencePrice) ?? Infinity;

            switch (this.currentSort) {
                case 'delta':
                    const deltaA = a.priceDelta ?? Infinity;
                    const deltaB = b.priceDelta ?? Infinity;
                    return deltaA - deltaB;
                case 'price-asc':
                    return pA - pB;
                case 'price-desc':
                    return pB - pA;
                case 'alpha':
                    return a.title.localeCompare(b.title);
                case 'date':
                    return new Date(b.createdAt) - new Date(a.createdAt);
                default:
                    return 0;
            }
        });

        if (filtered.length === 0) {
            grid.innerHTML = ProductCard.renderEmpty();
            return;
        }

        grid.className = `products-grid ${this.currentView === 'list' ? 'list-view' : ''}`;
        grid.innerHTML = filtered.map(p => ProductCard.render(p, this.currentView)).join('');
    },

    filterByTag(tag) {
        if (!tag) return;
        const index = this.filters.tags.indexOf(tag);
        if (index >= 0) {
            this.filters.tags.splice(index, 1);
        } else {
            this.filters.tags.push(tag);
        }
        this.updateTags();
        this.renderProducts();
    },

    updateTags() {
        const allTags = [...new Set(this.products.flatMap(p => p.tags || []))];
        this.allTags = allTags;
        
        const container = document.getElementById('tagFilters');
        if (!container) return;

        container.innerHTML = allTags.map(tag => `
            <button class="tag-filter ${this.filters.tags.includes(tag) ? 'active' : ''}" data-tag="${escapeHtml(tag)}">
                #${escapeHtml(tag)}
            </button>
        `).join('');
        
        container.querySelectorAll('.tag-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag;
                this.filterByTag(tag);
            });
        });
    },

    setView(view) {
        this.currentView = view;
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        this.renderProducts();
    },

    loadTheme() {
        const saved = localStorage.getItem('omniprice-theme') || 'light';
        this.setTheme(saved);
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('omniprice-theme', theme);
        
        document.querySelectorAll('.theme-opt').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        this.setTheme(current === 'dark' ? 'light' : 'dark');
    },

    openModal(product = null) {
        const modal = document.getElementById('productModal');
        const title = document.getElementById('modalTitle');
        
        if (product) {
            title.textContent = 'Edit Product';
            this.populateForm(product);
        } else {
            title.textContent = 'Add Product';
            this.resetForm();
            this.addSourceRow();
        }
        
        modal.classList.add('active');
    },

    closeModal() {
        document.getElementById('productModal').classList.remove('active');
        this.resetForm();
    },

    resetForm() {
        document.getElementById('productForm').reset();
        document.getElementById('productId').value = '';
        const activeBox = document.getElementById('productActive');
        if (activeBox) activeBox.checked = true;
        document.getElementById('imagePreview').innerHTML = '<span class="placeholder">No image</span>';
        document.getElementById('sourcesContainer').innerHTML = '';
    },

    populateForm(product) {
        document.getElementById('productId').value = product._id;
        document.getElementById('productTitle').value = product.title;
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productRefPrice').value = product.referencePrice;
        document.getElementById('productTags').value = (product.tags || []).join(', ');
        const activeBox = document.getElementById('productActive');
        if (activeBox) activeBox.checked = product.active !== false;
        
        if (product.image) {
            document.getElementById('imagePreview').innerHTML = `<img src="${product.image}" alt="Preview">`;
            document.getElementById('imageUrl').value = product.image;
        }
        
        const container = document.getElementById('sourcesContainer');
        if (product.sources && product.sources.length > 0) {
            container.innerHTML = product.sources.map((s, i) => this.sourceRowHTML(s)).join('');
        } else {
            this.addSourceRow();
        }
    },

    sourceRowHTML(source = {}) {
        const storeOptions = (this.stores || []).map(store => {
            const selected = source.siteName === store.name ? 'selected' : '';
            return `<option value="${escapeHtml(store._id)}" 
                            data-name="${escapeHtml(store.name)}" 
                            data-selector="${escapeHtml(store.cssSelector)}" 
                            data-url="${escapeHtml(store.defaultUrl || '')}" 
                            ${selected}>${escapeHtml(store.name)}</option>`;
        }).join('');

        const isKnownStore = (this.stores || []).some(s => s.name === source.siteName);

        return `
            <div class="modal-source-item source-item">
                <div class="modal-source-header">
                    <div class="modal-source-title">
                        <span class="modal-source-index">Store Feed</span>
                        <span class="source-store-badge">${escapeHtml(source.siteName || 'New Store')}</span>
                    </div>
                    <button type="button" class="remove-source-btn" onclick="this.closest('.modal-source-item').remove()" title="Remove store feed">
                        <span>Remove</span> ×
                    </button>
                </div>

                <div class="modal-source-body">
                    <div class="modal-source-row">
                        <div class="source-field source-field-preset">
                            <label>Store Template</label>
                            <select class="source-preset-select" onchange="App.onSourcePresetSelectChange(this)">
                                <option value="">Custom Store</option>
                                ${storeOptions}
                            </select>
                        </div>
                        <div class="source-field source-field-name">
                            <label>Store Name <span class="required">*</span></label>
                            <input type="text" placeholder="e.g. Amazon, Fnac, Darty" value="${escapeHtml(source.siteName || '')}" class="source-name-input" required />
                        </div>
                    </div>

                    <div class="modal-source-row">
                        <div class="source-field source-field-url">
                            <label>Product Page URL <span class="required">*</span></label>
                            <input type="url" placeholder="https://www.example.com/product/12345" value="${escapeHtml(source.url || '')}" class="source-url-input" required />
                        </div>
                    </div>

                    <div class="modal-source-row">
                        <div class="source-field source-field-selector">
                            <label>
                                <span>CSS Price Selector <span class="required">*</span></span>
                                <span class="source-label-hint">HTML tag or class containing the price</span>
                            </label>
                            <input type="text" placeholder="e.g. .a-price .a-offscreen, span.price" value="${escapeHtml(source.cssSelector || '')}" class="source-selector-input" required />
                        </div>
                    </div>

                    <div class="modal-source-row modal-source-actions-row" style="margin-top: 10px;">
                        <div class="source-field" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
                            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; cursor: pointer; margin: 0;">
                                <input type="checkbox" class="source-puppeteer-input" ${source.usePuppeteer ? 'checked' : ''} style="width: auto; margin: 0;" />
                                <span>Use Puppeteer (Dynamic/JS sites)</span>
                            </label>
                            <button type="button" class="btn btn-secondary btn-sm test-selector-btn" onclick="App.testSourceSelector(this)">
                                Test Selector
                            </button>
                        </div>
                        <div class="test-selector-result" style="display: none; width: 100%; margin-top: 8px; font-size: 0.8125rem;"></div>
                    </div>
                </div>
            </div>
        `;
    },

    onSourcePresetSelectChange(selectElem) {
        const selectedOpt = selectElem.options[selectElem.selectedIndex];
        const itemRow = selectElem.closest('.source-item') || selectElem.closest('#addSourceForm') || selectElem.closest('.add-source-card');
        if (!itemRow) return;

        const selectorInput = itemRow.querySelector('.source-selector-input') || itemRow.querySelector('#newSourceSelector');
        const nameInput = itemRow.querySelector('.source-name-input') || itemRow.querySelector('#newSourceName');
        const urlInput = itemRow.querySelector('.source-url-input') || itemRow.querySelector('#newSourceUrl');
        const badge = itemRow.querySelector('.source-store-badge');

        if (selectedOpt.value) {
            const name = selectedOpt.dataset.name;
            const selector = selectedOpt.dataset.selector;
            const defaultUrl = selectedOpt.dataset.url;
            if (nameInput) nameInput.value = name;
            if (selectorInput) selectorInput.value = selector;
            if (urlInput && !urlInput.value && defaultUrl) urlInput.value = defaultUrl;
            if (badge) badge.textContent = name;
        } else {
            if (badge) badge.textContent = nameInput?.value?.trim() || 'Custom Store';
        }
    },

    addSourceRow() {
        const container = document.getElementById('sourcesContainer');
        container.insertAdjacentHTML('beforeend', this.sourceRowHTML());
    },

    previewImageUrl(url) {
        if (url && (url.startsWith('http') || url.startsWith('/images/'))) {
            document.getElementById('imagePreview').innerHTML = `<img src="${url}" alt="Preview" onerror="this.parentElement.innerHTML='<span class=\\'placeholder\\'>Invalid URL</span>'">`;
        }
    },

    handleImageFile(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('imagePreview').innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                document.getElementById('imageUrl').value = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    },

    async handleFormSubmit(e) {
        e.preventDefault();
        
        const id = document.getElementById('productId').value;
        const activeBox = document.getElementById('productActive');
        const data = {
            title: document.getElementById('productTitle').value,
            description: document.getElementById('productDescription').value,
            referencePrice: parseFloat(document.getElementById('productRefPrice').value),
            tags: document.getElementById('productTags').value.split(',').map(t => t.trim()).filter(t => t),
            image: document.getElementById('imageUrl').value || null,
            active: activeBox ? activeBox.checked : true,
            sources: []
        };

        document.querySelectorAll('.source-item').forEach(item => {
            const url = item.querySelector('.source-url-input')?.value?.trim();
            const cssSelector = item.querySelector('.source-selector-input')?.value?.trim();
            const siteName = item.querySelector('.source-name-input')?.value?.trim();
            const usePuppeteer = item.querySelector('.source-puppeteer-input')?.checked || false;
            
            if (url && cssSelector && siteName) {
                data.sources.push({ url, cssSelector, siteName, usePuppeteer });
            }
        });

        try {
            if (id) {
                await API.products.update(id, data);
            } else {
                await API.products.create(data);
            }
            
            this.closeModal();
            await this.loadProducts();
        } catch (error) {
            alert('Error saving product: ' + error.message);
        }
    },

    async showProductDetail(id) {
        const product = await API.products.getById(id);
        
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        
        const detailSection = document.getElementById('product-detail');
        detailSection.classList.add('active');
        document.getElementById('productDetailContent').innerHTML = ProductDetail.render(product);
        
        setTimeout(() => ProductDetail.initChart(product, 30), 100);
    },

    showAddSourceForm(productId) {
        const form = document.getElementById('addSourceForm');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    },

    async addSource(productId) {
        const urlInput = document.getElementById('newSourceUrl');
        const selectorInput = document.getElementById('newSourceSelector');
        const nameInput = document.getElementById('newSourceName');

        const url = urlInput?.value?.trim();
        const cssSelector = selectorInput?.value?.trim();
        const siteName = nameInput?.value?.trim();

        if (!url || !cssSelector || !siteName) {
            alert('Please fill in URL, CSS Selector, and Store Name');
            return;
        }

        try {
            const product = await API.products.getById(productId);
            product.sources = product.sources || [];
            product.sources.push({ url, cssSelector, siteName });
            await API.products.update(productId, product);
            
            if (urlInput) urlInput.value = '';
            if (selectorInput) selectorInput.value = '';
            if (nameInput) nameInput.value = '';

            await this.showProductDetail(productId);
        } catch (error) {
            alert('Error adding source: ' + error.message);
        }
    },

    async testSourceSelector(btn) {
        const itemRow = btn.closest('.source-item') || btn.closest('.modal-source-item');
        if (!itemRow) return;

        const urlInput = itemRow.querySelector('.source-url-input');
        const selectorInput = itemRow.querySelector('.source-selector-input');
        const puppeteerInput = itemRow.querySelector('.source-puppeteer-input');
        const resultDiv = itemRow.querySelector('.test-selector-result');

        const url = urlInput?.value?.trim();
        const cssSelector = selectorInput?.value?.trim();
        const usePuppeteer = puppeteerInput?.checked || false;

        if (!url || !cssSelector) {
            alert('Please enter both a Product Page URL and a CSS Selector first.');
            return;
        }

        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Testing...';

        if (resultDiv) {
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '<span style="color: var(--text-secondary);">Connecting and extracting price...</span>';
        }

        try {
            const res = await API.scraper.testSelector(url, cssSelector, usePuppeteer);
            if (res.success && res.price !== null) {
                if (resultDiv) {
                    resultDiv.innerHTML = `<span style="color: #34c759; font-weight: 600;">✓ Price parsed successfully: €${Number(res.price).toFixed(2)}</span>`;
                }
            } else {
                if (resultDiv) {
                    resultDiv.innerHTML = `<span style="color: #ff3b30;">✗ Could not parse price: ${escapeHtml(res.error || 'Empty element')}</span>`;
                }
            }
        } catch (error) {
            if (resultDiv) {
                resultDiv.innerHTML = `<span style="color: #ff3b30;">✗ Test failed: ${escapeHtml(error.message)}</span>`;
            }
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    },

    async testNewSourceSelector() {
        const url = document.getElementById('newSourceUrl')?.value?.trim();
        const cssSelector = document.getElementById('newSourceSelector')?.value?.trim();
        const resultDiv = document.getElementById('newSourceTestResult');

        if (!url || !cssSelector) {
            alert('Please enter both a Product Page URL and a CSS Selector first.');
            return;
        }

        if (resultDiv) {
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '<span style="color: var(--text-secondary);">Connecting and extracting price...</span>';
        }

        try {
            const res = await API.scraper.testSelector(url, cssSelector, false);
            if (res.success && res.price !== null) {
                if (resultDiv) {
                    resultDiv.innerHTML = `<span style="color: #34c759; font-weight: 600;">✓ Price parsed successfully: €${Number(res.price).toFixed(2)}</span>`;
                }
            } else {
                if (resultDiv) {
                    resultDiv.innerHTML = `<span style="color: #ff3b30;">✗ Could not parse price: ${escapeHtml(res.error || 'Empty element')}</span>`;
                }
            }
        } catch (error) {
            if (resultDiv) {
                resultDiv.innerHTML = `<span style="color: #ff3b30;">✗ Test failed: ${escapeHtml(error.message)}</span>`;
            }
        }
    },

    async removeSource(productId, sourceIndex) {
        if (!confirm('Remove this source?')) return;

        try {
            const product = await API.products.getById(productId);
            product.sources.splice(sourceIndex, 1);
            await API.products.update(productId, product);
            await this.showProductDetail(productId);
        } catch (error) {
            alert('Error removing source: ' + error.message);
        }
    },

    async scrapeSource(productId, sourceIndex, btn) {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Scraping...';
        }

        try {
            await API.scraper.scrapeSource(productId, sourceIndex);
            await this.showProductDetail(productId);
        } catch (error) {
            alert('Scrape failed: ' + error.message);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Scrape';
            }
        }
    },

    async scrapeProductAll(productId, btn) {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Scraping All...';
        }

        try {
            const res = await API.scraper.scrapeProduct(productId);
            await this.showProductDetail(productId);
        } catch (error) {
            alert('Scrape all failed: ' + error.message);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Scrape All Stores';
            }
        }
    },

    async editProduct(id) {
        const product = await API.products.getById(id);
        this.openModal(product);
    },

    async deleteProduct(id) {
        if (!confirm('Delete this product? This cannot be undone.')) return;

        try {
            await API.products.delete(id);
            this.navigateToTab('products');
            await this.loadProducts();
        } catch (error) {
            alert('Error deleting product: ' + error.message);
        }
    },

    async toggleProductActive(id, currentActive) {
        try {
            await API.products.toggleActive(id, !currentActive);
            await this.loadProducts();

            const detailSection = document.getElementById('product-detail');
            if (detailSection && detailSection.classList.contains('active')) {
                await this.showProductDetail(id);
            }
        } catch (error) {
            alert('Error updating tracking status: ' + error.message);
        }
    },

    async scrapeAll() {
        const btn = document.getElementById('scrapeAllBtn');
        btn.disabled = true;
        btn.textContent = 'Scraping...';

        try {
            const result = await API.scraper.scrapeAll();
            alert(`Scraping complete! Processed ${result.results.length} products.`);
            await this.loadProducts();
        } catch (error) {
            alert('Scrape failed: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Scrape All Now';
        }
    },

    // Stores Management
    async loadStores() {
        try {
            this.stores = await API.stores.getAll();
            this.renderStores();
        } catch (error) {
            console.error('Error loading stores:', error);
        }
    },

    renderStores() {
        const grid = document.getElementById('storesGrid');
        if (!grid) return;

        if (!this.stores || this.stores.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon"></div>
                    <h3>No preset stores saved</h3>
                    <p>Add a preset store to easily reuse boutique names and CSS selectors across products.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.stores.map(store => `
            <div class="store-card">
                <div class="store-card-header">
                    <h3>${escapeHtml(store.name)}</h3>
                    <div class="store-card-actions">
                        <button class="btn btn-ghost" onclick="App.openStoreModal('${escapeHtml(store._id)}')" title="Edit Store">Edit</button>
                        <button class="btn btn-ghost" onclick="App.deleteStore('${escapeHtml(store._id)}')" title="Delete Store" style="color: var(--danger);">Delete</button>
                    </div>
                </div>
                <div class="store-card-body">
                    <div class="store-field">
                        <span class="store-field-label">CSS Selector:</span>
                        <code class="source-selector">${escapeHtml(store.cssSelector)}</code>
                    </div>
                    ${store.defaultUrl ? `
                        <div class="store-field">
                            <span class="store-field-label">Base URL:</span>
                            <a href="${escapeHtml(store.defaultUrl)}" target="_blank" class="store-url">${escapeHtml(store.defaultUrl)}</a>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    },

    openStoreModal(storeId = null) {
        const modal = document.getElementById('storeModal');
        const title = document.getElementById('storeModalTitle');
        const form = document.getElementById('storeForm');
        form.reset();

        if (storeId) {
            const store = this.stores.find(s => s._id === storeId);
            if (store) {
                title.textContent = 'Edit Store';
                document.getElementById('storeId').value = store._id;
                document.getElementById('storeName').value = store.name;
                document.getElementById('storeCssSelector').value = store.cssSelector;
                document.getElementById('storeDefaultUrl').value = store.defaultUrl || '';
            }
        } else {
            title.textContent = 'Add Preset Store';
            document.getElementById('storeId').value = '';
        }

        modal.classList.add('active');
    },

    closeStoreModal() {
        document.getElementById('storeModal')?.classList.remove('active');
        document.getElementById('storeForm')?.reset();
    },

    async handleStoreFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('storeId').value;
        const name = document.getElementById('storeName').value;
        const cssSelector = document.getElementById('storeCssSelector').value;
        const defaultUrl = document.getElementById('storeDefaultUrl').value;
        const syncProducts = document.getElementById('storeSyncProducts').checked;

        try {
            if (id) {
                await API.stores.update(id, { name, cssSelector, defaultUrl, syncProducts });
            } else {
                await API.stores.create({ name, cssSelector, defaultUrl });
            }
            this.closeStoreModal();
            await this.loadStores();
            await this.loadProducts();
        } catch (error) {
            alert('Error saving store: ' + error.message);
        }
    },

    async deleteStore(id) {
        if (!confirm('Are you sure you want to delete this store preset?')) return;
        try {
            await API.stores.delete(id);
            await this.loadStores();
        } catch (error) {
            alert('Error deleting store: ' + error.message);
        }
    },

    async syncAllStores() {
        const btn = document.getElementById('syncAllStoresBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Syncing...';
        }

        try {
            const res = await API.stores.syncAll();
            alert(`Sync complete! Updated ${res.updatedSourcesCount} source(s) across ${res.updatedProductsCount} product(s).`);
            await this.loadProducts();
        } catch (error) {
            alert('Error syncing stores: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Sync All Products';
            }
        }
    },

    // ==========================================
    // Alerts Management
    // ==========================================
    async loadAlerts() {
        const container = document.getElementById('alertsContainer');
        if (!container) return;

        try {
            this.alerts = await API.alerts.getAll();
            this.renderAlerts();
        } catch (error) {
            container.innerHTML = `<div class="empty-state"><p>Error loading alerts: ${error.message}</p></div>`;
        }
    },

    renderAlerts() {
        const container = document.getElementById('alertsContainer');
        if (!container) return;

        if (!this.alerts || this.alerts.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; padding: 48px 20px; text-align: center;">
                    <h3>No price alerts configured</h3>
                    <p style="color: var(--text-secondary); max-width: 440px; margin: 8px auto 20px;">
                        Set a target price on any of your tracked products. You will receive an email as soon as the lowest price reaches or drops below your target.
                    </p>
                    <button class="btn btn-primary" onclick="App.openAlertModal()">+ Create Price Alert</button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.alerts.map(alert => {
            const product = alert.product;
            const currentPrice = product?.lowestPrice != null ? product.lowestPrice : null;
            const isRise = alert.alertType === 'rise';
            const isMet = currentPrice != null && (isRise ? currentPrice >= alert.targetPrice : currentPrice <= alert.targetPrice);
            
            let statusBadge = '';
            if (!alert.active) {
                statusBadge = '<span class="alert-status-badge disabled">Disabled</span>';
            } else if (isMet || alert.lastTriggeredAt) {
                statusBadge = '<span class="alert-status-badge triggered">Target Reached</span>';
            } else {
                statusBadge = '<span class="alert-status-badge active">● Monitoring</span>';
            }

            const typeBadge = isRise
                ? '<span style="font-size:0.75rem; background:rgba(239,68,68,0.12); color:#ef4444; padding:2px 6px; border-radius:4px; font-weight:600;">📈 Price Rise</span>'
                : '<span style="font-size:0.75rem; background:rgba(16,185,129,0.12); color:#10b981; padding:2px 6px; border-radius:4px; font-weight:600;">📉 Price Drop</span>';

            const formattedTarget = `€${Number(alert.targetPrice).toFixed(2)}`;
            const formattedCurrent = currentPrice != null ? `€${Number(currentPrice).toFixed(2)}` : 'Not scraped yet';
            const channelText = alert.webhookUrl ? 'Custom Webhook' : 'Default Discord Webhook';

            const lastTriggeredText = alert.lastTriggeredAt 
                ? `Last alerted: ${new Date(alert.lastTriggeredAt).toLocaleDateString()} ${new Date(alert.lastTriggeredAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
                : 'Not triggered yet';

            const title = product?.title || 'Unknown Product';
            const escapedTitle = escapeHtml(title);

            return `
                <div class="alert-card" data-id="${alert._id}">
                    <div class="alert-card-header">
                        ${product?.image 
                            ? `<img src="${product.image}" alt="${escapedTitle}" class="alert-card-img" />`
                            : `<div class="alert-card-img-placeholder"></div>`
                        }
                        <div class="alert-card-title-wrap">
                            <h3 class="alert-card-title" title="${escapedTitle}">${escapedTitle}</h3>
                            <div style="display: flex; gap: 6px; align-items: center; margin-top: 4px;">
                                ${typeBadge}
                                ${statusBadge}
                            </div>
                        </div>
                    </div>

                    <div class="alert-card-body">
                        <div class="alert-stat">
                            <span class="alert-stat-label">${isRise ? 'Threshold Price' : 'Target Price'}</span>
                            <span class="alert-stat-value target">${formattedTarget}</span>
                        </div>
                        <div class="alert-stat">
                            <span class="alert-stat-label">Current Lowest</span>
                            <span class="alert-stat-value current">${formattedCurrent}</span>
                        </div>
                    </div>

                    <div class="alert-meta">
                        <div><strong>Trigger:</strong> ${isRise ? `Price ≥ €${Number(alert.targetPrice).toFixed(2)}` : `Price ≤ €${Number(alert.targetPrice).toFixed(2)}${alert.notifyOnRise ? ' (+ notify on deal end)' : ''}`}</div>
                        <div><strong>Notification:</strong> ${channelText} + Web Push</div>
                        <div style="font-size: 0.75rem; color: var(--text-tertiary);">${lastTriggeredText}</div>
                    </div>

                    <div class="alert-card-footer">
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary btn-sm" onclick="App.toggleAlert('${alert._id}', ${alert.active})" title="${alert.active ? 'Pause' : 'Resume'} alert">
                                ${alert.active ? 'Pause' : 'Resume'}
                            </button>
                            <button class="btn btn-ghost btn-sm" onclick="App.triggerTestAlert('${alert._id}')" title="Send a test notification">
                                Test
                            </button>
                        </div>
                        <button class="btn btn-ghost btn-sm" style="color: #ef4444;" onclick="App.deleteAlert('${alert._id}')" title="Delete alert">
                            Delete
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    openAlertModal(alert = null) {
        const modal = document.getElementById('alertModal');
        const title = document.getElementById('alertModalTitle');
        const select = document.getElementById('alertProductSelect');
        const hint = document.getElementById('alertProductCurrentPriceHint');
        const typeSelect = document.getElementById('alertTypeSelect');
        const notifyGroup = document.getElementById('notifyOnRiseGroup');
        const notifyCheckbox = document.getElementById('alertNotifyOnRise');

        if (!modal || !select) return;

        // Populate products dropdown
        select.innerHTML = '<option value="">Select a tracked product...</option>' + 
            this.products.map(p => {
                const priceInfo = p.lowestPrice != null ? ` (Current lowest: €${p.lowestPrice})` : '';
                const pTitle = escapeHtml(p.title);
                return `<option value="${p._id}" data-lowest="${p.lowestPrice != null ? p.lowestPrice : ''}" data-ref="${p.referencePrice || ''}">${pTitle}${priceInfo}</option>`;
            }).join('');

        if (alert) {
            title.textContent = 'Edit Price Alert';
            document.getElementById('alertId').value = alert._id;
            select.value = alert.productId;
            document.getElementById('alertTargetPrice').value = alert.targetPrice;
            document.getElementById('alertWebhookUrl').value = alert.webhookUrl || '';
            if (typeSelect) typeSelect.value = alert.alertType || 'drop';
            if (notifyCheckbox) notifyCheckbox.checked = Boolean(alert.notifyOnRise);
            if (notifyGroup) notifyGroup.style.display = (alert.alertType === 'rise') ? 'none' : 'block';
        } else {
            title.textContent = 'Create Price Alert';
            document.getElementById('alertId').value = '';
            document.getElementById('alertForm')?.reset();
            if (typeSelect) typeSelect.value = 'drop';
            if (notifyCheckbox) notifyCheckbox.checked = false;
            if (notifyGroup) notifyGroup.style.display = 'block';
            if (hint) hint.textContent = '';
        }

        modal.classList.add('active');
    },

    closeAlertModal() {
        document.getElementById('alertModal')?.classList.remove('active');
        document.getElementById('alertForm')?.reset();
        const hint = document.getElementById('alertProductCurrentPriceHint');
        if (hint) hint.textContent = '';
        const notifyGroup = document.getElementById('notifyOnRiseGroup');
        if (notifyGroup) notifyGroup.style.display = 'block';
    },

    onAlertProductSelectChange(e) {
        const select = e.target;
        const selectedOpt = select.selectedOptions[0];
        const hint = document.getElementById('alertProductCurrentPriceHint');
        const targetInput = document.getElementById('alertTargetPrice');

        if (!selectedOpt || !selectedOpt.value) {
            if (hint) hint.textContent = '';
            return;
        }

        const lowest = selectedOpt.dataset.lowest;
        const ref = selectedOpt.dataset.ref;

        if (lowest) {
            if (hint) hint.textContent = `Current lowest: €${lowest} | Reference price: €${ref}`;
            if (!targetInput.value) {
                const suggested = Math.floor(parseFloat(lowest) * 0.95);
                targetInput.value = suggested > 0 ? suggested : lowest;
            }
        } else if (ref) {
            if (hint) hint.textContent = `Reference price: €${ref}`;
            if (!targetInput.value) {
                targetInput.value = ref;
            }
        }
    },

    async handleAlertFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('alertId').value;
        const productId = document.getElementById('alertProductSelect').value;
        const targetPrice = parseFloat(document.getElementById('alertTargetPrice').value);
        const webhookUrl = document.getElementById('alertWebhookUrl').value.trim();
        const alertType = document.getElementById('alertTypeSelect')?.value || 'drop';
        const notifyOnRise = document.getElementById('alertNotifyOnRise')?.checked || false;

        if (!productId) {
            alert('Please select a product');
            return;
        }
        if (isNaN(targetPrice) || targetPrice <= 0) {
            alert('Please enter a valid target price');
            return;
        }

        try {
            const payload = { productId, targetPrice, webhookUrl, alertType, notifyOnRise };
            if (id) {
                await API.alerts.update(id, payload);
            } else {
                await API.alerts.create(payload);
            }
            this.closeAlertModal();
            await this.loadAlerts();
        } catch (error) {
            alert('Error saving alert: ' + error.message);
        }
    },

    async toggleAlert(id, currentActive) {
        try {
            await API.alerts.update(id, { active: !currentActive });
            await this.loadAlerts();
        } catch (error) {
            alert('Error updating alert: ' + error.message);
        }
    },

    async deleteAlert(id) {
        if (!confirm('Are you sure you want to delete this alert?')) return;
        try {
            await API.alerts.delete(id);
            await this.loadAlerts();
        } catch (error) {
            alert('Error deleting alert: ' + error.message);
        }
    },

    async triggerTestAlert(id) {
        try {
            const res = await API.alerts.triggerTest(id);
            alert(res.message || 'Test Discord notification sent successfully!');
        } catch (error) {
            alert('Failed to send test Discord notification: ' + error.message);
        }
    },

    // ==========================================
    // Settings & Discord Webhook Management
    // ==========================================
    async loadSettings() {
        try {
            const settings = await API.settings.get();
            if (!settings) return;

            const freqSelect = document.getElementById('scrapeFrequency');
            if (freqSelect && settings.scrapeFrequency !== undefined) {
                freqSelect.value = settings.scrapeFrequency;
            }

            const webhookEl = document.getElementById('discordWebhookUrl');
            if (webhookEl) {
                webhookEl.value = settings.discordWebhookUrl || '';
            }
        } catch (error) {
            console.error('Error loading settings:', error.message);
        }
    },

    async saveDiscordSettings() {
        const btn = document.getElementById('saveDiscordBtn');
        const status = document.getElementById('discordStatusMsg');
        const webhookUrl = document.getElementById('discordWebhookUrl')?.value.trim() || '';

        if (btn) btn.disabled = true;
        if (status) {
            status.style.display = 'block';
            status.style.color = 'var(--text-secondary)';
            status.textContent = 'Saving Discord settings...';
        }

        try {
            await API.settings.update({
                discordWebhookUrl: webhookUrl
            });

            if (status) {
                status.style.color = '#10b981';
                status.textContent = 'Discord webhook saved successfully!';
                setTimeout(() => { status.style.display = 'none'; }, 4000);
            }
        } catch (error) {
            if (status) {
                status.style.color = '#ef4444';
                status.textContent = 'Error saving Discord settings: ' + error.message;
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    async testDiscordWebhook() {
        const btn = document.getElementById('testDiscordBtn');
        const status = document.getElementById('discordStatusMsg');
        const webhookUrl = document.getElementById('discordWebhookUrl')?.value.trim() || '';

        if (!webhookUrl) {
            if (status) {
                status.style.display = 'block';
                status.style.color = '#ef4444';
                status.textContent = 'Please enter a Discord Webhook URL before testing.';
            }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Sending...';
        }
        if (status) {
            status.style.display = 'block';
            status.style.color = 'var(--text-secondary)';
            status.textContent = 'Sending test notification to Discord...';
        }

        try {
            const res = await API.alerts.testWebhook(webhookUrl);
            if (status) {
                status.style.color = '#10b981';
                status.textContent = res.message || 'Discord notification sent successfully!';
            }
        } catch (error) {
            if (status) {
                status.style.color = '#ef4444';
                status.textContent = 'Discord test failed: ' + error.message;
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Send Test Notification';
            }
        }
    },

    // ==========================================
    // Web Push & PWA Management
    // ==========================================
    async initServiceWorkerAndPush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            this.updatePushUI('unsupported');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                this.updatePushUI('subscribed');
            } else {
                this.updatePushUI('unsubscribed');
            }
        } catch (err) {
            console.warn('[PWA] Service Worker registration failed:', err);
            this.updatePushUI('unsupported');
        }
    },

    updatePushUI(state) {
        const badge = document.getElementById('pushStatusBadge');
        const enableBtn = document.getElementById('enablePushBtn');
        const testBtn = document.getElementById('testPushBtn');

        if (state === 'subscribed') {
            if (badge) {
                badge.textContent = 'Subscribed';
                badge.style.background = '#dcfce7';
                badge.style.color = '#15803d';
            }
            if (enableBtn) {
                enableBtn.textContent = 'Web Push Active';
                enableBtn.disabled = true;
                enableBtn.classList.remove('btn-primary');
                enableBtn.classList.add('btn-secondary');
            }
            if (testBtn) testBtn.style.display = 'inline-block';
        } else if (state === 'unsubscribed') {
            if (badge) {
                badge.textContent = 'Not Subscribed';
                badge.style.background = 'var(--bg-tertiary)';
                badge.style.color = 'var(--text-secondary)';
            }
            if (enableBtn) {
                enableBtn.textContent = 'Enable Web Push Notifications';
                enableBtn.disabled = false;
                enableBtn.classList.add('btn-primary');
                enableBtn.classList.remove('btn-secondary');
            }
            if (testBtn) testBtn.style.display = 'none';
        } else {
            if (badge) {
                badge.textContent = 'Not Supported';
                badge.style.background = '#fee2e2';
                badge.style.color = '#b91c1c';
            }
            if (enableBtn) {
                enableBtn.textContent = 'Web Push Unsupported';
                enableBtn.disabled = true;
            }
            if (testBtn) testBtn.style.display = 'none';
        }
    },

    async subscribeToPush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            alert('Web Push is not supported in this browser.');
            return;
        }

        const enableBtn = document.getElementById('enablePushBtn');
        const msg = document.getElementById('pushStatusMsg');
        if (enableBtn) enableBtn.disabled = true;

        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                if (msg) {
                    msg.style.display = 'block';
                    msg.style.color = '#ef4444';
                    msg.textContent = 'Notification permission was denied. Please allow notifications in site settings.';
                }
                this.updatePushUI('unsubscribed');
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            const { publicKey } = await API.push.getVapidKey();
            if (!publicKey) throw new Error('Could not retrieve VAPID public key from server');

            const applicationServerKey = window.Utils.urlBase64ToUint8Array(publicKey);
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            });

            await API.push.subscribe(subscription);
            this.updatePushUI('subscribed');

            if (msg) {
                msg.style.display = 'block';
                msg.style.color = '#10b981';
                msg.textContent = '✓ Successfully subscribed to Web Push! Alerts will appear on your device.';
            }
        } catch (err) {
            console.error('[WebPush] Subscription error:', err);
            if (msg) {
                msg.style.display = 'block';
                msg.style.color = '#ef4444';
                msg.textContent = `Subscription error: ${err.message}`;
            }
            this.updatePushUI('unsubscribed');
        }
    },

    async sendTestPush() {
        const testBtn = document.getElementById('testPushBtn');
        const msg = document.getElementById('pushStatusMsg');
        if (testBtn) {
            testBtn.disabled = true;
            testBtn.textContent = 'Sending...';
        }

        try {
            const res = await API.push.sendTestNotification();
            if (msg) {
                msg.style.display = 'block';
                msg.style.color = '#10b981';
                msg.textContent = `✓ Push notification sent to ${res.delivered || 1} device(s)!`;
            }
        } catch (err) {
            if (msg) {
                msg.style.display = 'block';
                msg.style.color = '#ef4444';
                msg.textContent = `Failed to send test push: ${err.message}`;
            }
        } finally {
            if (testBtn) {
                testBtn.disabled = false;
                testBtn.textContent = 'Send Test Push';
            }
        }
    },

    setupChartTimeframes() {
        document.querySelectorAll('#charts-tab .tf-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                Charts.updateTimeframe(parseInt(btn.dataset.range));
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
