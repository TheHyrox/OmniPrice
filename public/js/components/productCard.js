const ProductCard = {
    render(product, viewMode = 'card') {
        const lowestPrice = product.lowestPrice;
        const delta = product.priceDelta;
        const deltaClass = delta < 0 ? 'negative' : 'positive';
        const deltaSign = delta < 0 ? '' : '+';
        
        const imageUrl = product.image || '/images/placeholder.svg';
        const lowestSource = product.lowestPriceSource;
        
        if (viewMode === 'list') {
            return `
                <article class="product-card" data-id="${product._id}">
                    <img class="product-card-image" src="${imageUrl}" alt="${product.title}" onerror="this.src='/images/placeholder.svg'">
                    <div class="product-card-body">
                        <div class="product-card-info">
                            <h3 class="product-card-title">${product.title}</h3>
                            <p class="product-card-desc">${product.description || ''}</p>
                            <div class="product-card-tags">
                                ${product.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                            </div>
                        </div>
                        <div class="product-card-prices">
                            <span class="price-ref">Ref: ${product.referencePrice != null ? `€${product.referencePrice.toFixed(2)}` : 'N/A'}</span>
                            ${lowestPrice != null ? `
                                <span class="price-lowest">€${lowestPrice.toFixed(2)}</span>
                                ${delta != null ? `<span class="price-delta ${deltaClass}">${deltaSign}${delta.toFixed(1)}%</span>` : ''}
                            ` : '<span class="price-lowest">No price</span>'}
                        </div>
                        ${lowestSource ? `
                            <a href="${lowestSource.url}" target="_blank" class="btn btn-primary product-card-action" onclick="event.stopPropagation()">
                                Buy at ${lowestSource.siteName}
                            </a>
                        ` : ''}
                    </div>
                </article>
            `;
        }

        return `
            <article class="product-card" data-id="${product._id}">
                <img class="product-card-image" src="${imageUrl}" alt="${product.title}" onerror="this.src='/images/placeholder.svg'">
                <div class="product-card-body">
                    <h3 class="product-card-title">${product.title}</h3>
                    <p class="product-card-desc">${product.description || ''}</p>
                    <div class="product-card-tags">
                        ${product.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <div class="product-card-prices">
                        <div>
                            <span class="price-ref">Ref: ${product.referencePrice != null ? `€${product.referencePrice.toFixed(2)}` : 'N/A'}</span>
                            ${lowestPrice != null ? `
                                <br><span class="price-lowest">€${lowestPrice.toFixed(2)}</span>
                            ` : '<br><span class="price-lowest">No price</span>'}
                        </div>
                        ${delta != null ? `<span class="price-delta ${deltaClass}">${deltaSign}${delta.toFixed(1)}%</span>` : ''}
                    </div>
                    ${lowestSource ? `
                        <a href="${lowestSource.url}" target="_blank" class="btn btn-primary product-card-action" onclick="event.stopPropagation()">
                            Buy at ${lowestSource.siteName}
                        </a>
                    ` : ''}
                </div>
            </article>
        `;
    },

    renderEmpty() {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <h3>No products yet</h3>
                <p>Add your first product to start tracking prices</p>
            </div>
        `;
    },

    renderLoading() {
        return `<div class="loading">Loading products</div>`;
    }
};
