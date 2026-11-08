/**
 * OmniPrice - Bundles Controller
 * Manages product bundles, combined lowest pricing, and historical price evolution.
 */
const BundlesController = {
    bundles: [],
    currentBundle: null,
    chart: null,
    currentTimeframe: 30,
    availableProducts: [],
    modalSelectedProductIds: new Set(),
    searchQuery: '',

    async loadBundles() {
        try {
            const grid = document.getElementById('bundlesGrid');
            if (grid && (!this.bundles || this.bundles.length === 0)) {
                grid.innerHTML = `
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <p>Loading product bundles...</p>
                    </div>
                `;
            }

            this.bundles = await API.bundles.getAll();
            this.renderBundles();
        } catch (error) {
            console.error('Failed to load bundles:', error);
            Toast.error('Failed to load product bundles');
        }
    },

    renderBundles() {
        const grid = document.getElementById('bundlesGrid');
        if (!grid) return;

        if (!this.bundles || this.bundles.length === 0) {
            grid.innerHTML = `
                <div class="empty-state bundles-empty-state">
                    <div class="empty-state-icon"></div>
                    <h3>No bundles created yet</h3>
                    <p>Group tracked products together to follow their combined total cost and price evolution.</p>
                    <button class="btn btn-primary btn-sm" onclick="App.openBundleModal()" style="margin-top: 14px;">+ Create First Bundle</button>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.bundles.map(bundle => this.renderBundleCard(bundle)).join('');
    },

    renderBundleCard(bundle) {
        const id = escapeHtml(bundle._id);
        const name = escapeHtml(bundle.name);
        const desc = escapeHtml(bundle.description || '');
        const count = bundle.productsCount || (bundle.productIds || []).length;
        const products = bundle.products || [];

        const currentPrice = bundle.currentPrice != null && bundle.currentPrice > 0 ? bundle.currentPrice : null;
        const refPrice = bundle.referencePrice != null && bundle.referencePrice > 0 ? bundle.referencePrice : null;
        const savings = bundle.savings != null && bundle.savings > 0 ? bundle.savings : null;
        const savingsPercent = bundle.savingsPercent != null && bundle.savingsPercent > 0 ? bundle.savingsPercent : null;

        // Preview images of items (up to 4)
        const previewImages = products.slice(0, 4).map(p => `
            <img class="bundle-card-thumb" src="${escapeHtml(p.image || '/images/placeholder.svg')}" alt="${escapeHtml(p.title)}" title="${escapeHtml(p.title)}" onerror="this.src='/images/placeholder.svg'">
        `).join('');

        return `
            <article class="bundle-card" data-id="${id}">
                <div class="bundle-card-header">
                    <div>
                        <div class="bundle-badge-pill">${count} item${count !== 1 ? 's' : ''}</div>
                        <h3 class="bundle-card-title">${name}</h3>
                        ${desc ? `<p class="bundle-card-desc">${desc}</p>` : ''}
                    </div>
                </div>

                <div class="bundle-card-items-preview">
                    ${previewImages}
                    ${products.length > 4 ? `<span class="bundle-thumb-more">+${products.length - 4}</span>` : ''}
                </div>

                <div class="bundle-card-pricing">
                    <div class="bundle-price-main">
                        <span class="bundle-price-val">${currentPrice != null ? formatCurrency(currentPrice) : 'No prices yet'}</span>
                        ${savingsPercent != null ? `
                            <span class="bundle-savings-badge">Save ${savingsPercent.toFixed(1)}%</span>
                        ` : ''}
                    </div>
                    <div class="bundle-price-sub">
                        ${refPrice != null ? `<span class="bundle-ref-price">MSRP Total: ${formatCurrency(refPrice)}</span>` : ''}
                        ${savings != null ? `<span class="bundle-savings-amount">Save ${formatCurrency(savings)}</span>` : ''}
                    </div>
                </div>

                <div class="bundle-card-footer" onclick="event.stopPropagation()">
                    <button class="btn btn-primary btn-sm" onclick="App.showBundleDetail('${id}')">
                        View Evolution →
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="App.openBundleModal('${id}')">
                        Edit
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="App.deleteBundle('${id}')" style="color: var(--danger);">
                        Delete
                    </button>
                </div>
            </article>
        `;
    },

    async showBundleDetail(id, updateRoute = true) {
        try {
            const detailContainer = document.getElementById('bundleDetailContent');
            if (detailContainer) {
                detailContainer.innerHTML = `
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <p>Loading bundle evolution and breakdown...</p>
                    </div>
                `;
            }

            // Switch view
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            const detailSection = document.getElementById('bundle-detail');
            if (detailSection) detailSection.classList.add('active');

            if (updateRoute && window.Router) {
                Router.navigate(`bundle/${id}`, true);
            }

            const bundle = await API.bundles.getById(id);
            this.currentBundle = bundle;

            this.renderBundleDetail(bundle);
        } catch (error) {
            console.error('Failed to show bundle detail:', error);
            Toast.error('Failed to load bundle details');
        }
    },

    renderBundleDetail(bundle) {
        const detailContainer = document.getElementById('bundleDetailContent');
        if (!detailContainer) return;

        const id = escapeHtml(bundle._id);
        const name = escapeHtml(bundle.name);
        const desc = escapeHtml(bundle.description || '');
        const products = bundle.products || [];

        const currentPrice = bundle.currentPrice || 0;
        const refPrice = bundle.referencePrice || 0;
        const savings = bundle.savings || 0;
        const savingsPercent = bundle.savingsPercent || 0;
        const atlPrice = bundle.atlPrice || currentPrice;

        detailContainer.innerHTML = `
            <div class="bundle-detail-header-row">
                <div>
                    <span class="bundle-detail-meta">${products.length} items grouped</span>
                    <h1 class="bundle-detail-title">${name}</h1>
                    ${desc ? `<p class="bundle-detail-desc">${desc}</p>` : ''}
                </div>
                <div class="detail-top-actions">
                    <button class="btn btn-secondary" onclick="App.openBundleModal('${id}')">
                        Edit Bundle
                    </button>
                    <button class="btn btn-ghost" onclick="App.deleteBundle('${id}')" style="color: var(--danger);">
                        Delete Bundle
                    </button>
                </div>
            </div>

            <!-- KPI Summary Cards -->
            <div class="bundle-stats-grid">
                <div class="bundle-stat-card highlight-main">
                    <span class="stat-label">Combined Today's Lowest</span>
                    <span class="stat-value">${currentPrice > 0 ? formatCurrency(currentPrice) : '—'}</span>
                    <span class="stat-sub">Sum of best current offers</span>
                </div>
                <div class="bundle-stat-card">
                    <span class="stat-label">Reference Total</span>
                    <span class="stat-value">${refPrice > 0 ? formatCurrency(refPrice) : '—'}</span>
                    <span class="stat-sub">Combined catalog MSRP</span>
                </div>
                <div class="bundle-stat-card highlight-savings">
                    <span class="stat-label">Total Bundle Savings</span>
                    <span class="stat-value">${savings > 0 ? formatCurrency(savings) : '0.00'}</span>
                    <span class="stat-sub">${savingsPercent > 0 ? `-${savingsPercent.toFixed(1)}% off reference` : 'No discount recorded'}</span>
                </div>
                <div class="bundle-stat-card highlight-atl">
                    <span class="stat-label">Bundle All-Time Low</span>
                    <span class="stat-value">${atlPrice > 0 ? formatCurrency(atlPrice) : '—'}</span>
                    <span class="stat-sub">Record best combined price</span>
                </div>
            </div>

            <!-- Combined Price Evolution Graph -->
            <div class="bundle-chart-section">
                <div class="bundle-chart-header">
                    <div>
                        <h2>Combined Price Evolution</h2>
                        <p class="section-subtitle">Aggregated daily price trajectory across all bundle items</p>
                    </div>
                    <div class="bundle-timeframe-controls">
                        <button class="bundle-tf-btn ${this.currentTimeframe === 7 ? 'active' : ''}" onclick="BundlesController.setTimeframe(7)">7D</button>
                        <button class="bundle-tf-btn ${this.currentTimeframe === 30 ? 'active' : ''}" onclick="BundlesController.setTimeframe(30)">30D</button>
                        <button class="bundle-tf-btn ${this.currentTimeframe === 90 ? 'active' : ''}" onclick="BundlesController.setTimeframe(90)">90D</button>
                        <button class="bundle-tf-btn ${this.currentTimeframe === 0 ? 'active' : ''}" onclick="BundlesController.setTimeframe(0)">All</button>
                    </div>
                </div>

                <div class="bundle-chart-canvas-wrap">
                    <canvas id="bundleTimelineCanvas"></canvas>
                </div>
            </div>

            <!-- Product Breakdown Table -->
            <div class="bundle-breakdown-section">
                <div class="bundle-breakdown-header">
                    <h2>Included Products (${products.length})</h2>
                    <p class="section-subtitle">Individual items contributing to the bundle's total cost</p>
                </div>

                <div class="bundle-products-table-wrap">
                    <table class="bundle-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Today's Lowest</th>
                                <th>Merchant</th>
                                <th>Reference</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${products.map(p => {
                                const pId = escapeHtml(p._id);
                                const pTitle = escapeHtml(p.title);
                                const pImg = escapeHtml(p.image || '/images/placeholder.svg');
                                const lowestSrc = p.lowestPriceSource;
                                const lowestVal = p.lowestPrice != null ? formatCurrency(p.lowestPrice) : 'No price';
                                const refVal = p.referencePrice != null ? formatCurrency(p.referencePrice) : '—';

                                return `
                                    <tr>
                                        <td>
                                            <div class="bundle-table-item">
                                                <img class="bundle-table-thumb" src="${pImg}" alt="${pTitle}" onerror="this.src='/images/placeholder.svg'">
                                                <div>
                                                    <span class="bundle-table-name" onclick="App.showProductDetail('${pId}')">${pTitle}</span>
                                                    ${p.archived ? '<span class="bundle-table-archived-tag">Archived</span>' : ''}
                                                </div>
                                            </div>
                                        </td>
                                        <td class="bundle-table-price">
                                            <strong>${lowestVal}</strong>
                                        </td>
                                        <td>
                                            ${lowestSrc ? `
                                                <a href="${escapeHtml(lowestSrc.url)}" target="_blank" rel="noopener" class="bundle-table-store-link">
                                                    ${escapeHtml(lowestSrc.siteName)} ↗
                                                </a>
                                            ` : '<span style="color: var(--text-secondary);">—</span>'}
                                        </td>
                                        <td class="bundle-table-ref">${refVal}</td>
                                        <td>
                                            <button class="btn btn-ghost btn-sm" onclick="App.showProductDetail('${pId}')">
                                                Details →
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.initTimelineChart(bundle.timeline || []);
    },

    initTimelineChart(timeline) {
        const canvas = document.getElementById('bundleTimelineCanvas');
        if (!canvas) return;

        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }

        if (!timeline || timeline.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // Apply timeframe filter
        let filtered = [...timeline];
        if (this.currentTimeframe > 0) {
            const now = Date.now();
            const cutoff = now - (this.currentTimeframe * 86400000);
            const inRange = timeline.filter(pt => new Date(pt.date).getTime() >= cutoff);
            if (inRange.length >= 2) {
                filtered = inRange;
            } else if (timeline.length > 2) {
                filtered = timeline.slice(-Math.min(timeline.length, 10));
            }
        }

        const labels = filtered.map(pt => {
            const d = new Date(pt.date);
            return isNaN(d.getTime()) ? pt.date : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        });
        const dataPoints = filtered.map(pt => pt.totalPrice);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const lineColor = '#0071e3';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
        const textColor = isDark ? '#a1a1a6' : '#6e6e73';

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 260);
        gradient.addColorStop(0, 'rgba(0, 113, 227, 0.25)');
        gradient.addColorStop(1, 'rgba(0, 113, 227, 0.00)');

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Combined Bundle Price',
                    data: dataPoints,
                    borderColor: lineColor,
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.25,
                    pointRadius: filtered.length <= 30 ? 3.5 : 1,
                    pointHoverRadius: 6,
                    pointBackgroundColor: lineColor,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(24, 24, 27, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        titleColor: isDark ? '#ffffff' : '#111827',
                        bodyColor: isDark ? '#d1d5db' : '#374151',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: (context) => `Total Bundle: ${formatCurrency(context.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { size: 11 } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            font: { size: 11 },
                            callback: (val) => formatCurrency(val)
                        }
                    }
                }
            }
        });
    },

    setTimeframe(days) {
        this.currentTimeframe = days;
        document.querySelectorAll('.bundle-tf-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.includes(days === 0 ? 'All' : `${days}D`));
        });
        if (this.currentBundle) {
            this.initTimelineChart(this.currentBundle.timeline || []);
        }
    },

    async openModal(bundleId = null) {
        try {
            // Load latest active products for selection
            const products = await API.products.getAll({ includeHistory: false });
            this.availableProducts = products.filter(p => !p.archived);

            const modal = document.getElementById('bundleModal');
            const form = document.getElementById('bundleForm');
            const titleEl = document.getElementById('bundleModalTitle');
            const idInput = document.getElementById('bundleId');
            const nameInput = document.getElementById('bundleName');
            const descInput = document.getElementById('bundleDescription');
            const searchInput = document.getElementById('bundleProductSearch');

            if (!modal) return;

            form.reset();
            this.searchQuery = '';
            if (searchInput) searchInput.value = '';

            if (bundleId) {
                const bundle = this.bundles.find(b => b._id === bundleId) || await API.bundles.getById(bundleId);
                titleEl.textContent = 'Edit Bundle';
                idInput.value = bundle._id;
                nameInput.value = bundle.name;
                descInput.value = bundle.description || '';
                this.modalSelectedProductIds = new Set((bundle.productIds || []).map(String));
            } else {
                titleEl.textContent = 'Create Bundle';
                idInput.value = '';
                this.modalSelectedProductIds = new Set();
            }

            this.renderProductChecklist();
            this.updatePickerSummary();

            modal.classList.add('active');
            nameInput.focus();
        } catch (error) {
            console.error('Failed to open bundle modal:', error);
            Toast.error('Could not open bundle editor');
        }
    },

    closeModal() {
        const modal = document.getElementById('bundleModal');
        if (modal) modal.classList.remove('active');
        this.modalSelectedProductIds.clear();
    },

    renderProductChecklist() {
        const container = document.getElementById('bundleProductsList');
        if (!container) return;

        const query = (this.searchQuery || '').toLowerCase().trim();
        const filtered = this.availableProducts.filter(p => {
            if (!query) return true;
            return (p.title || '').toLowerCase().includes(query) ||
                (p.tags || []).some(t => t.toLowerCase().includes(query));
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="bundle-picker-empty">
                    No matching products found.
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(p => {
            const pId = String(p._id);
            const isChecked = this.modalSelectedProductIds.has(pId);
            const price = p.lowestPrice != null ? formatCurrency(p.lowestPrice) : 'No price';

            return `
                <label class="bundle-check-row ${isChecked ? 'selected' : ''}" onclick="BundlesController.onCheckboxClick(event, '${escapeHtml(pId)}')">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} style="pointer-events: none;" />
                    <img class="bundle-check-thumb" src="${escapeHtml(p.image || '/images/placeholder.svg')}" alt="${escapeHtml(p.title)}" onerror="this.src='/images/placeholder.svg'">
                    <span class="bundle-check-title">${escapeHtml(p.title)}</span>
                    <span class="bundle-check-price">${price}</span>
                </label>
            `;
        }).join('');
    },

    onCheckboxClick(e, productId) {
        e.preventDefault();
        e.stopPropagation();

        const row = e.currentTarget;
        const checkbox = row.querySelector('input[type="checkbox"]');

        if (this.modalSelectedProductIds.has(productId)) {
            this.modalSelectedProductIds.delete(productId);
            row.classList.remove('selected');
            if (checkbox) checkbox.checked = false;
        } else {
            this.modalSelectedProductIds.add(productId);
            row.classList.add('selected');
            if (checkbox) checkbox.checked = true;
        }

        this.updatePickerSummary();
    },

    selectAllProducts() {
        this.availableProducts.forEach(p => {
            this.modalSelectedProductIds.add(String(p._id));
        });
        this.renderProductChecklist();
        this.updatePickerSummary();
    },

    deselectAllProducts() {
        this.modalSelectedProductIds.clear();
        this.renderProductChecklist();
        this.updatePickerSummary();
    },

    updatePickerSummary() {
        const countEl = document.getElementById('bundleSelectedCount');
        const totalEl = document.getElementById('bundleSelectedTotal');
        if (!countEl || !totalEl) return;

        const count = this.modalSelectedProductIds.size;
        countEl.textContent = count;

        let total = 0;
        let validPricesCount = 0;

        this.availableProducts.forEach(p => {
            if (this.modalSelectedProductIds.has(String(p._id))) {
                if (p.lowestPrice != null && p.lowestPrice > 0) {
                    total += Number(p.lowestPrice);
                    validPricesCount++;
                }
            }
        });

        if (count === 0) {
            totalEl.textContent = '—';
        } else if (validPricesCount === 0) {
            totalEl.textContent = 'No price data yet';
        } else {
            totalEl.textContent = formatCurrency(total);
        }
    },

    async handleFormSubmit(e) {
        e.preventDefault();

        const idInput = document.getElementById('bundleId');
        const nameInput = document.getElementById('bundleName');
        const descInput = document.getElementById('bundleDescription');
        const saveBtn = document.getElementById('saveBundleBtn');

        const name = nameInput.value.trim();
        const description = descInput ? descInput.value.trim() : '';
        const productIds = Array.from(this.modalSelectedProductIds);

        if (!name) {
            Toast.error('Please enter a bundle name');
            return;
        }

        if (productIds.length === 0) {
            Toast.error('Please select at least one product for this bundle');
            return;
        }

        const origBtnText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const isEdit = Boolean(idInput.value);
            if (isEdit) {
                await API.bundles.update(idInput.value, { name, description, productIds });
                Toast.success(`Bundle "${name}" updated successfully`);
            } else {
                await API.bundles.create({ name, description, productIds });
                Toast.success(`Bundle "${name}" created successfully`);
            }

            this.closeModal();
            await this.loadBundles();

            // Refresh open detail view if active
            const detailSection = document.getElementById('bundle-detail');
            if (detailSection && detailSection.classList.contains('active') && this.currentBundle) {
                await this.showBundleDetail(this.currentBundle._id, false);
            }
        } catch (error) {
            console.error('Failed to save bundle:', error);
            Toast.error('Failed to save bundle: ' + (error.message || 'Unknown error'));
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = origBtnText;
        }
    },

    async deleteBundle(id) {
        const bundle = this.bundles.find(b => b._id === id) || (this.currentBundle && this.currentBundle._id === id ? this.currentBundle : null);
        const name = bundle ? bundle.name : 'this bundle';

        const confirmed = await Confirm.ask({
            title: 'Delete Bundle',
            message: `Are you sure you want to delete the bundle "${name}"? Individual products inside it will remain tracked and intact.`,
            confirmText: 'Delete Bundle',
            danger: true
        });

        if (!confirmed) return;

        try {
            await API.bundles.delete(id);
            Toast.success(`Bundle "${name}" deleted successfully`);

            // If detail view is open, return to bundles list
            const detailSection = document.getElementById('bundle-detail');
            if (detailSection && detailSection.classList.contains('active')) {
                detailSection.classList.remove('active');
                if (window.App) App.navigateToTab('bundles');
            }

            await this.loadBundles();
        } catch (error) {
            console.error('Failed to delete bundle:', error);
            Toast.error('Error deleting bundle: ' + error.message);
        }
    }
};

window.BundlesController = BundlesController;
