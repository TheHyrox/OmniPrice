const App = {
    products: [],
    currentView: 'card',
    currentSort: 'delta',
    filters: {
        search: '',
        priceMin: null,
        priceMax: null,
        tags: []
    },
    allTags: [],

    async init() {
        this.bindEvents();
        this.loadTheme();
        await this.loadProducts();
        this.setupChartTimeframes();
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

        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filters.search = e.target.value.toLowerCase();
            this.renderProducts();
        });

        document.getElementById('priceMin').addEventListener('input', (e) => {
            this.filters.priceMin = e.target.value ? parseFloat(e.target.value) : null;
            this.renderProducts();
        });
        document.getElementById('priceMax').addEventListener('input', (e) => {
            this.filters.priceMax = e.target.value ? parseFloat(e.target.value) : null;
            this.renderProducts();
        });

        document.getElementById('addProductBtn').addEventListener('click', () => this.openModal());
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelModal').addEventListener('click', () => this.closeModal());
        document.getElementById('productForm').addEventListener('submit', (e) => this.handleFormSubmit(e));

        document.getElementById('imageUrl').addEventListener('input', (e) => this.previewImageUrl(e.target.value));
        document.getElementById('imageFile').addEventListener('change', (e) => this.handleImageFile(e));

        document.getElementById('addSourceBtn').addEventListener('click', () => this.addSourceRow());

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

    navigateToTab(tabName) {

        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.tab === tabName);
        });

        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        if (tabName === 'charts' && this.products.length > 0) {
            setTimeout(() => Charts.init(this.products), 100);
        }
    },

    async loadProducts() {
        const grid = document.getElementById('productsGrid');
        grid.innerHTML = ProductCard.renderLoading();

        try {
            this.products = await API.products.getAll();
            this.updateTags();
            this.renderProducts();
        } catch (error) {
            grid.innerHTML = `<div class="empty-state"><p>Error loading products: ${error.message}</p></div>`;
        }
    },

    renderProducts() {
        const grid = document.getElementById('productsGrid');
        
        let filtered = this.products.filter(p => {
            if (this.filters.search) {
                const searchMatch = p.title.toLowerCase().includes(this.filters.search) ||
                    p.tags.some(t => t.toLowerCase().includes(this.filters.search));
                if (!searchMatch) return false;
            }
            
            const price = p.lowestPrice;
            if (this.filters.priceMin !== null && (price === null || price < this.filters.priceMin)) return false;
            if (this.filters.priceMax !== null && (price === null || price > this.filters.priceMax)) return false;
            if (this.filters.tags.length > 0) {
                if (!this.filters.tags.some(t => p.tags.includes(t))) return false;
            }
            
            return true;
        });

        filtered.sort((a, b) => {
            switch (this.currentSort) {
                case 'delta':
                    const deltaA = a.priceDelta ?? Infinity;
                    const deltaB = b.priceDelta ?? Infinity;
                    return deltaA - deltaB;
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

    updateTags() {
        const allTags = [...new Set(this.products.flatMap(p => p.tags))];
        this.allTags = allTags;
        
        const container = document.getElementById('tagFilters');
        container.innerHTML = allTags.map(tag => `
            <button class="tag-filter ${this.filters.tags.includes(tag) ? 'active' : ''}" data-tag="${tag}">
                ${tag}
            </button>
        `).join('');
        
        container.querySelectorAll('.tag-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag;
                const index = this.filters.tags.indexOf(tag);
                if (index >= 0) {
                    this.filters.tags.splice(index, 1);
                } else {
                    this.filters.tags.push(tag);
                }
                btn.classList.toggle('active');
                this.renderProducts();
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
        document.getElementById('imagePreview').innerHTML = '<span class="placeholder">No image</span>';
        document.getElementById('sourcesContainer').innerHTML = '';
    },

    populateForm(product) {
        document.getElementById('productId').value = product._id;
        document.getElementById('productTitle').value = product.title;
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productRefPrice').value = product.referencePrice;
        document.getElementById('productTags').value = product.tags.join(', ');
        
        if (product.image) {
            document.getElementById('imagePreview').innerHTML = `<img src="${product.image}" alt="Preview">`;
            document.getElementById('imageUrl').value = product.image;
        }
        
        const container = document.getElementById('sourcesContainer');
        container.innerHTML = product.sources.map((s, i) => this.sourceRowHTML(s)).join('');
    },

    sourceRowHTML(source = {}) {
        return `
            <div class="source-item">
                <input type="url" placeholder="URL" value="${source.url || ''}" class="source-url-input" />
                <input type="text" placeholder="CSS Selector" value="${source.cssSelector || ''}" class="source-selector-input" />
                <input type="text" placeholder="Site Name" value="${source.siteName || ''}" class="source-name-input" />
                <button type="button" class="remove-source" onclick="this.closest('.source-item').remove()">×</button>
            </div>
        `;
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
        const data = {
            title: document.getElementById('productTitle').value,
            description: document.getElementById('productDescription').value,
            referencePrice: parseFloat(document.getElementById('productRefPrice').value),
            tags: document.getElementById('productTags').value.split(',').map(t => t.trim()).filter(t => t),
            image: document.getElementById('imageUrl').value || null,
            sources: []
        };

        document.querySelectorAll('.source-item').forEach(item => {
            const url = item.querySelector('.source-url-input').value;
            const cssSelector = item.querySelector('.source-selector-input').value;
            const siteName = item.querySelector('.source-name-input').value;
            
            if (url && cssSelector && siteName) {
                data.sources.push({ url, cssSelector, siteName, usePuppeteer: false });
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
        const url = document.getElementById('newSourceUrl').value;
        const cssSelector = document.getElementById('newSourceSelector').value;
        const siteName = document.getElementById('newSourceName').value;
        const usePuppeteer = document.getElementById('newSourcePuppeteer').checked;

        if (!url || !cssSelector || !siteName) {
            alert('Please fill in all fields');
            return;
        }

        try {
            const product = await API.products.getById(productId);
            product.sources.push({ url, cssSelector, siteName, usePuppeteer });
            await API.products.update(productId, product);
            await this.showProductDetail(productId);
        } catch (error) {
            alert('Error adding source: ' + error.message);
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
        btn.disabled = true;
        btn.textContent = 'Scraping...';

        try {
            await API.scraper.scrapeSource(productId, sourceIndex);
            await this.showProductDetail(productId);
        } catch (error) {
            alert('Scrape failed: ' + error.message);
            btn.disabled = false;
            btn.textContent = 'Scrape Now';
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

    setupChartTimeframes() {
        document.querySelectorAll('#charts-tab .tf-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                Charts.updateTimeframe(parseInt(btn.dataset.range));
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
