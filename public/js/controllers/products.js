/**
 * OmniPrice - Products Controller
 * Manages product catalog, KPIs, filtering, CRUD modals, source feeds, and scraping operations.
 */
const ProductsController = {
    products: [],
    currentView: 'grid',
    currentSort: 'recent',
    filters: {
        search: '',
        tag: null,
        onlyATL: false,
        onlyDeals: false,
        status: 'all'
    },
    allTags: [],

    async loadProducts() {
        try {
            const container = document.getElementById('productsContainer');
            if (container && this.products.length === 0) {
                container.innerHTML = ProductCard.renderLoading();
            }

            this.products = await API.getProducts({ includeHistory: true });
            if (window.App) window.App.products = this.products;

            this.updateTags();
            this.renderProductsKpis();
            this.renderProducts();

            // Refresh open detail view if active
            const detailView = document.getElementById('productDetail');
            if (detailView && detailView.style.display !== 'none' && ProductDetail.currentProduct) {
                const refreshed = this.products.find(p => p._id === ProductDetail.currentProduct._id);
                if (refreshed) {
                    ProductDetail.render(refreshed);
                }
            }
        } catch (error) {
            console.error('Failed to load products:', error);
            Toast.error('Failed to load products');
        }
    },

    renderProductsKpis() {
        const container = document.getElementById('productsKpiContainer');
        if (!container) return;

        const total = this.products.length;
        if (total === 0) {
            container.innerHTML = '';
            return;
        }

        const activeCount = this.products.filter(p => p.active !== false).length;
        const atlCount = this.products.filter(p => ProductCard.isAtAllTimeLow(p)).length;

        let totalSavings = 0;
        let dealsCount = 0;

        this.products.forEach(p => {
            const cleanLowest = ProductCard.sanitizePrice(p.lowestPrice, p.referencePrice);
            if (p.referencePrice && cleanLowest != null && cleanLowest < p.referencePrice) {
                totalSavings += (p.referencePrice - cleanLowest);
                dealsCount++;
            }
        });

        // Feed health breakdown
        const healthyFeeds = this.products.filter(p => p.healthStatus === 'ok').length;
        const issueFeeds = this.products.filter(p => p.healthStatus === 'warning' || p.healthStatus === 'error').length;

        container.innerHTML = `
            <div class="kpi-card">
                <span class="kpi-label">Tracked Items</span>
                <span class="kpi-value">${total}</span>
                <span class="kpi-sub">${activeCount} actively monitored</span>
            </div>
            <div class="kpi-card highlight-atl">
                <span class="kpi-label">All-Time Lows</span>
                <span class="kpi-value">${atlCount}</span>
                <span class="kpi-sub">Record best prices</span>
            </div>
            <div class="kpi-card highlight-savings">
                <span class="kpi-label">Total Savings</span>
                <span class="kpi-value">${Utils.formatCurrency(totalSavings)}</span>
                <span class="kpi-sub">Across ${dealsCount} discounted deals</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Scraper Feeds</span>
                <span class="kpi-value">${healthyFeeds}/${total}</span>
                <span class="kpi-sub">${issueFeeds > 0 ? `<strong style="color:var(--danger);">${issueFeeds} issue(s)</strong>` : 'All feeds operational'}</span>
            </div>
        `;
    },

    renderProducts() {
        const container = document.getElementById('productsContainer');
        if (!container) return;

        let filtered = [...this.products];

        // Search Filter
        if (this.filters.search) {
            const q = this.filters.search.toLowerCase();
            filtered = filtered.filter(p => {
                const titleMatch = (p.title || '').toLowerCase().includes(q);
                const descMatch = (p.description || '').toLowerCase().includes(q);
                const tagMatch = (p.tags || []).some(t => t.toLowerCase().includes(q));
                const storeMatch = (p.sources || []).some(s => (s.siteName || '').toLowerCase().includes(q));
                return titleMatch || descMatch || tagMatch || storeMatch;
            });
        }

        // Tag Filter
        if (this.filters.tag) {
            filtered = filtered.filter(p => (p.tags || []).includes(this.filters.tag));
        }

        // Only ATL Filter
        if (this.filters.onlyATL) {
            filtered = filtered.filter(p => ProductCard.isAtAllTimeLow(p));
        }

        // Only Deals Filter
        if (this.filters.onlyDeals) {
            filtered = filtered.filter(p => {
                const cleanLowest = ProductCard.sanitizePrice(p.lowestPrice, p.referencePrice);
                return p.referencePrice && cleanLowest != null && cleanLowest < p.referencePrice;
            });
        }

        // Status Filter
        if (this.filters.status === 'active') {
            filtered = filtered.filter(p => p.active !== false);
        } else if (this.filters.status === 'paused') {
            filtered = filtered.filter(p => p.active === false);
        }

        // Sorting
        filtered.sort((a, b) => {
            if (this.currentSort === 'alpha') {
                return (a.title || '').localeCompare(b.title || '');
            } else if (this.currentSort === 'price_asc') {
                return (a.lowestPrice || Infinity) - (b.lowestPrice || Infinity);
            } else if (this.currentSort === 'price_desc') {
                return (b.lowestPrice || -Infinity) - (a.lowestPrice || -Infinity);
            } else if (this.currentSort === 'delta_asc') {
                return (a.priceDelta || 0) - (b.priceDelta || 0);
            } else {
                // 'recent'
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            }
        });

        if (filtered.length === 0) {
            container.innerHTML = ProductCard.renderEmpty();
            return;
        }

        container.className = this.currentView === 'list' ? 'products-list-view' : 'products-grid';
        container.innerHTML = filtered.map(p => ProductCard.render(p, this.currentView)).join('');
    },

    filterByTag(tag) {
        if (this.filters.tag === tag) {
            this.filters.tag = null;
        } else {
            this.filters.tag = tag;
        }
        this.updateTags();
        this.renderProducts();
    },

    updateTags() {
        const tagMap = new Map();
        this.products.forEach(p => {
            (p.tags || []).forEach(t => {
                tagMap.set(t, (tagMap.get(t) || 0) + 1);
            });
        });

        this.allTags = Array.from(tagMap.entries())
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0]);

        const tagContainer = document.getElementById('tagsFilterContainer');
        if (!tagContainer) return;

        if (this.allTags.length === 0) {
            tagContainer.innerHTML = '';
            tagContainer.style.display = 'none';
            return;
        }

        tagContainer.style.display = 'flex';
        tagContainer.innerHTML = `
            <span class="tag-filter-pill ${!this.filters.tag ? 'active' : ''}" onclick="App.filterByTag(null)">
                All Tags (${this.products.length})
            </span>
            ${this.allTags.map(tag => `
                <span class="tag-filter-pill ${this.filters.tag === tag ? 'active' : ''}" onclick="App.filterByTag('${Utils.escapeHtml(tag)}')">
                    #${Utils.escapeHtml(tag)} (${tagMap.get(tag)})
                </span>
            `).join('')}
        `;
    },

    setView(view) {
        this.currentView = view;
        const gridBtn = document.getElementById('viewGridBtn');
        const listBtn = document.getElementById('viewListBtn');
        if (gridBtn) gridBtn.classList.toggle('active', view === 'grid');
        if (listBtn) listBtn.classList.toggle('active', view === 'list');
        this.renderProducts();
    },

    // ─── Add / Edit Product Modal ──────────────────────────────────────────

    openModal(product = null) {
        const modal = document.getElementById('productModal');
        const title = document.getElementById('modalTitle');
        if (!modal) return;

        this.resetForm();

        // Update currency symbol hint in modal
        const sym = Utils.getCurrencySymbol();
        const refSym = document.querySelector('.input-with-symbol .input-sym');
        if (refSym) refSym.textContent = sym;

        if (product) {
            title.textContent = 'Edit Tracked Product';
            this.populateForm(product);
        } else {
            title.textContent = 'Add Tracked Product';
            this.addSourceRow(); // At least 1 empty source row
        }

        this.renderModalTagSuggestions();
        modal.classList.add('active');
        document.getElementById('productTitle').focus();
    },

    closeModal() {
        const modal = document.getElementById('productModal');
        if (modal) modal.classList.remove('active');
        this.resetForm();
    },

    resetForm() {
        const form = document.getElementById('productForm');
        if (form) form.reset();
        document.getElementById('productId').value = '';
        document.getElementById('imagePreview').innerHTML = '<span class="placeholder">No image</span>';
        document.getElementById('sourcesContainer').innerHTML = '';
        const autodiscoverStatus = document.getElementById('autodiscoverStatus');
        if (autodiscoverStatus) {
            autodiscoverStatus.style.display = 'none';
            autodiscoverStatus.innerHTML = '';
        }
        const autoInput = document.getElementById('autodiscoverUrlInput');
        if (autoInput) autoInput.value = '';
    },

    populateForm(product) {
        document.getElementById('productId').value = product._id;
        document.getElementById('productTitle').value = product.title || '';
        document.getElementById('productRefPrice').value = product.referencePrice != null ? product.referencePrice : '';
        document.getElementById('productTags').value = (product.tags || []).join(', ');
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productActive').checked = product.active !== false;

        if (product.image) {
            document.getElementById('imageUrl').value = product.image.startsWith('data:') ? '' : product.image;
            this.previewImageUrl(product.image);
        }

        const sourcesContainer = document.getElementById('sourcesContainer');
        sourcesContainer.innerHTML = '';

        if (product.sources && product.sources.length > 0) {
            product.sources.forEach((source, index) => {
                this.addSourceRow(source, index);
            });
        } else {
            this.addSourceRow();
        }
        this.updateSourcesCount();
    },

    renderModalTagSuggestions() {
        const container = document.getElementById('modalTagSuggestions');
        if (!container) return;

        if (this.allTags.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <span class="modal-tag-hint">Suggestions:</span>
            ${this.allTags.slice(0, 10).map(tag => `
                <span class="tag-chip" onclick="App.toggleModalTag('${Utils.escapeHtml(tag)}')">
                    +${Utils.escapeHtml(tag)}
                </span>
            `).join('')}
        `;
    },

    toggleModalTag(tag) {
        const input = document.getElementById('productTags');
        if (!input) return;

        const currentTags = input.value.split(',').map(t => t.trim()).filter(Boolean);
        if (!currentTags.includes(tag)) {
            currentTags.push(tag);
            input.value = currentTags.join(', ');
        }
        this.updateModalTagSuggestions();
    },

    updateModalTagSuggestions() {
        const input = document.getElementById('productTags');
        if (!input) return;

        const currentTags = input.value.split(',').map(t => t.trim()).filter(Boolean);
        const chips = document.querySelectorAll('#modalTagSuggestions .tag-chip');
        chips.forEach(chip => {
            const tag = chip.textContent.replace(/^\+/, '').trim();
            if (currentTags.includes(tag)) {
                chip.classList.add('selected');
            } else {
                chip.classList.remove('selected');
            }
        });
    },

    extractDomainFromUrl(url) {
        if (!url) return '';
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch (_) {
            return '';
        }
    },

    matchStoreFromUrl(url) {
        if (!url) return null;
        const stores = (window.App && window.App.stores) || [];
        try {
            const hostname = new URL(url).hostname.toLowerCase();
            for (const store of stores) {
                if (store.defaultUrl) {
                    try {
                        const storeHost = new URL(store.defaultUrl).hostname.toLowerCase();
                        if (hostname === storeHost || hostname.endsWith('.' + storeHost)) {
                            return store;
                        }
                    } catch (_) {}
                }
                const cleanName = store.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (cleanName && hostname.includes(cleanName)) {
                    return store;
                }
            }
        } catch (_) {}
        return null;
    },

    sourceRowHTML(source = {}, index = 0) {
        const stores = (window.App && window.App.stores) || [];
        const storeOptions = stores.map(store => {
            const selected = source.siteName === store.name ? 'selected' : '';
            return `<option value="${Utils.escapeHtml(store._id)}" 
                            data-name="${Utils.escapeHtml(store.name)}" 
                            data-selector="${Utils.escapeHtml(store.cssSelector)}" 
                            data-url="${Utils.escapeHtml(store.defaultUrl || '')}" 
                            ${selected}>${Utils.escapeHtml(store.name)}</option>`;
        }).join('');

        const domain = source.url ? this.extractDomainFromUrl(source.url) : '';
        const hasSelector = Boolean(source.cssSelector);

        return `
            <div class="modal-source-item source-item expanded" data-source-index="${index}">
                <div class="modal-source-header" onclick="App.toggleSourceItem(this, event)">
                    <div class="modal-source-header-left">
                        <span class="source-index-badge">#${index + 1}</span>
                        <div class="source-header-info">
                            <span class="source-header-name">${Utils.escapeHtml(source.siteName || 'New Store')}</span>
                            <span class="source-header-domain" style="${domain ? '' : 'display:none;'}">${Utils.escapeHtml(domain)}</span>
                        </div>
                    </div>
                    <div class="modal-source-header-right">
                        <span class="source-status-badge ${hasSelector ? 'configured' : ''}">
                            ${hasSelector ? '✓ Ready' : 'Incomplete'}
                        </span>
                        <button type="button" class="source-collapse-btn" title="Expand / Collapse" aria-label="Expand / Collapse">
                            <svg class="chevron-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </button>
                        <button type="button" class="remove-source-btn" onclick="App.removeSourceItem(this, event)" title="Remove store feed">
                            <span>Remove</span> ×
                        </button>
                    </div>
                </div>

                <div class="modal-source-body">
                    <div class="modal-source-row">
                        <div class="source-field source-field-preset">
                            <label>
                                <span>Store Template</span>
                                <span class="source-label-hint">Saved presets</span>
                            </label>
                            <select class="source-preset-select" onchange="App.onSourcePresetSelectChange(this)">
                                <option value="">Custom Store</option>
                                ${storeOptions}
                            </select>
                        </div>
                        <div class="source-field source-field-name">
                            <label>
                                <span>Store Name <span class="required">*</span></span>
                            </label>
                            <input type="text" placeholder="e.g. Amazon, Fnac, Louis Moto" value="${Utils.escapeHtml(source.siteName || '')}" class="source-name-input" oninput="App.onSourceNameInput(this)" required />
                        </div>
                    </div>

                    <div class="modal-source-row full-width">
                        <div class="source-field source-field-url">
                            <label>
                                <span>Product Page URL <span class="required">*</span></span>
                                <span class="source-label-hint auto-detect-hint">Auto-matches saved store preset</span>
                            </label>
                            <input type="url" placeholder="https://www.example.com/product/12345" value="${Utils.escapeHtml(source.url || '')}" class="source-url-input" oninput="App.onSourceUrlInput(this)" onpaste="setTimeout(() => App.onSourceUrlInput(this), 20)" required />
                        </div>
                    </div>

                    <div class="modal-source-row full-width">
                        <div class="source-field source-field-selector">
                            <label>
                                <span>CSS Price Selector(s) <span class="required">*</span></span>
                                <span class="source-label-hint">Order of preference (one per line or pipe-separated)</span>
                            </label>
                            <textarea rows="2" placeholder="e.g. span.price&#10;div.offer-price" class="source-selector-input" oninput="App.onSourceSelectorInput(this)" required style="font-family: monospace; font-size: 0.85rem; width: 100%; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); padding: 8px 10px;">${Utils.escapeHtml(source.cssSelector || '')}</textarea>
                        </div>
                    </div>

                    <div class="modal-source-footer">
                        <label class="puppeteer-toggle-label">
                            <input type="checkbox" class="source-puppeteer-input" ${source.usePuppeteer ? 'checked' : ''} />
                            <span class="toggle-checkbox-custom"></span>
                            <span class="toggle-label-content">
                                <span class="toggle-title">Use Puppeteer</span>
                                <span class="toggle-sub">For JavaScript-rendered & dynamic sites</span>
                            </span>
                        </label>
                        <div class="modal-source-actions">
                            <button type="button" class="btn btn-secondary btn-sm test-selector-btn" onclick="App.testSourceSelector(this)">
                                ⚡ Test Selector
                            </button>
                        </div>
                    </div>
                    <div class="test-selector-result" style="display: none;"></div>
                </div>
            </div>
        `;
    },

    onSourceUrlInput(urlInput) {
        const item = urlInput.closest('.source-item');
        if (!item) return;

        const url = urlInput.value.trim();
        const domain = this.extractDomainFromUrl(url);
        const domainBadge = item.querySelector('.source-header-domain');
        if (domainBadge) {
            domainBadge.textContent = domain;
            domainBadge.style.display = domain ? 'inline' : 'none';
        }

        const nameInput = item.querySelector('.source-name-input');
        const selectorInput = item.querySelector('.source-selector-input');
        const presetSelect = item.querySelector('.source-preset-select');

        if (url && (!nameInput.value || !selectorInput.value)) {
            const matchedStore = this.matchStoreFromUrl(url);
            if (matchedStore) {
                if (!nameInput.value) nameInput.value = matchedStore.name;
                if (!selectorInput.value) selectorInput.value = matchedStore.cssSelector;
                if (presetSelect) presetSelect.value = matchedStore._id;
                this.onSourceNameInput(nameInput);
                this.onSourceSelectorInput(selectorInput);
                Toast.info(`Matched store preset: ${matchedStore.name}`);
            }
        }
    },

    onSourceNameInput(nameInput) {
        const item = nameInput.closest('.source-item');
        if (!item) return;
        const nameHeader = item.querySelector('.source-header-name');
        if (nameHeader) {
            nameHeader.textContent = nameInput.value.trim() || 'New Store';
        }
    },

    onSourceSelectorInput(selectorInput) {
        const item = selectorInput.closest('.source-item');
        if (!item) return;
        const badge = item.querySelector('.source-status-badge');
        if (badge) {
            const hasVal = Boolean(selectorInput.value.trim());
            badge.textContent = hasVal ? '✓ Ready' : 'Incomplete';
            badge.classList.toggle('configured', hasVal);
        }
    },

    onSourcePresetSelectChange(selectElem) {
        const opt = selectElem.options[selectElem.selectedIndex];
        const isDetailForm = selectElem.id === 'newSourceStoreSelect';

        if (isDetailForm) {
            if (opt && opt.value) {
                document.getElementById('newSourceName').value = opt.dataset.name || '';
                document.getElementById('newSourceSelector').value = opt.dataset.selector || '';
                if (opt.dataset.url && !document.getElementById('newSourceUrl').value) {
                    document.getElementById('newSourceUrl').value = opt.dataset.url;
                }
            }
            return;
        }

        const item = selectElem.closest('.source-item');
        if (!item) return;

        const nameInput = item.querySelector('.source-name-input');
        const selectorInput = item.querySelector('.source-selector-input');

        if (opt && opt.value) {
            if (nameInput) nameInput.value = opt.dataset.name || '';
            if (selectorInput) selectorInput.value = opt.dataset.selector || '';
            this.onSourceNameInput(nameInput);
            this.onSourceSelectorInput(selectorInput);
        }
    },

    toggleSourceItem(headerElem, event) {
        if (event && event.target.closest('.remove-source-btn')) return;
        const item = headerElem.closest('.source-item');
        if (item) {
            item.classList.toggle('expanded');
            this.syncToggleAllButton();
        }
    },

    toggleAllSources() {
        const items = document.querySelectorAll('#sourcesContainer .source-item');
        const anyExpanded = Array.from(items).some(i => i.classList.contains('expanded'));
        items.forEach(item => {
            if (anyExpanded) {
                item.classList.remove('expanded');
            } else {
                item.classList.add('expanded');
            }
        });
        this.syncToggleAllButton();
    },

    syncToggleAllButton() {
        const btn = document.getElementById('toggleAllSourcesBtn');
        if (!btn) return;
        const items = document.querySelectorAll('#sourcesContainer .source-item');
        const allCollapsed = Array.from(items).every(i => !i.classList.contains('expanded'));
        btn.textContent = allCollapsed ? 'Expand All' : 'Collapse All';
    },

    removeSourceItem(btn, event) {
        if (event) event.stopPropagation();
        const item = btn.closest('.source-item');
        if (item) {
            item.remove();
            this.updateSourcesCount();
        }
    },

    updateSourcesCount() {
        const items = document.querySelectorAll('#sourcesContainer .source-item');
        items.forEach((item, index) => {
            const badge = item.querySelector('.source-index-badge');
            if (badge) badge.textContent = `#${index + 1}`;
            item.dataset.sourceIndex = index;
        });

        const countBadge = document.getElementById('modalSourcesCount');
        if (countBadge) {
            countBadge.textContent = `${items.length} store${items.length !== 1 ? 's' : ''}`;
        }
    },

    addSourceRow(source = {}, index = null) {
        const container = document.getElementById('sourcesContainer');
        if (!container) return;
        const count = container.querySelectorAll('.source-item').length;
        const targetIndex = index !== null ? index : count;
        container.insertAdjacentHTML('beforeend', this.sourceRowHTML(source, targetIndex));
        this.updateSourcesCount();
    },

    previewImageUrl(url) {
        const preview = document.getElementById('imagePreview');
        if (!preview) return;
        if (url) {
            preview.innerHTML = `<img src="${Utils.escapeHtml(url)}" alt="Preview" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'placeholder\\'>Invalid Image</span>';">`;
        } else {
            preview.innerHTML = '<span class="placeholder">No image</span>';
        }
    },

    handleImageFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 20 * 1024 * 1024) {
            Toast.warning('Image exceeds 20MB limit. Please choose a smaller file.');
            e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            document.getElementById('imageUrl').value = '';
            this.previewImageUrl(base64);
        };
        reader.readAsDataURL(file);
    },

    async handleAutoDiscover() {
        const input = document.getElementById('autodiscoverUrlInput');
        const btn = document.getElementById('autodiscoverBtn');
        const status = document.getElementById('autodiscoverStatus');
        if (!input || !btn) return;

        const url = input.value.trim();
        if (!url) {
            Toast.warning('Please enter a product page URL first.');
            return;
        }

        btn.disabled = true;
        const btnText = document.getElementById('autodiscoverBtnText');
        if (btnText) btnText.textContent = 'Extracting...';

        if (status) {
            status.style.display = 'block';
            status.style.color = 'var(--text-secondary)';
            status.textContent = 'Connecting to store and parsing product metadata...';
        }

        try {
            const res = await API.autodiscoverMetadata(url);
            if (!res.success || !res.data) throw new Error(res.error || 'No metadata discovered');

            const data = res.data;
            if (data.title && !document.getElementById('productTitle').value) {
                document.getElementById('productTitle').value = data.title;
            }
            if (data.price != null && !document.getElementById('productRefPrice').value) {
                document.getElementById('productRefPrice').value = data.price;
            }
            if (data.image && !document.getElementById('imageUrl').value) {
                document.getElementById('imageUrl').value = data.image;
                this.previewImageUrl(data.image);
            }
            if (data.description && !document.getElementById('productDescription').value) {
                document.getElementById('productDescription').value = data.description;
            }

            // Fill or append source row
            const firstRow = document.querySelector('#sourcesContainer .source-item');
            const targetRow = firstRow || null;

            if (targetRow) {
                const urlInput = targetRow.querySelector('.source-url-input');
                const nameInput = targetRow.querySelector('.source-name-input');
                if (urlInput && !urlInput.value) urlInput.value = url;
                if (nameInput && !nameInput.value && data.siteName) nameInput.value = data.siteName;
                this.onSourceUrlInput(urlInput);
                if (nameInput) this.onSourceNameInput(nameInput);
            } else {
                this.addSourceRow({ url, siteName: data.siteName || '' });
            }

            Toast.success('Auto-discovery successful! Product info populated.');
            if (status) {
                status.style.color = 'var(--success)';
                status.textContent = `Found: "${data.title || 'Product'}" (${Utils.formatCurrency(data.price)})`;
            }
        } catch (error) {
            Toast.error('Auto-discovery failed: ' + error.message);
            if (status) {
                status.style.color = 'var(--danger)';
                status.textContent = `Could not auto-fill: ${error.message}. Please enter details manually.`;
            }
        } finally {
            btn.disabled = false;
            if (btnText) btnText.textContent = '✨ Auto-Fill';
        }
    },

    async handleFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('productId').value;
        const title = document.getElementById('productTitle').value.trim();
        const refPrice = parseFloat(document.getElementById('productRefPrice').value);
        const tagsStr = document.getElementById('productTags').value;
        const description = document.getElementById('productDescription').value.trim();
        const active = document.getElementById('productActive').checked;
        const imageUrlInput = document.getElementById('imageUrl').value.trim();
        const previewImg = document.querySelector('#imagePreview img');
        const image = previewImg ? previewImg.src : (imageUrlInput || null);

        const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);

        const sourceItems = document.querySelectorAll('#sourcesContainer .source-item');
        const sources = [];

        for (const item of sourceItems) {
            const siteName = item.querySelector('.source-name-input').value.trim();
            const url = item.querySelector('.source-url-input').value.trim();
            const cssSelector = item.querySelector('.source-selector-input').value.trim();
            const usePuppeteer = item.querySelector('.source-puppeteer-input').checked;

            if (siteName || url || cssSelector) {
                if (!siteName || !url || !cssSelector) {
                    Toast.warning('Each store feed must have a Store Name, Product URL, and CSS Selector.');
                    item.classList.add('expanded');
                    return;
                }
                sources.push({ siteName, url, cssSelector, usePuppeteer });
            }
        }

        if (sources.length === 0) {
            Toast.warning('At least one store price feed is required.');
            return;
        }

        const data = {
            title,
            referencePrice: refPrice,
            tags,
            description,
            active,
            image,
            sources
        };

        const submitBtn = document.getElementById('saveProductBtn');
        const origText = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
        }

        try {
            if (id) {
                await API.updateProduct(id, data);
                Toast.success(`Product "${title}" updated!`);
            } else {
                await API.createProduct(data);
                Toast.success(`Product "${title}" added successfully!`);
            }

            this.closeModal();
            await this.loadProducts();
        } catch (error) {
            Toast.error('Error saving product: ' + error.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = origText;
            }
        }
    },

    // ─── Product Detail View ───────────────────────────────────────────────

    async showProductDetail(id, updateRoute = true) {
        try {
            const product = await API.getProduct(id);
            if (!product) {
                Toast.error('Product not found');
                return;
            }

            document.getElementById('products-tab').style.display = 'none';
            const detailView = document.getElementById('productDetail');
            detailView.style.display = 'block';

            ProductDetail.render(product);
            ProductDetail.initChart(product, 30);

            window.scrollTo({ top: 0, behavior: 'smooth' });

            if (updateRoute && window.Router) {
                Router.navigate(`product/${id}`, true);
            }
        } catch (error) {
            Toast.error('Error loading product details: ' + error.message);
        }
    },

    showAddSourceForm(productId) {
        const form = document.getElementById('addSourceForm');
        if (!form) return;
        const isHidden = form.style.display === 'none';
        form.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            document.getElementById('newSourceName').value = '';
            document.getElementById('newSourceUrl').value = '';
            document.getElementById('newSourceSelector').value = '';
            document.getElementById('newSourceTestResult').style.display = 'none';
            document.getElementById('newSourceName').focus();
        }
    },

    async addSource(productId) {
        const siteName = document.getElementById('newSourceName').value.trim();
        const url = document.getElementById('newSourceUrl').value.trim();
        const cssSelector = document.getElementById('newSourceSelector').value.trim();

        if (!siteName || !url || !cssSelector) {
            Toast.warning('Please fill in Store Name, Product URL, and CSS Selector.');
            return;
        }

        try {
            const product = await API.getProduct(productId);
            const sources = [...(product.sources || []), { siteName, url, cssSelector, usePuppeteer: false }];
            await API.updateProduct(productId, { sources });
            Toast.success(`Source "${siteName}" added!`);
            await this.showProductDetail(productId, false);
            this.loadProducts();
        } catch (error) {
            Toast.error('Error adding source: ' + error.message);
        }
    },

    async testSourceSelector(btn) {
        const item = btn.closest('.source-item');
        if (!item) return;

        const url = item.querySelector('.source-url-input').value.trim();
        const cssSelector = item.querySelector('.source-selector-input').value.trim();
        const usePuppeteer = item.querySelector('.source-puppeteer-input').checked;
        const resultDiv = item.querySelector('.test-selector-result');

        if (!url || !cssSelector) {
            Toast.warning('Please enter both Product URL and CSS Selector first.');
            return;
        }

        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = 'Testing...';
        resultDiv.style.display = 'block';
        resultDiv.className = 'test-selector-result testing';
        resultDiv.textContent = 'Connecting and evaluating selectors in order of preference...';

        try {
            const res = await API.testScrape({ url, cssSelector, usePuppeteer });
            if (res.success && res.price !== null) {
                resultDiv.className = 'test-selector-result success';
                resultDiv.textContent = `✓ Success! Extracted price: ${Utils.formatCurrency(res.price)}`;
                Toast.success(`Selector matched price: ${Utils.formatCurrency(res.price)}`);
            } else {
                throw new Error('No numeric price extracted from selector');
            }
        } catch (error) {
            resultDiv.className = 'test-selector-result error';
            resultDiv.textContent = `✕ Failed: ${error.message}`;
            Toast.error('Selector test failed: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = origText;
        }
    },

    async testNewSourceSelector() {
        const url = document.getElementById('newSourceUrl').value.trim();
        const cssSelector = document.getElementById('newSourceSelector').value.trim();
        const resultDiv = document.getElementById('newSourceTestResult');

        if (!url || !cssSelector) {
            Toast.warning('Please enter both Product URL and CSS Selector first.');
            return;
        }

        resultDiv.style.display = 'block';
        resultDiv.style.color = 'var(--text-secondary)';
        resultDiv.textContent = 'Testing selector...';

        try {
            const res = await API.testScrape({ url, cssSelector, usePuppeteer: false });
            if (res.success && res.price !== null) {
                resultDiv.style.color = 'var(--success)';
                resultDiv.textContent = `✓ Extracted price: ${Utils.formatCurrency(res.price)}`;
                Toast.success(`Test price extracted: ${Utils.formatCurrency(res.price)}`);
            } else {
                throw new Error('No numeric price extracted');
            }
        } catch (error) {
            resultDiv.style.color = 'var(--danger)';
            resultDiv.textContent = `✕ Error: ${error.message}`;
            Toast.error('Test failed: ' + error.message);
        }
    },

    async removeSource(productId, sourceIndex) {
        const confirmed = await Confirm.ask({
            title: 'Remove Store Feed',
            message: 'Are you sure you want to remove this price feed from this product?',
            confirmText: 'Remove Feed',
            danger: true
        });

        if (!confirmed) return;

        try {
            const product = await API.getProduct(productId);
            const sources = (product.sources || []).filter((_, idx) => idx !== sourceIndex);
            await API.updateProduct(productId, { sources });
            Toast.success('Store feed removed');
            await this.showProductDetail(productId, false);
            this.loadProducts();
        } catch (error) {
            Toast.error('Error removing source: ' + error.message);
        }
    },

    async scrapeSource(productId, sourceIndex, btn) {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '...';
        }
        try {
            Toast.info('Scraping store feed...');
            const res = await API.scrapeSource(productId, sourceIndex);
            Toast.success(`Scraped: ${Utils.formatCurrency(res.price)}`);
            await this.showProductDetail(productId, false);
            this.loadProducts();
        } catch (error) {
            Toast.error('Scrape failed: ' + error.message);
            // Reload to show error health status
            await this.showProductDetail(productId, false);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Scrape';
            }
        }
    },

    async scrapeProductAll(productId, btn) {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Scraping feeds...';
        }
        try {
            Toast.info('Scraping all stores for this product...');
            const res = await API.scrapeProduct(productId);
            const okCount = (res.results || []).filter(r => r.success).length;
            Toast.success(`Scrape complete: ${okCount}/${res.results?.length || 0} stores successful!`);
            await this.showProductDetail(productId, false);
            this.loadProducts();
        } catch (error) {
            Toast.error('Scrape all failed: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Scrape All Stores';
            }
        }
    },

    async editProduct(id) {
        const product = this.products.find(p => p._id === id);
        if (product) {
            this.openModal(product);
        } else {
            const p = await API.getProduct(id);
            if (p) this.openModal(p);
        }
    },

    async deleteProduct(id) {
        const product = this.products.find(p => p._id === id);
        const title = product ? product.title : 'this product';

        const confirmed = await Confirm.ask({
            title: 'Delete Tracked Product',
            message: `Are you sure you want to permanently delete "${title}" and all its historical price data? This cannot be undone.`,
            confirmText: 'Delete Permanently',
            danger: true
        });

        if (!confirmed) return;

        try {
            await API.deleteProduct(id);
            Toast.success(`"${title}" deleted successfully`);

            // Return to products view if detail is open
            document.getElementById('productDetail').style.display = 'none';
            document.getElementById('products-tab').style.display = 'block';

            if (window.Router) {
                Router.navigate('products', true);
            }

            await this.loadProducts();
        } catch (error) {
            Toast.error('Error deleting product: ' + error.message);
        }
    },

    async toggleProductActive(id, currentActive) {
        try {
            await API.updateProduct(id, { active: !currentActive });
            Toast.info(`Product tracking ${!currentActive ? 'resumed' : 'paused'}`);
            await this.loadProducts();
        } catch (error) {
            Toast.error('Error updating tracking status: ' + error.message);
        }
    },

    async scrapeAll() {
        const btn = document.getElementById('scrapeAllBtn');
        const origText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Scraping all products...';
        }

        try {
            Toast.info('Scraping all active products across all stores...');
            const res = await API.scrapeAll();
            Toast.success(res.message || 'Scraping completed successfully!');
            await this.loadProducts();
        } catch (error) {
            Toast.error('Batch scrape failed: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = origText;
            }
        }
    }
};

window.ProductsController = ProductsController;
