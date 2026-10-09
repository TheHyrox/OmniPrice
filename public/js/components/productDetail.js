const ProductDetail = {
    currentProduct: null,
    chart: null,

    render(product) {
        this.currentProduct = product;
        const imageUrl = product.image || '/images/placeholder.svg';
        
        return `
            <div class="detail-hero">
                <img class="detail-image" src="${imageUrl}" alt="${product.title}" onerror="this.src='/images/placeholder.svg'">
                <div class="detail-info">
                    <h1>${product.title}</h1>
                    <div class="detail-tags">
                        ${product.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <p class="detail-desc">${product.description || 'No description'}</p>
                    <div class="detail-prices">
                        <span class="detail-ref-price">Reference: ${product.referencePrice != null ? `€${product.referencePrice.toFixed(2)}` : 'N/A'}</span>
                        ${product.lowestPrice != null ? `
                            <span class="detail-lowest-price">€${product.lowestPrice.toFixed(2)}</span>
                            ${product.priceDelta != null ? `
                                <span class="price-delta ${product.priceDelta < 0 ? 'negative' : 'positive'}">
                                    ${product.priceDelta < 0 ? '' : '+'}${product.priceDelta.toFixed(1)}%
                                </span>
                            ` : ''}
                        ` : '<span class="detail-lowest-price">No price data</span>'}
                    </div>
                </div>
                <div class="detail-buy-buttons">
                    ${(product.sources || []).filter(s => s.lastPrice != null).map(source => `
                        <a href="${source.url}" target="_blank" class="btn btn-primary buy-btn">
                            ${source.siteName} - €${source.lastPrice.toFixed(2)}
                        </a>
                    `).join('')}
                </div>
            </div>

            <div class="scraper-section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2>Price Sources</h2>
                    <button class="btn btn-secondary" onclick="App.showAddSourceForm('${product._id}')">+ Add Source</button>
                </div>
                
                <div id="addSourceForm" style="display: none; margin-bottom: 20px; padding: 16px; background: var(--bg-secondary); border-radius: 12px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr 120px 100px; gap: 12px; align-items: end;">
                        <div class="form-group" style="margin: 0;">
                            <label>URL</label>
                            <input type="url" id="newSourceUrl" placeholder="https://..." />
                        </div>
                        <div class="form-group" style="margin: 0;">
                            <label>CSS Selector</label>
                            <input type="text" id="newSourceSelector" placeholder=".price-class" />
                        </div>
                        <div class="form-group" style="margin: 0;">
                            <label>Site Name</label>
                            <input type="text" id="newSourceName" placeholder="Amazon" />
                        </div>
                        <button class="btn btn-primary" onclick="App.addSource('${product._id}')">Add</button>
                    </div>
                    <div style="margin-top: 8px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="newSourcePuppeteer" />
                            <span style="font-size: 0.875rem;">Use Puppeteer (for dynamic sites)</span>
                        </label>
                    </div>
                </div>
                
                <div class="source-list">
                    ${!product.sources || product.sources.length === 0 ? `
                        <div class="empty-state" style="padding: 32px;">
                            <p>No sources added yet. Add a source to start tracking prices.</p>
                        </div>
                    ` : product.sources.map((source, index) => `
                        <div class="source-row">
                            <div>
                                <strong>${source.siteName}</strong>
                                <div class="source-url" title="${source.url}">${source.url}</div>
                            </div>
                            <code class="source-selector">${source.cssSelector}</code>
                            <span class="source-price">
                                ${source.lastPrice != null ? `€${source.lastPrice.toFixed(2)}` : '—'}
                            </span>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-secondary scrape-btn" onclick="App.scrapeSource('${product._id}', ${index}, this)">
                                    Scrape Now
                                </button>
                                <button class="btn btn-ghost" onclick="App.removeSource('${product._id}', ${index})" title="Remove" style="color: var(--danger);">
                                    ×
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="chart-section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2>Price History</h2>
                    <div class="timeframe-btns">
                        <button class="tf-btn" data-range="1" onclick="ProductDetail.updateChart(1)">1D</button>
                        <button class="tf-btn" data-range="5" onclick="ProductDetail.updateChart(5)">5D</button>
                        <button class="tf-btn active" data-range="30" onclick="ProductDetail.updateChart(30)">1M</button>
                        <button class="tf-btn" data-range="180" onclick="ProductDetail.updateChart(180)">6M</button>
                        <button class="tf-btn" data-range="365" onclick="ProductDetail.updateChart(365)">1Y</button>
                    </div>
                </div>
                <div style="position: relative; height: 300px;">
                    <canvas id="productChart"></canvas>
                </div>
            </div>

            <div style="margin-top: 24px; display: flex; gap: 12px;">
                <button class="btn btn-secondary" onclick="App.editProduct('${product._id}')">Edit Product</button>
                <button class="btn btn-danger" onclick="App.deleteProduct('${product._id}')">Delete Product</button>
            </div>
        `;
    },

    initChart(product, days = 30) {
        const ctx = document.getElementById('productChart');
        if (!ctx) return;

        if (this.chart) {
            this.chart.destroy();
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const filteredHistory = product.priceHistory
            .filter(h => new Date(h.date) >= cutoffDate)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const sourceNames = product.sources.map(s => s.siteName);
        const colors = ['#0071e3', '#34c759', '#ff9500', '#ff3b30', '#5856d6', '#00c7be'];

        const datasets = sourceNames.map((name, index) => {
            const data = filteredHistory.map(h => {
                const priceEntry = h.prices.find(p => p.sourceIndex === index);
                return priceEntry ? priceEntry.price : null;
            });

            return {
                label: name,
                data,
                borderColor: colors[index % colors.length],
                backgroundColor: colors[index % colors.length] + '20',
                borderWidth: 2,
                fill: false,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                spanGaps: true
            };
        });

        datasets.push({
            label: 'Reference Price',
            data: filteredHistory.map(() => product.referencePrice),
            borderColor: '#86868b',
            borderWidth: 1,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0
        });

        const labels = filteredHistory.map(h => {
            const date = new Date(h.date);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        this.chart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 14 },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: (context) => {
                                if (context.raw == null) return null;
                                return `${context.dataset.label}: €${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: (value) => '€' + value.toFixed(0)
                        }
                    }
                }
            }
        });
    },

    updateChart(days) {
        document.querySelectorAll('.chart-section .tf-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.range) === days);
        });

        if (this.currentProduct) {
            this.initChart(this.currentProduct, days);
        }
    }
};
