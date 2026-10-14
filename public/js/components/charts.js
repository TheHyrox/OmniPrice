const Charts = {
    chart: null,
    sparklineCharts: {},
    products: [],
    selectedProductIds: new Set(),
    timeframe: 30,
    scaleMode: 'absolute',
    currentView: 'comparison',
    searchQuery: '',
    selectedTag: null,
    gridSearchQuery: '',
    gridSort: 'delta',
    eventsBound: false,

    palette: [
        '#0071e3',
        '#34c759',
        '#ff9500',
        '#ff3b30',
        '#af52de',
        '#5856d6',
        '#00c7be',
        '#ff2d55',
        '#64d2ff',
        '#ffd60a',
        '#30b0c7',
        '#a2845e'
    ],

    getColor(index) {
        if (index < this.palette.length) {
            return this.palette[index];
        }
        const hue = (index * 137.5) % 360;
        return `hsl(${hue}, 70%, 50%)`;
    },

    init(products) {
        this.products = products || [];

        if (this.selectedProductIds.size === 0 && this.products.length > 0) {
            this.selectInitialProducts();
        }

        if (!this.eventsBound) {
            this.bindEvents();
            this.eventsBound = true;
        }

        this.renderKpis();
        this.renderTagFilters();
        this.renderChips();

        if (this.currentView === 'comparison') {
            this.renderComparisonChart();
        } else {
            this.renderSparklineGrid();
        }
    },

    selectInitialProducts() {
        const sorted = [...this.products].sort((a, b) => (a.priceDelta ?? 0) - (b.priceDelta ?? 0));
        const initial = sorted.slice(0, Math.min(5, this.products.length));
        this.selectedProductIds = new Set(initial.map(p => p._id));
    },

    bindEvents() {
        const compBtn = document.getElementById('chartViewComparisonBtn');
        const gridBtn = document.getElementById('chartViewGridBtn');
        if (compBtn && gridBtn) {
            compBtn.addEventListener('click', () => this.switchView('comparison'));
            gridBtn.addEventListener('click', () => this.switchView('grid'));
        }

        document.querySelectorAll('#chartTimeframeBtns .tf-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const range = parseInt(btn.dataset.range, 10);
                this.updateTimeframe(range);
            });
        });

        const absBtn = document.getElementById('scaleAbsoluteBtn');
        const relBtn = document.getElementById('scaleRelativeBtn');
        if (absBtn && relBtn) {
            absBtn.addEventListener('click', () => this.setScaleMode('absolute'));
            relBtn.addEventListener('click', () => this.setScaleMode('relative'));
        }

        document.getElementById('chartPresetTop5Btn')?.addEventListener('click', () => {
            this.selectTopDeals(5);
        });
        document.getElementById('chartSelectAllBtn')?.addEventListener('click', () => {
            this.selectAll();
        });
        document.getElementById('chartClearAllBtn')?.addEventListener('click', () => {
            this.clearAll();
        });

        // Product Search Filter in Comparison
        const searchInput = document.getElementById('chartProductSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.renderChips();
            });
        }

        // Sparkline Grid Search & Sort
        const gridSearch = document.getElementById('chartGridSearch');
        if (gridSearch) {
            gridSearch.addEventListener('input', (e) => {
                this.gridSearchQuery = e.target.value.toLowerCase().trim();
                this.renderSparklineGrid();
            });
        }

        const gridSort = document.getElementById('chartGridSort');
        if (gridSort) {
            gridSort.addEventListener('change', (e) => {
                this.gridSort = e.target.value;
                this.renderSparklineGrid();
            });
        }

        // Theme Mutation Observer to auto-adapt chart styling
        const observer = new MutationObserver(() => {
            if (this.currentView === 'comparison' && this.chart) {
                this.renderComparisonChart();
            }
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    },

    switchView(view) {
        this.currentView = view;
        const compBtn = document.getElementById('chartViewComparisonBtn');
        const gridBtn = document.getElementById('chartViewGridBtn');
        const compSec = document.getElementById('chartComparisonSection');
        const gridSec = document.getElementById('chartGridSection');

        if (compBtn) compBtn.classList.toggle('active', view === 'comparison');
        if (gridBtn) gridBtn.classList.toggle('active', view === 'grid');

        if (view === 'comparison') {
            if (compSec) compSec.style.display = 'block';
            if (gridSec) gridSec.style.display = 'none';
            this.renderComparisonChart();
        } else {
            if (compSec) compSec.style.display = 'none';
            if (gridSec) gridSec.style.display = 'block';
            this.renderSparklineGrid();
        }
    },

    updateTimeframe(days) {
        this.timeframe = days;
        document.querySelectorAll('#chartTimeframeBtns .tf-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.range, 10) === days);
        });

        if (this.currentView === 'comparison') {
            this.renderComparisonChart();
        } else {
            this.renderSparklineGrid();
        }
    },

    setScaleMode(mode) {
        this.scaleMode = mode;
        document.getElementById('scaleAbsoluteBtn')?.classList.toggle('active', mode === 'absolute');
        document.getElementById('scaleRelativeBtn')?.classList.toggle('active', mode === 'relative');
        this.renderComparisonChart();
    },

    /* ========================================================
       KPI Summary Dashboard
       ======================================================== */
    renderKpis() {
        const container = document.getElementById('chartKpiContainer');
        if (!container) return;

        if (!this.products || this.products.length === 0) {
            container.innerHTML = '';
            return;
        }

        // 1. Total Products
        const totalCount = this.products.length;

        // 2. Best Deal (largest negative delta)
        let bestDeal = null;
        let bestDealDelta = 0;
        this.products.forEach(p => {
            if (p.priceDelta != null && p.priceDelta < bestDealDelta) {
                bestDealDelta = p.priceDelta;
                bestDeal = p;
            }
        });

        // 3. Products at All-Time Low (ATL)
        let atlCount = 0;
        this.products.forEach(p => {
            if (this.isAtAllTimeLow(p)) {
                atlCount++;
            }
        });

        // 4. Portfolio Average Delta
        const validDeltas = this.products.map(p => p.priceDelta).filter(d => d != null && !isNaN(d));
        const avgDelta = validDeltas.length > 0 
            ? validDeltas.reduce((acc, v) => acc + v, 0) / validDeltas.length 
            : 0;

        container.innerHTML = `
            <div class="chart-kpi-card">
                <div class="kpi-header">
                    <span>Tracked Products</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value">${totalCount}</span>
                </div>
                <span class="kpi-sub">${this.selectedProductIds.size} selected in comparison</span>
            </div>

            <div class="chart-kpi-card">
                <div class="kpi-header">
                    <span>Top Discount</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value">${bestDeal ? `${bestDealDelta.toFixed(1)}%` : '—'}</span>
                    ${bestDeal ? `<span class="kpi-badge negative">Deal</span>` : ''}
                </div>
                <span class="kpi-sub" title="${escapeHtml(bestDeal?.title || 'None')}">
                    ${escapeHtml(bestDeal?.title || 'No discounts yet')}
                </span>
            </div>

            <div class="chart-kpi-card">
                <div class="kpi-header">
                    <span>At All-Time Low</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value">${atlCount}</span>
                    <span class="kpi-badge ${atlCount > 0 ? 'positive' : 'neutral'}">${atlCount > 0 ? 'Active' : 'None'}</span>
                </div>
                <span class="kpi-sub">Items at historic lowest price</span>
            </div>

            <div class="chart-kpi-card">
                <div class="kpi-header">
                    <span>Avg. Price Trend</span>
                </div>
                <div class="kpi-value-row">
                    <span class="kpi-value">${avgDelta > 0 ? '+' : ''}${avgDelta.toFixed(1)}%</span>
                    <span class="kpi-badge ${avgDelta <= 0 ? 'positive' : 'negative'}">
                        ${avgDelta <= 0 ? 'Savings' : 'Inflation'}
                    </span>
                </div>
                <span class="kpi-sub">Across all tracked products</span>
            </div>
        `;
    },

    isAtAllTimeLow(product) {
        if (!product.lowestPrice || !product.priceHistory || product.priceHistory.length === 0) return false;
        
        let minEver = Infinity;
        product.priceHistory.forEach(h => {
            if (h.prices && h.prices.length > 0) {
                h.prices.forEach(p => {
                    if (typeof p.price === 'number' && p.price > 0 && p.price < minEver) {
                        minEver = p.price;
                    }
                });
            }
        });

        if (minEver === Infinity) return false;
        // Consider at ATL if current price is within 0.5% of min ever
        return product.lowestPrice <= minEver * 1.005;
    },

    /* ========================================================
       Tag Filters & Product Chips
       ======================================================== */
    renderTagFilters() {
        const container = document.getElementById('chartTagFilters');
        if (!container) return;

        const allTags = [...new Set(this.products.flatMap(p => p.tags || []))].filter(Boolean);
        if (allTags.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <button class="chart-tag-btn ${this.selectedTag === null ? 'active' : ''}" data-tag="all">All Tags</button>
            ${allTags.map(tag => `
                <button class="chart-tag-btn ${this.selectedTag === tag ? 'active' : ''}" data-tag="${escapeHtml(tag)}">
                    #${escapeHtml(tag)}
                </button>
            `).join('')}
        `;

        container.querySelectorAll('.chart-tag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag;
                this.selectedTag = tag === 'all' ? null : tag;
                this.renderTagFilters();
                this.renderChips();
            });
        });
    },

    renderChips() {
        const container = document.getElementById('chartProductChips');
        const countLabel = document.getElementById('chartSelectedCount');
        if (!container) return;

        let filtered = this.products.filter(p => {
            if (this.searchQuery) {
                const matchTitle = p.title.toLowerCase().includes(this.searchQuery);
                const matchTag = (p.tags || []).some(t => t.toLowerCase().includes(this.searchQuery));
                if (!matchTitle && !matchTag) return false;
            }
            if (this.selectedTag && !(p.tags || []).includes(this.selectedTag)) {
                return false;
            }
            return true;
        });

        if (countLabel) {
            countLabel.textContent = `Comparing ${this.selectedProductIds.size} of ${this.products.length} products`;
        }

        if (filtered.length === 0) {
            container.innerHTML = `<span style="font-size: 0.8125rem; color: var(--text-tertiary);">No products match filter</span>`;
            return;
        }

        // Map product to stable palette color
        const productIndexMap = new Map();
        this.products.forEach((p, idx) => productIndexMap.set(p._id, idx));

        container.innerHTML = filtered.map(p => {
            const isSelected = this.selectedProductIds.has(p._id);
            const color = this.getColor(productIndexMap.get(p._id) || 0);

            return `
                <div class="chart-chip ${isSelected ? 'active' : ''}" data-id="${escapeHtml(p._id)}">
                    <span class="chart-chip-dot" style="background-color: ${color}"></span>
                    <span class="chart-chip-name" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</span>
                    ${isSelected ? '<span class="chart-chip-check">✓</span>' : ''}
                </div>
            `;
        }).join('');

        container.querySelectorAll('.chart-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const id = chip.dataset.id;
                this.toggleProductSelection(id);
            });
        });
    },

    toggleProductSelection(id) {
        if (this.selectedProductIds.has(id)) {
            this.selectedProductIds.delete(id);
        } else {
            this.selectedProductIds.add(id);
        }
        this.renderChips();
        this.renderKpis();
        this.renderComparisonChart();
    },

    selectTopDeals(n = 5) {
        const sorted = [...this.products].sort((a, b) => (a.priceDelta ?? 0) - (b.priceDelta ?? 0));
        this.selectedProductIds = new Set(sorted.slice(0, n).map(p => p._id));
        this.renderChips();
        this.renderKpis();
        this.renderComparisonChart();
    },

    selectAll() {
        this.selectedProductIds = new Set(this.products.map(p => p._id));
        this.renderChips();
        this.renderKpis();
        this.renderComparisonChart();
    },

    clearAll() {
        this.selectedProductIds.clear();
        this.renderChips();
        this.renderKpis();
        this.renderComparisonChart();
    },

    /* ========================================================
       Multi-Product Comparison Chart
       ======================================================== */
    renderComparisonChart() {
        const canvasWrapper = document.getElementById('globalChartWrapper');
        const emptyWarning = document.getElementById('chartEmptyWarning');
        const ctx = document.getElementById('globalChart');

        if (!ctx) return;

        if (this.selectedProductIds.size === 0) {
            if (emptyWarning) emptyWarning.style.display = 'block';
            if (canvasWrapper) canvasWrapper.style.display = 'none';
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }
            return;
        }

        if (emptyWarning) emptyWarning.style.display = 'none';
        if (canvasWrapper) canvasWrapper.style.display = 'block';

        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }

        const selectedProducts = this.products.filter(p => this.selectedProductIds.has(p._id));
        if (selectedProducts.length === 0) return;

        // Cutoff date
        const hasTimeframe = this.timeframe > 0;
        const cutoffDate = new Date();
        if (hasTimeframe) {
            cutoffDate.setDate(cutoffDate.getDate() - this.timeframe);
        }

        // Collect unique timeline dates
        const allDates = new Set();
        selectedProducts.forEach(product => {
            (product.priceHistory || [])
                .filter(h => !hasTimeframe || new Date(h.date) >= cutoffDate)
                .forEach(h => {
                    const dateStr = new Date(h.date).toISOString().split('T')[0];
                    allDates.add(dateStr);
                });
        });

        const sortedDates = Array.from(allDates).sort();

        // If no history in range, fallback to at least product createdAt or today
        if (sortedDates.length === 0) {
            sortedDates.push(new Date().toISOString().split('T')[0]);
        }

        const labels = sortedDates.map(d => {
            const date = new Date(d);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const productIndexMap = new Map();
        this.products.forEach((p, idx) => productIndexMap.set(p._id, idx));

        const datasets = selectedProducts.map(product => {
            const color = this.getColor(productIndexMap.get(product._id) || 0);

            // Extract historical price for each date
            const rawPrices = sortedDates.map(dateStr => {
                const historyEntry = (product.priceHistory || []).find(h => {
                    return new Date(h.date).toISOString().split('T')[0] === dateStr;
                });

                if (!historyEntry || !historyEntry.prices || !historyEntry.prices.length) return null;
                const validPrices = historyEntry.prices
                    .map(p => p.price)
                    .filter(p => typeof p === 'number' && !isNaN(p) && p > 0);

                return validPrices.length > 0 ? Math.min(...validPrices) : null;
            });

            // Find baseline price for normalized % change calculation
            let baseline = null;
            for (let i = 0; i < rawPrices.length; i++) {
                if (rawPrices[i] != null) {
                    baseline = rawPrices[i];
                    break;
                }
            }
            if (!baseline) baseline = product.referencePrice || 1;

            const chartData = rawPrices.map(p => {
                if (p == null) return null;
                if (this.scaleMode === 'relative') {
                    return ((p - baseline) / baseline) * 100;
                }
                return p;
            });

            return {
                label: product.title,
                rawPrices: rawPrices,
                baseline: baseline,
                data: chartData,
                borderColor: color,
                backgroundColor: color + '15',
                borderWidth: 2.5,
                fill: false,
                cubicInterpolationMode: 'monotone',
                tension: 0.25,
                pointRadius: sortedDates.length > 40 ? 1 : 3.5,
                pointHoverRadius: 6,
                spanGaps: true
            };
        });

        // Theme-aware colors
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
        const textColor = isDark ? '#a1a1a6' : '#6e6e73';

        const isRelative = this.scaleMode === 'relative';

        this.chart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            usePointStyle: true,
                            padding: 18,
                            boxWidth: 8,
                            font: { size: 12, family: 'Inter, sans-serif' }
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(28, 28, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        titleColor: isDark ? '#f5f5f7' : '#1d1d1f',
                        bodyColor: isDark ? '#d2d2d7' : '#424245',
                        borderColor: isDark ? '#38383a' : '#d2d2d7',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        boxPadding: 4,
                        callbacks: {
                            label: (context) => {
                                const val = context.raw;
                                if (val == null) return null;
                                const ds = context.dataset;
                                const originalPrice = ds.rawPrices ? ds.rawPrices[context.dataIndex] : null;

                                if (isRelative) {
                                    const sign = val > 0 ? '+' : '';
                                    const priceInfo = originalPrice != null ? ` (€${originalPrice.toFixed(2)})` : '';
                                    return `${ds.label}: ${sign}${val.toFixed(1)}%${priceInfo}`;
                                }
                                return `${ds.label}: €${val.toFixed(2)}`;
                            }
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
                            callback: (val) => isRelative ? `${val > 0 ? '+' : ''}${val.toFixed(0)}%` : `€${val.toFixed(0)}`
                        }
                    }
                }
            }
        });
    },

    /* ========================================================
       Sparkline Grid View (Clean Cards for Many Products)
       ======================================================== */
    renderSparklineGrid() {
        const container = document.getElementById('chartSparklineGrid');
        if (!container) return;

        // Clean up previous sparklines
        Object.values(this.sparklineCharts).forEach(ch => ch.destroy());
        this.sparklineCharts = {};

        let filtered = this.products.filter(p => {
            if (this.gridSearchQuery) {
                const matchTitle = p.title.toLowerCase().includes(this.gridSearchQuery);
                const matchTag = (p.tags || []).some(t => t.toLowerCase().includes(this.gridSearchQuery));
                if (!matchTitle && !matchTag) return false;
            }
            return true;
        });

        filtered.sort((a, b) => {
            switch (this.gridSort) {
                case 'delta':
                    return (a.priceDelta ?? 0) - (b.priceDelta ?? 0);
                case 'alpha':
                    return a.title.localeCompare(b.title);
                case 'price':
                    return (a.lowestPrice ?? Infinity) - (b.lowestPrice ?? Infinity);
                default:
                    return 0;
            }
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; padding: 48px;">
                    <div class="empty-state-icon"></div>
                    <h3>No matching products</h3>
                    <p>Try searching for a different keyword or tag.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(product => {
            const id = escapeHtml(product._id);
            const title = escapeHtml(product.title);
            const image = escapeHtml(product.image || '/images/placeholder.svg');
            const isComparing = this.selectedProductIds.has(product._id);
            const isATL = this.isAtAllTimeLow(product);
            const currentPrice = product.lowestPrice != null ? `€${product.lowestPrice.toFixed(2)}` : 'N/A';
            const refPrice = product.referencePrice != null ? `€${product.referencePrice.toFixed(2)}` : '';
            const delta = product.priceDelta;

            return `
                <div class="sparkline-card" data-id="${id}">
                    <div class="sparkline-card-header">
                        <img src="${image}" alt="${title}" class="sparkline-thumb" onerror="this.src='/images/placeholder.svg'">
                        <div class="sparkline-title-wrap">
                            <h4 class="sparkline-card-title" onclick="App.showProductDetail('${id}')" title="${title}">${title}</h4>
                            <div class="sparkline-tags">
                                ${(product.tags || []).slice(0, 2).map(t => `<span class="sparkline-tag">${escapeHtml(t)}</span>`).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="sparkline-price-row">
                        <div>
                            <span class="sparkline-price-current">${currentPrice}</span>
                            ${refPrice ? `<span class="sparkline-ref-price">${refPrice}</span>` : ''}
                        </div>
                        <div class="sparkline-badges">
                            ${isATL ? `<span class="atl-badge">ATL</span>` : ''}
                            ${delta != null ? `
                                <span class="price-delta ${delta < 0 ? 'negative' : 'positive'}">
                                    ${delta < 0 ? '' : '+'}${delta.toFixed(1)}%
                                </span>
                            ` : ''}
                        </div>
                    </div>

                    <div class="sparkline-chart-wrapper">
                        <canvas id="sparkline-${id}"></canvas>
                    </div>

                    <div class="sparkline-card-stats" id="sparkline-stats-${id}">
                        <span>Min: —</span>
                        <span>Max: —</span>
                    </div>

                    <div class="sparkline-card-footer">
                        <button class="btn-compare-toggle ${isComparing ? 'active' : ''}" onclick="Charts.toggleFromCard('${id}')">
                            ${isComparing ? '✓ Comparing' : '+ Compare'}
                        </button>
                        <button class="btn btn-sm btn-ghost" onclick="App.showProductDetail('${id}')">
                            Details →
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Initialize mini sparklines for each card
        filtered.forEach(product => {
            this.initCardSparkline(product);
        });
    },

    initCardSparkline(product) {
        const canvas = document.getElementById(`sparkline-${product._id}`);
        if (!canvas) return;

        const hasTimeframe = this.timeframe > 0;
        const cutoffDate = new Date();
        if (hasTimeframe) {
            cutoffDate.setDate(cutoffDate.getDate() - this.timeframe);
        }

        const history = (product.priceHistory || [])
            .filter(h => !hasTimeframe || new Date(h.date) >= cutoffDate)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const prices = [];
        const labels = [];

        history.forEach(h => {
            if (h.prices && h.prices.length > 0) {
                const valid = h.prices.map(p => p.price).filter(p => typeof p === 'number' && !isNaN(p) && p > 0);
                if (valid.length > 0) {
                    prices.push(Math.min(...valid));
                    labels.push(new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                }
            }
        });

        // If no data points, fallback to current price or reference
        if (prices.length === 0 && product.lowestPrice != null) {
            prices.push(product.lowestPrice, product.lowestPrice);
            labels.push('Now', 'Now');
        }

        // Stats update
        const statsEl = document.getElementById(`sparkline-stats-${product._id}`);
        if (statsEl && prices.length > 0) {
            const minP = Math.min(...prices);
            const maxP = Math.max(...prices);
            statsEl.innerHTML = `
                <span>Min: €${minP.toFixed(2)}</span>
                <span>Max: €${maxP.toFixed(2)}</span>
            `;
        }

        const isDrop = prices.length >= 2 && prices[prices.length - 1] < prices[0];
        const lineColor = isDrop ? '#34c759' : (prices.length >= 2 && prices[prices.length - 1] > prices[0] ? '#ff3b30' : '#0071e3');

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 90);
        gradient.addColorStop(0, lineColor + '33');
        gradient.addColorStop(1, lineColor + '00');

        this.sparklineCharts[product._id] = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data: prices,
                    borderColor: lineColor,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    cubicInterpolationMode: 'monotone',
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        padding: 6,
                        displayColors: false,
                        callbacks: {
                            title: (items) => items[0]?.label || '',
                            label: (ctx) => `€${ctx.raw.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    x: { display: false },
                    y: {
                        display: false,
                        // Add slight padding to prevent clipping line
                        grace: '5%'
                    }
                }
            }
        });
    },

    toggleFromCard(id) {
        if (this.selectedProductIds.has(id)) {
            this.selectedProductIds.delete(id);
        } else {
            this.selectedProductIds.add(id);
        }
        this.renderKpis();
        this.renderChips();
        // Update button visual in sparkline grid without re-rendering everything
        const card = document.querySelector(`.sparkline-card[data-id="${id}"]`);
        if (card) {
            const btn = card.querySelector('.btn-compare-toggle');
            if (btn) {
                const active = this.selectedProductIds.has(id);
                btn.classList.toggle('active', active);
                btn.textContent = active ? '✓ Comparing' : '+ Compare';
            }
        }
    },

    onThemeChange() {
        if (this.currentView === 'comparison' && this.chart) {
            this.renderComparisonChart();
        }
    }
};
