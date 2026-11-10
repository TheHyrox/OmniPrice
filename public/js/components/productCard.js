const ProductCard = {
    sanitizePrice(price, refPrice) {
        if (price == null || isNaN(price) || price <= 0) return null;
        let p = Number(price);
        if (refPrice && refPrice > 0) {
            if (p > refPrice * 20 && (p / 100) <= refPrice * 2.5) {
                p = p / 100;
            } else if (p > refPrice * 20 && (p / 1000) <= refPrice * 2.5) {
                p = p / 1000;
            } else if (p > refPrice * 10) {
                return null;
            }
        }
        return p;
    },

    isAtAllTimeLow(product) {
        if (!product.lowestPrice) return false;
        const currentClean = this.sanitizePrice(product.lowestPrice, product.referencePrice);
        if (currentClean == null) return false;

        // O(1) fast-path when minPriceEver is cached on product
        if (product.minPriceEver != null && product.minPriceEver > 0) {
            const cleanMin = this.sanitizePrice(product.minPriceEver, product.referencePrice);
            if (cleanMin != null) {
                return currentClean <= cleanMin * 1.005;
            }
        }

        // Fallback for when full priceHistory is populated
        if (product.priceHistory && product.priceHistory.length > 0) {
            let minEver = Infinity;
            product.priceHistory.forEach(h => {
                (h.prices || []).forEach(p => {
                    const clean = this.sanitizePrice(p.price, product.referencePrice);
                    if (clean != null && clean < minEver) {
                        minEver = clean;
                    }
                });
            });
            if (minEver === Infinity) return false;
            return currentClean <= minEver * 1.005;
        }

        return false;
    },

    render(product, viewMode = 'card') {
        const id = escapeHtml(product._id);
        const title = escapeHtml(product.title);
        const desc = escapeHtml(product.description || '');
        const imageUrl = escapeHtml(product.image || '/images/placeholder.svg');
        const lowestSource = product.lowestPriceSource;
        const sourcesCount = (product.sources || []).length;
        const tags = product.tags || [];

        const cleanLowest = this.sanitizePrice(product.lowestPrice, product.referencePrice);
        const isATL = this.isAtAllTimeLow(product);
        const isActive = product.active !== false;
        const isArchived = Boolean(product.archived);
        const delta = product.priceDelta;
        const deltaClass = delta < 0 ? 'negative' : 'positive';
        const deltaSign = delta < 0 ? '' : '+';

        let savingsAmount = null;
        if (product.referencePrice && cleanLowest != null && cleanLowest < product.referencePrice) {
            savingsAmount = product.referencePrice - cleanLowest;
        }

        const kpi = window.App?.settings?.kpiVisibility || {};
        const showDealScore = kpi.showDealScoreBadge !== false;
        let dealScoreBadge = '';
        if (showDealScore && typeof window !== 'undefined' && window.Analytics && !isArchived && cleanLowest != null) {
            const scoreData = window.Analytics.calculateDealScore(product, 90);
            if (scoreData && scoreData.available) {
                dealScoreBadge = `<span class="card-badge deal-badge ${scoreData.rating.badgeClass}" title="${scoreData.rating.badgeText} (${scoreData.dealScore}/100) — ${scoreData.rating.adviceText}">${scoreData.rating.emoji} ${scoreData.dealScore}</span>`;
            }
        }

        // List View Variant
        if (viewMode === 'list') {
            return `
                <article class="product-card list-card ${!isActive ? 'is-paused' : ''} ${isArchived ? 'is-archived' : ''}" data-id="${id}">
                    <div class="list-card-media">
                        <img class="product-card-image" src="${imageUrl}" alt="${title}" onerror="this.src='/images/placeholder.svg'">
                        ${isArchived ? `<span class="card-badge archived">Archived</span>` : (!isActive ? `<span class="card-badge paused">Paused</span>` : '')}
                        ${dealScoreBadge}
                        ${isATL && !isArchived ? `<span class="card-badge atl">Record low</span>` : ''}
                    </div>

                    <div class="product-card-body list-card-body">
                        <div class="product-card-info">
                            <div class="card-header-tags">
                                ${tags.map(t => `<span class="tag" onclick="event.stopPropagation(); App.filterByTag('${escapeHtml(t)}')">#${escapeHtml(t)}</span>`).join('')}
                                <span class="tag-store-count">${sourcesCount} store${sourcesCount !== 1 ? 's' : ''}</span>
                            </div>
                            <h3 class="product-card-title">${title}</h3>
                            ${desc ? `<p class="product-card-desc">${desc}</p>` : ''}
                        </div>

                        <div class="product-card-prices list-prices">
                            <div class="price-main-row">
                                <span class="price-lowest">${cleanLowest != null ? formatCurrency(cleanLowest) : 'No price'}</span>
                                ${delta != null ? `<span class="price-delta ${deltaClass}">${deltaSign}${delta.toFixed(1)}%</span>` : ''}
                            </div>
                            <div class="price-sub-row">
                                ${product.referencePrice != null ? `<span class="price-ref">Ref: ${formatCurrency(product.referencePrice)}</span>` : ''}
                                ${savingsAmount ? `<span class="price-savings">Save ${formatCurrency(savingsAmount)}</span>` : ''}
                            </div>
                            ${lowestSource ? `<span class="price-store-label">at ${escapeHtml(lowestSource.siteName)}</span>` : ''}
                        </div>

                        <div class="list-card-actions" onclick="event.stopPropagation()">
                            ${isArchived ? `
                                <button class="btn btn-secondary btn-sm" onclick="App.toggleProductArchive('${id}', true)" title="Restore to active tracking">
                                    Restore
                                </button>
                                <button class="btn btn-ghost btn-sm" onclick="App.deleteProduct('${id}')" title="Delete permanently" style="color: var(--danger);">
                                    Delete
                                </button>
                            ` : `
                                <button class="btn btn-secondary btn-sm" onclick="App.toggleProductActive('${id}', ${isActive})" title="${isActive ? 'Pause price tracking' : 'Resume price tracking'}">
                                    ${isActive ? 'Pause' : 'Resume'}
                                </button>
                                <button class="btn btn-ghost btn-sm" onclick="App.toggleProductArchive('${id}', false)" title="Move to archive">
                                    Archive
                                </button>
                                ${lowestSource ? `
                                    <a href="${escapeHtml(lowestSource.url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm card-buy-btn">
                                        Buy ↗
                                    </a>
                                ` : ''}
                            `}
                            <button class="btn btn-ghost btn-sm" onclick="App.showProductDetail('${id}')">
                                Details →
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }

        // Grid Card Variant (Default)
        return `
            <article class="product-card grid-card ${!isActive ? 'is-paused' : ''} ${isArchived ? 'is-archived' : ''}" data-id="${id}">
                <div class="product-card-image-wrap">
                    <img class="product-card-image" src="${imageUrl}" alt="${title}" onerror="this.src='/images/placeholder.svg'">
                    <div class="card-badges-overlay">
                        ${isArchived ? `<span class="card-badge archived">Archived</span>` : (!isActive ? `<span class="card-badge paused">Paused</span>` : '')}
                        ${dealScoreBadge}
                        ${isATL && !isArchived ? `<span class="card-badge atl">Record low</span>` : ''}
                        ${delta != null && !isArchived ? `
                            <span class="card-badge delta ${deltaClass}">
                                ${deltaSign}${delta.toFixed(1)}%
                            </span>
                        ` : ''}
                        <span class="card-badge sources">${sourcesCount} store${sourcesCount !== 1 ? 's' : ''}</span>
                    </div>
                </div>

                <div class="product-card-body">
                    <div class="card-tags-row">
                        ${tags.slice(0, 3).map(t => `<span class="tag" onclick="event.stopPropagation(); App.filterByTag('${escapeHtml(t)}')">#${escapeHtml(t)}</span>`).join('')}
                    </div>

                    <h3 class="product-card-title" title="${title}">${title}</h3>
                    ${desc ? `<p class="product-card-desc">${desc}</p>` : ''}

                    <div class="product-card-prices">
                        <div class="price-block-left">
                            <span class="price-lowest">${cleanLowest != null ? formatCurrency(cleanLowest) : 'No price'}</span>
                            ${lowestSource ? `<span class="price-store-label">at ${escapeHtml(lowestSource.siteName)}</span>` : ''}
                        </div>
                        <div class="price-block-right">
                            ${product.referencePrice != null ? `<span class="price-ref">Ref: ${formatCurrency(product.referencePrice)}</span>` : ''}
                            ${savingsAmount ? `<span class="price-savings">Save ${formatCurrency(savingsAmount)}</span>` : ''}
                        </div>
                    </div>

                    <div class="product-card-footer" onclick="event.stopPropagation()">
                        ${isArchived ? `
                            <button class="btn btn-secondary btn-sm" onclick="App.toggleProductArchive('${id}', true)" title="Restore product">
                                Restore
                            </button>
                            <button class="btn btn-primary btn-sm card-view-btn" onclick="App.showProductDetail('${id}')">
                                Details →
                            </button>
                            <button class="btn btn-ghost btn-sm" onclick="App.deleteProduct('${id}')" title="Delete permanently" style="color: var(--danger);">
                                Delete
                            </button>
                        ` : `
                            <button class="btn btn-primary btn-sm card-view-btn" onclick="App.showProductDetail('${id}')">
                                View Details →
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="App.toggleProductActive('${id}', ${isActive})" title="${isActive ? 'Pause automatic price tracking' : 'Resume automatic price tracking'}">
                                ${isActive ? 'Pause' : 'Resume'}
                            </button>
                            <button class="btn btn-ghost btn-sm" onclick="App.toggleProductArchive('${id}', false)" title="Move to archive">
                                Archive
                            </button>
                            ${lowestSource ? `
                                <a href="${escapeHtml(lowestSource.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm card-buy-btn" title="Buy directly on ${escapeHtml(lowestSource.siteName)}">
                                    Buy ↗
                                </a>
                            ` : ''}
                        `}
                    </div>
                </div>
            </article>
        `;
    },

    renderArchivedEmpty() {
        return `
            <div class="empty-state products-empty-state">
                <div class="empty-state-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="21 8 21 21 3 21 3 8"></polyline>
                        <rect x="1" y="3" width="22" height="5"></rect>
                        <line x1="10" y1="12" x2="14" y2="12"></line>
                    </svg>
                </div>
                <h3>No archived products</h3>
                <p>When you no longer need active tracking for a product, you can archive it to keep your catalog clean without losing historical price data.</p>
                <button class="btn btn-secondary btn-sm" onclick="App.navigateToTab('products')" style="margin-top: 14px;">← Go to Active Products</button>
            </div>
        `;
    },

    renderEmpty() {
        return `
            <div class="empty-state products-empty-state">
                <div class="empty-state-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                </div>
                <h3>No products found</h3>
                <p>Try modifying your search or filters, or add a new product to start tracking prices.</p>
                <button class="btn btn-primary btn-sm" onclick="App.openModal()" style="margin-top: 14px;">+ Add Product</button>
            </div>
        `;
    },

    renderLoading() {
        return `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Loading products and price feeds...</p>
            </div>
        `;
    }
};

window.ProductCard = ProductCard;
