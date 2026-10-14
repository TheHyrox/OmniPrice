const ProductDetail = {
    currentProduct: null,
    chart: null,
    timeframe: 30,
    visibleSources: new Set(),
    showReferenceLine: true,

    palette: [
        '#0071e3', // Electric Blue
        '#34c759', // Apple Green
        '#ff9500', // Amber Orange
        '#ff3b30', // Crimson Red
        '#af52de', // Purple
        '#5856d6', // Indigo
        '#00c7be', // Teal
        '#ff2d55', // Pink
        '#64d2ff', // Sky Blue
        '#ffd60a'  // Yellow
    ],

    getSourceColor(index) {
        if (index < this.palette.length) return this.palette[index];
        return `hsl(${(index * 137.5) % 360}, 70%, 50%)`;
    },

    sanitizePrice(price, refPrice) {
        if (price == null || isNaN(price) || price <= 0) return null;
        let p = Number(price);
        if (refPrice && refPrice > 0) {
            // Auto-heal missing decimal separator (e.g. 186481 cents instead of 186.48)
            if (p > refPrice * 20 && (p / 100) <= refPrice * 2.5) {
                p = p / 100;
            } else if (p > refPrice * 20 && (p / 1000) <= refPrice * 2.5) {
                p = p / 1000;
            } else if (p > refPrice * 10) {
                return null; // Suppress extreme outlier to avoid destroying graph scale
            }
        }
        return p;
    },

    getStats(product) {
        let minPrice = Infinity;
        let minDate = null;
        let minSource = null;
        let maxPrice = -Infinity;
        let maxDate = null;

        (product.priceHistory || []).forEach(h => {
            (h.prices || []).forEach(p => {
                const clean = this.sanitizePrice(p.price, product.referencePrice);
                if (clean != null) {
                    if (clean < minPrice) {
                        minPrice = clean;
                        minDate = h.date;
                        minSource = product.sources[p.sourceIndex]?.siteName;
                    }
                    if (clean > maxPrice) {
                        maxPrice = clean;
                        maxDate = h.date;
                    }
                }
            });
        });

        // Find best current source
        const validSources = (product.sources || []).map((s, idx) => ({
            ...s,
            sourceIndex: idx,
            cleanPrice: this.sanitizePrice(s.lastPrice, product.referencePrice)
        })).filter(s => s.cleanPrice != null);

        validSources.sort((a, b) => a.cleanPrice - b.cleanPrice);

        const bestSource = validSources.length > 0 ? validSources[0] : null;
        const highestSource = validSources.length > 0 ? validSources[validSources.length - 1] : null;

        const currentLowest = bestSource ? bestSource.cleanPrice : this.sanitizePrice(product.lowestPrice, product.referencePrice);
        const currentHighest = highestSource ? highestSource.cleanPrice : null;

        const spread = (currentLowest != null && currentHighest != null && currentHighest > currentLowest)
            ? (currentHighest - currentLowest)
            : null;

        const isATL = currentLowest != null && minPrice !== Infinity && currentLowest <= minPrice * 1.005;

        // Savings vs Reference Price
        let savingsAmount = null;
        let savingsPercent = null;
        if (product.referencePrice && currentLowest != null) {
            savingsAmount = product.referencePrice - currentLowest;
            savingsPercent = ((currentLowest - product.referencePrice) / product.referencePrice) * 100;
        }

        return {
            minPrice: minPrice !== Infinity ? minPrice : null,
            minDate,
            minSource,
            maxPrice: maxPrice !== -Infinity ? maxPrice : null,
            maxDate,
            bestSource,
            currentLowest,
            currentHighest,
            spread,
            isATL,
            savingsAmount,
            savingsPercent,
            validSourcesCount: validSources.length
        };
    },

    render(product) {
        this.currentProduct = product;
        const imageUrl = escapeHtml(product.image || '/images/placeholder.svg');
        const id = escapeHtml(product._id);
        const title = escapeHtml(product.title);
        const desc = escapeHtml(product.description || 'No description provided.');
        const stats = this.getStats(product);

        // Reset visible sources to all sources initially
        this.visibleSources = new Set((product.sources || []).map((_, i) => i));

        const bestSource = stats.bestSource;

        return `
            <!-- Top Navigation Bar & Actions -->
            <div class="detail-nav-bar">
                <button class="btn btn-ghost detail-back-btn" onclick="App.backToPreviousTab()">
                    ← Back to ${App.previousTab === 'charts' ? 'Analytics' : 'Products'}
                </button>
                <div class="detail-top-actions">
                    <button class="btn btn-secondary" id="scrapeAllProductBtn" onclick="App.scrapeProductAll('${id}', this)">
                        Scrape All Stores
                    </button>
                    <button class="btn btn-secondary" onclick="App.editProduct('${id}')">
                        Edit
                    </button>
                    <button class="btn btn-ghost detail-delete-btn" onclick="App.deleteProduct('${id}')" title="Delete Product">
                        Delete
                    </button>
                </div>
            </div>

            <!-- Hero Section -->
            <div class="detail-hero">
                <div class="detail-image-wrapper">
                    <img class="detail-image" src="${imageUrl}" alt="${title}" onerror="this.src='/images/placeholder.svg'">
                    ${stats.isATL ? `<span class="detail-atl-badge">All-Time Low</span>` : ''}
                </div>

                <div class="detail-info">
                    <div class="detail-tags">
                        ${(product.tags || []).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}
                    </div>
                    <h1 class="detail-title">${title}</h1>
                    <p class="detail-desc">${desc}</p>

                    <div class="detail-pricing-block">
                        <div class="detail-main-price">
                            <span class="detail-price-value">${formatCurrency(stats.currentLowest)}</span>
                            ${bestSource ? `<span class="detail-price-store">at ${escapeHtml(bestSource.siteName)}</span>` : ''}
                        </div>

                        <div class="detail-price-metrics">
                            ${product.referencePrice != null ? `
                                <div class="detail-metric-chip">
                                    <span class="metric-label">Reference</span>
                                    <span class="metric-value strike">${formatCurrency(product.referencePrice)}</span>
                                </div>
                            ` : ''}

                            ${stats.savingsPercent != null ? `
                                <div class="detail-metric-chip savings ${stats.savingsPercent < 0 ? 'positive' : 'negative'}">
                                    <span class="metric-badge">
                                        ${stats.savingsPercent < 0 ? '' : '+'}${stats.savingsPercent.toFixed(1)}%
                                    </span>
                                    ${stats.savingsAmount > 0 ? `
                                        <span class="metric-savings-text">Save ${formatCurrency(stats.savingsAmount)}</span>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Best Deal Action Card -->
                <div class="detail-best-deal-box">
                    <div class="best-deal-badge">Best Verified Offer</div>
                    ${bestSource ? `
                        <div class="best-deal-price">${formatCurrency(bestSource.cleanPrice)}</div>
                        <div class="best-deal-store">${escapeHtml(bestSource.siteName)}</div>
                        <span class="best-deal-time">Updated ${formatTimeAgo(bestSource.lastScraped)}</span>
                        <a href="${escapeHtml(bestSource.url)}" target="_blank" rel="noopener" class="btn btn-primary best-deal-btn">
                            Buy Now ↗
                        </a>
                        ${(product.sources || []).length > 1 ? `
                            <span class="best-deal-compare-note">or compare ${(product.sources || []).length - 1} other stores below</span>
                        ` : ''}
                    ` : `
                        <p class="no-sources-note">No price data yet. Add a store source below to track prices.</p>
                        <button class="btn btn-secondary btn-sm" onclick="App.showAddSourceForm('${id}')">+ Add First Store</button>
                    `}
                </div>
            </div>

            <!-- Product Key Stats Row -->
            <div class="detail-stats-grid">
                <div class="detail-stat-card">
                    <div class="stat-card-header">
                        <span>All-Time Low (ATL)</span>
                    </div>
                    <div class="stat-card-value">${formatCurrency(stats.minPrice)}</div>
                    <div class="stat-card-sub">
                        ${stats.minDate ? `${escapeHtml(stats.minSource || '')} (${new Date(stats.minDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})` : 'No history yet'}
                    </div>
                </div>

                <div class="detail-stat-card">
                    <div class="stat-card-header">
                        <span>All-Time High (ATH)</span>
                    </div>
                    <div class="stat-card-value">${formatCurrency(stats.maxPrice)}</div>
                    <div class="stat-card-sub">
                        ${stats.maxDate ? new Date(stats.maxDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No history yet'}
                    </div>
                </div>

                <div class="detail-stat-card">
                    <div class="stat-card-header">
                        <span>Store Price Spread</span>
                    </div>
                    <div class="stat-card-value">
                        ${stats.spread != null ? formatCurrency(stats.spread) : '—'}
                    </div>
                    <div class="stat-card-sub">
                        ${stats.spread != null && stats.currentLowest ? `Gap between lowest & highest store (${((stats.spread / stats.currentLowest) * 100).toFixed(1)}%)` : 'Single source or equal prices'}
                    </div>
                </div>

                <div class="detail-stat-card">
                    <div class="stat-card-header">
                        <span>Active Stores</span>
                    </div>
                    <div class="stat-card-value">${(product.sources || []).length}</div>
                    <div class="stat-card-sub">
                        ${stats.validSourcesCount} stores reporting prices
                    </div>
                </div>
            </div>

            <!-- Price History Chart Section -->
            <div class="chart-section detail-chart-section">
                <div class="detail-chart-header">
                    <div>
                        <h2>Price History & Fluctuations</h2>
                        <span class="section-subtitle">Track price movements across individual stores over time</span>
                    </div>
                    <div class="timeframe-btns" id="productChartTimeframeBtns">
                        <button class="tf-btn" data-range="1" onclick="ProductDetail.updateChart(1)">1D</button>
                        <button class="tf-btn" data-range="5" onclick="ProductDetail.updateChart(5)">5D</button>
                        <button class="tf-btn active" data-range="30" onclick="ProductDetail.updateChart(30)">1M</button>
                        <button class="tf-btn" data-range="180" onclick="ProductDetail.updateChart(180)">6M</button>
                        <button class="tf-btn" data-range="365" onclick="ProductDetail.updateChart(365)">1Y</button>
                        <button class="tf-btn" data-range="0" onclick="ProductDetail.updateChart(0)">All</button>
                    </div>
                </div>

                <!-- Source Series Toggles -->
                <div class="detail-chart-toggles" id="detailChartToggles">
                    ${(product.sources || []).map((source, idx) => {
                        const color = this.getSourceColor(idx);
                        const isVisible = this.visibleSources.has(idx);
                        return `
                            <button class="detail-toggle-chip ${isVisible ? 'active' : ''}" 
                                onclick="ProductDetail.toggleSourceVisibility(${idx})" 
                                data-source="${idx}">
                                <span class="chip-color-dot" style="background-color: ${color}"></span>
                                <span>${escapeHtml(source.siteName)}</span>
                                ${isVisible ? '<span class="chip-check">✓</span>' : ''}
                            </button>
                        `;
                    }).join('')}
                    ${product.referencePrice != null ? `
                        <button class="detail-toggle-chip ${this.showReferenceLine ? 'active' : ''}" 
                            onclick="ProductDetail.toggleReferenceLine()">
                            <span class="chip-color-dot" style="background-color: #86868b; border: 1px dashed #fff;"></span>
                            <span>Reference Price</span>
                            ${this.showReferenceLine ? '<span class="chip-check">✓</span>' : ''}
                        </button>
                    ` : ''}
                </div>

                <div class="detail-chart-container">
                    <canvas id="productChart"></canvas>
                </div>
            </div>

            <!-- Price Sources & Feed Management -->
            <div class="scraper-section detail-sources-section">
                <div class="detail-sources-header">
                    <div>
                        <h2>Price Sources & Store Feeds (${(product.sources || []).length})</h2>
                        <span class="section-subtitle">Manage URLs and selectors used to scrape prices for this product</span>
                    </div>
                    <div class="sources-header-actions">
                        <button class="btn btn-secondary btn-sm" onclick="App.scrapeProductAll('${id}', this)">
                            Scrape All
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="App.showAddSourceForm('${id}')">
                            + Add Store
                        </button>
                    </div>
                </div>

                <!-- Add Source Form (Collapsible) -->
                <div id="addSourceForm" class="add-source-card" style="display: none;">
                    <div class="add-source-card-title">Add Store Price Feed</div>
                    <div class="add-source-grid">
                        <div class="form-group preset-group">
                            <label>Preset Store Template</label>
                            <select id="newSourceStoreSelect" class="source-store-select" onchange="App.onSourcePresetSelectChange(this)">
                                <option value="">-- Custom Store --</option>
                                ${(App.stores || []).map(store => `
                                    <option value="${escapeHtml(store._id)}" 
                                            data-name="${escapeHtml(store.name)}" 
                                            data-selector="${escapeHtml(store.cssSelector)}"
                                            data-url="${escapeHtml(store.defaultUrl || '')}">
                                        ${escapeHtml(store.name)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Store / Site Name *</label>
                            <input type="text" id="newSourceName" placeholder="e.g., Amazon, Louis Moto" required />
                        </div>

                        <div class="form-group url-group">
                            <label>Product Page URL *</label>
                            <input type="url" id="newSourceUrl" placeholder="https://www.example.com/item" required />
                        </div>

                        <div class="form-group selector-group">
                            <label>CSS Price Selector *</label>
                            <input type="text" id="newSourceSelector" placeholder="e.g., .price, span.heading1" required />
                        </div>
                    </div>

                    <div class="add-source-footer" style="justify-content: flex-end;">
                        <div class="add-source-actions">
                            <button type="button" class="btn btn-ghost" onclick="App.showAddSourceForm('${id}')">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="App.addSource('${id}')">Save Source</button>
                        </div>
                    </div>
                </div>

                <!-- Sources List -->
                <div class="source-list">
                    ${!product.sources || product.sources.length === 0 ? `
                        <div class="empty-state" style="padding: 40px;">
                            <div class="empty-state-icon"></div>
                            <h3>No price feeds configured</h3>
                            <p>Add a store URL and CSS selector above to track automated prices for this product.</p>
                        </div>
                    ` : product.sources.map((source, index) => {
                        const cleanPrice = this.sanitizePrice(source.lastPrice, product.referencePrice);
                        const isCheapest = cleanPrice != null && stats.bestSource && stats.bestSource.sourceIndex === index;
                        const diffVsBest = (cleanPrice != null && stats.bestSource && cleanPrice > stats.bestSource.cleanPrice)
                            ? (cleanPrice - stats.bestSource.cleanPrice)
                            : null;
                        const color = this.getSourceColor(index);

                        return `
                            <div class="source-row-card ${isCheapest ? 'is-best-deal' : ''}">
                                <div class="source-identity">
                                    <div class="source-name-row">
                                        <span class="source-color-dot" style="background-color: ${color}"></span>
                                        <strong class="source-name">${escapeHtml(source.siteName)}</strong>
                                        ${isCheapest ? `<span class="source-lowest-pill">Lowest Price</span>` : ''}
                                        ${source.usePuppeteer ? `<span class="source-puppeteer-pill" title="Rendered with Puppeteer">JS</span>` : ''}
                                    </div>
                                    <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener" class="source-url-link" title="${escapeHtml(source.url)}">
                                        ${escapeHtml(source.url)} ↗
                                    </a>
                                </div>

                                <div class="source-selector-info">
                                    <span class="source-selector-label">CSS Selector:</span>
                                    <code class="source-selector-code" title="Click to copy" onclick="navigator.clipboard.writeText('${escapeHtml(source.cssSelector)}'); alert('Selector copied to clipboard!');">
                                        ${escapeHtml(source.cssSelector)}
                                    </code>
                                    <span class="source-scrape-time">Last check: ${formatTimeAgo(source.lastScraped)}</span>
                                </div>

                                <div class="source-price-col">
                                    <div class="source-price-val">${cleanPrice != null ? formatCurrency(cleanPrice) : '—'}</div>
                                    ${diffVsBest ? `<span class="source-diff-badge">+${formatCurrency(diffVsBest)}</span>` : (isCheapest ? '<span class="source-best-badge">Best</span>' : '')}
                                </div>

                                <div class="source-actions-col">
                                    <button class="btn btn-secondary btn-sm scrape-btn" onclick="App.scrapeSource('${id}', ${index}, this)" title="Scrape this store now">
                                        Scrape
                                    </button>
                                    <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" title="Open product page">
                                        Visit ↗
                                    </a>
                                    <button class="btn btn-ghost source-delete-btn" onclick="App.removeSource('${id}', ${index})" title="Remove feed">
                                        ×
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    initChart(product, days = 30) {
        this.timeframe = days;
        const ctx = document.getElementById('productChart');
        if (!ctx) return;

        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }

        const hasTimeframe = days > 0;
        const cutoffDate = new Date();
        if (hasTimeframe) {
            cutoffDate.setDate(cutoffDate.getDate() - days);
        }

        const filteredHistory = (product.priceHistory || [])
            .filter(h => !hasTimeframe || new Date(h.date) >= cutoffDate)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Format dates
        const dateLabels = filteredHistory.map(h => {
            const date = new Date(h.date);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        // Ensure at least 1 point if empty
        if (dateLabels.length === 0) {
            dateLabels.push(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }

        const datasets = [];

        (product.sources || []).forEach((source, index) => {
            if (!this.visibleSources.has(index)) return;

            const color = this.getSourceColor(index);
            const data = filteredHistory.map(h => {
                const priceEntry = (h.prices || []).find(p => p.sourceIndex === index);
                if (!priceEntry) return null;
                return this.sanitizePrice(priceEntry.price, product.referencePrice);
            });

            // If empty history, fallback to current sanitized price
            if (filteredHistory.length === 0) {
                const current = this.sanitizePrice(source.lastPrice, product.referencePrice);
                data.push(current);
            }

            datasets.push({
                label: source.siteName,
                data,
                borderColor: color,
                backgroundColor: color + '15',
                borderWidth: 2.5,
                fill: false,
                cubicInterpolationMode: 'monotone',
                tension: 0.25,
                pointRadius: dateLabels.length > 40 ? 1 : 4,
                pointHoverRadius: 6,
                spanGaps: true
            });
        });

        if (this.showReferenceLine && product.referencePrice != null) {
            const refData = dateLabels.map(() => product.referencePrice);
            datasets.push({
                label: 'Reference Price',
                data: refData,
                borderColor: '#86868b',
                borderWidth: 1.5,
                borderDash: [6, 4],
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 0
            });
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
        const textColor = isDark ? '#a1a1a6' : '#6e6e73';

        this.chart = new Chart(ctx, {
            type: 'line',
            data: { labels: dateLabels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'nearest',
                    axis: 'x'
                },
                plugins: {
                    legend: {
                        display: false // Using our own custom interactive toggle chips above
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
                        callbacks: {
                            label: (context) => {
                                if (context.raw == null) return null;
                                return `${context.dataset.label}: €${context.raw.toFixed(2)}`;
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
                        beginAtZero: false,
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            font: { size: 11 },
                            callback: (value) => '€' + value.toFixed(0)
                        }
                    }
                }
            }
        });
    },

    updateChart(days) {
        document.querySelectorAll('#productChartTimeframeBtns .tf-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.range, 10) === days);
        });

        if (this.currentProduct) {
            this.initChart(this.currentProduct, days);
        }
    },

    toggleSourceVisibility(index) {
        if (this.visibleSources.has(index)) {
            // Keep at least one source visible
            if (this.visibleSources.size > 1) {
                this.visibleSources.delete(index);
            }
        } else {
            this.visibleSources.add(index);
        }

        // Update button visual
        const chip = document.querySelector(`.detail-toggle-chip[data-source="${index}"]`);
        if (chip) {
            const isVisible = this.visibleSources.has(index);
            chip.classList.toggle('active', isVisible);
            const check = chip.querySelector('.chip-check');
            if (isVisible && !check) {
                chip.insertAdjacentHTML('beforeend', '<span class="chip-check">✓</span>');
            } else if (!isVisible && check) {
                check.remove();
            }
        }

        if (this.currentProduct) {
            this.initChart(this.currentProduct, this.timeframe);
        }
    },

    toggleReferenceLine() {
        this.showReferenceLine = !this.showReferenceLine;
        const chip = document.querySelector('.detail-toggle-chip:last-child');
        if (chip) {
            chip.classList.toggle('active', this.showReferenceLine);
            const check = chip.querySelector('.chip-check');
            if (this.showReferenceLine && !check) {
                chip.insertAdjacentHTML('beforeend', '<span class="chip-check">✓</span>');
            } else if (!this.showReferenceLine && check) {
                check.remove();
            }
        }

        if (this.currentProduct) {
            this.initChart(this.currentProduct, this.timeframe);
        }
    }
};
