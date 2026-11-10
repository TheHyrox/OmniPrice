/**
 * OmniPrice - Application Entry Point & Orchestrator
 * Coordinates controllers, theme preferences, client-side routing, and global events.
 */
const App = {
    previousTab: 'products',

    // Getters for controller states
    get products() { return ProductsController.products; },
    set products(val) { ProductsController.products = val; },

    get stores() { return StoresController.stores; },
    set stores(val) { StoresController.stores = val; },

    get alerts() { return AlertsController.alerts; },
    set alerts(val) { AlertsController.alerts = val; },

    get settings() { return SettingsController.settings; },
    set settings(val) { SettingsController.settings = val; },

    get filters() { return ProductsController.filters; },
    get currentSort() { return ProductsController.currentSort; },
    set currentSort(val) { ProductsController.currentSort = val; },

    async init() {
        this.loadTheme();
        this.bindEvents();

        // Load settings first to establish active currency & preferences
        await SettingsController.loadSettings();

        // Load initial core data
        await Promise.all([
            ProductsController.loadProducts(),
            StoresController.loadStores()
        ]);

        SettingsController.initServiceWorkerAndPush();

        // Initialize Router to handle deep linking and browser history
        Router.init();
    },

    bindEvents() {
        // Navigation links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = link.dataset.tab;
                this.navigateToTab(tab);
            });
        });

        // Theme Toggles
        document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());
        document.querySelectorAll('.theme-opt').forEach(btn => {
            btn.addEventListener('click', () => this.setTheme(btn.dataset.theme));
        });

        // View Mode (Grid / List)
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setView(btn.dataset.view));
        });

        // Products Sort Select
        document.getElementById('sortSelect')?.addEventListener('change', (e) => {
            ProductsController.currentSort = e.target.value;
            ProductsController.renderProducts();
        });

        // Search Input
        const searchInput = document.getElementById('searchInput');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                ProductsController.filters.search = e.target.value.toLowerCase().trim();
                if (clearSearchBtn) clearSearchBtn.style.display = e.target.value ? 'block' : 'none';
                ProductsController.renderProducts();
            });
            if (clearSearchBtn) {
                clearSearchBtn.addEventListener('click', () => {
                    searchInput.value = '';
                    ProductsController.filters.search = '';
                    clearSearchBtn.style.display = 'none';
                    ProductsController.renderProducts();
                });
            }
        }

        // Quick Filters
        document.querySelectorAll('.quick-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filter = btn.dataset.filter;
                ProductsController.filters.onlyATL = (filter === 'atl');
                ProductsController.filters.onlyDeals = (filter === 'deals');
                ProductsController.filters.status = (filter === 'active' || filter === 'paused') ? filter : 'all';
                ProductsController.renderProducts();
            });
        });

        // Product Modal Handlers
        document.getElementById('addProductBtn')?.addEventListener('click', () => this.openModal());
        document.getElementById('closeModal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('cancelModal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('productForm')?.addEventListener('submit', (e) => ProductsController.handleFormSubmit(e));
        document.getElementById('imageUrl')?.addEventListener('input', (e) => ProductsController.previewImageUrl(e.target.value));
        document.getElementById('imageFile')?.addEventListener('change', (e) => ProductsController.handleImageFile(e));
        document.getElementById('addSourceBtn')?.addEventListener('click', () => ProductsController.addSourceRow());
        document.getElementById('toggleAllSourcesBtn')?.addEventListener('click', () => ProductsController.toggleAllSources());

        const tagsInput = document.getElementById('productTags');
        if (tagsInput) {
            tagsInput.addEventListener('input', () => ProductsController.updateModalTagSuggestions());
            tagsInput.addEventListener('focus', () => ProductsController.renderModalTagSuggestions());
        }

        // Auto-Fill Metadata Discovery
        document.getElementById('autodiscoverBtn')?.addEventListener('click', () => ProductsController.handleAutoDiscover());
        document.getElementById('autodiscoverUrlInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                ProductsController.handleAutoDiscover();
            }
        });

        // Store Modal Handlers
        document.getElementById('addStoreBtn')?.addEventListener('click', () => StoresController.openStoreModal());
        document.getElementById('closeStoreModal')?.addEventListener('click', () => StoresController.closeStoreModal());
        document.getElementById('cancelStoreModal')?.addEventListener('click', () => StoresController.closeStoreModal());
        document.getElementById('storeForm')?.addEventListener('submit', (e) => StoresController.handleStoreFormSubmit(e));
        document.getElementById('addStoreSelectorRowBtn')?.addEventListener('click', () => StoresController.addSelectorRow());
        document.getElementById('syncAllStoresBtn')?.addEventListener('click', () => StoresController.syncAllStores());

        // Alerts Modal Handlers
        document.getElementById('addAlertBtn')?.addEventListener('click', () => AlertsController.openAlertModal());
        document.getElementById('closeAlertModal')?.addEventListener('click', () => AlertsController.closeAlertModal());
        document.getElementById('cancelAlertModal')?.addEventListener('click', () => AlertsController.closeAlertModal());
        document.getElementById('alertForm')?.addEventListener('submit', (e) => AlertsController.handleAlertFormSubmit(e));
        document.getElementById('alertProductSelect')?.addEventListener('change', (e) => AlertsController.onAlertProductSelectChange(e));
        document.getElementById('alertTypeSelect')?.addEventListener('change', (e) => AlertsController.onAlertTypeSelectChange(e.target.value));
        document.getElementById('alertThresholdPercent')?.addEventListener('input', () => AlertsController.updateAlertPercentHint());

        // Bundles Handlers
        document.getElementById('createBundleBtn')?.addEventListener('click', () => BundlesController.openModal());
        document.getElementById('closeBundleModal')?.addEventListener('click', () => BundlesController.closeModal());
        document.getElementById('cancelBundleModal')?.addEventListener('click', () => BundlesController.closeModal());
        document.getElementById('bundleForm')?.addEventListener('submit', (e) => BundlesController.handleFormSubmit(e));
        document.getElementById('bundleSelectAllBtn')?.addEventListener('click', () => BundlesController.selectAllProducts());
        document.getElementById('bundleDeselectAllBtn')?.addEventListener('click', () => BundlesController.deselectAllProducts());
        document.getElementById('bundleProductSearch')?.addEventListener('input', (e) => {
            BundlesController.searchQuery = e.target.value;
            BundlesController.renderProductChecklist();
        });
        document.getElementById('backToBundles')?.addEventListener('click', () => this.navigateToTab('bundles'));
        document.getElementById('bundlesGrid')?.addEventListener('click', (e) => {
            const card = e.target.closest('.bundle-card');
            if (card && !e.target.closest('a') && !e.target.closest('button')) {
                BundlesController.showBundleDetail(card.dataset.id);
            }
        });

        // Settings Handlers
        document.getElementById('currencySetting')?.addEventListener('change', (e) => {
            SettingsController.handleCurrencyChange(e.target.value);
        });
        document.getElementById('scrapeFrequency')?.addEventListener('change', (e) => {
            SettingsController.handleFrequencyChange(e.target.value);
        });
        document.getElementById('scrapeAllBtn')?.addEventListener('click', () => ProductsController.scrapeAll());
        document.getElementById('saveDiscordBtn')?.addEventListener('click', () => SettingsController.saveDiscordSettings());
        document.getElementById('testDiscordBtn')?.addEventListener('click', () => SettingsController.testDiscordWebhook());
        document.getElementById('saveKpiVisibilityBtn')?.addEventListener('click', () => SettingsController.saveKpiVisibility());
        document.querySelectorAll('.kpi-visibility-group input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', () => SettingsController.saveKpiVisibility());
        });

        // Analytics & KPI Guide Modal Handlers
        const openKpiGuide = () => {
            const modal = document.getElementById('kpiGuideModal');
            if (modal) {
                modal.classList.add('active');
                const search = document.getElementById('kpiGuideSearch');
                if (search) {
                    search.value = '';
                    search.focus();
                }
                document.querySelectorAll('.kpi-guide-item').forEach(el => el.style.display = 'flex');
                document.querySelectorAll('.kpi-guide-section').forEach(el => el.style.display = 'flex');
            }
        };
        const closeKpiGuide = () => {
            const modal = document.getElementById('kpiGuideModal');
            if (modal) modal.classList.remove('active');
        };

        document.getElementById('openKpiGuideBtn')?.addEventListener('click', openKpiGuide);
        document.getElementById('openKpiGuideBottomBtn')?.addEventListener('click', openKpiGuide);
        document.getElementById('closeKpiGuideModal')?.addEventListener('click', closeKpiGuide);
        document.getElementById('dismissKpiGuideBtn')?.addEventListener('click', closeKpiGuide);

        // Guide Search Filter
        const guideSearch = document.getElementById('kpiGuideSearch');
        if (guideSearch) {
            guideSearch.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                document.querySelectorAll('.kpi-guide-item').forEach(item => {
                    const text = item.textContent.toLowerCase();
                    const matches = text.includes(query);
                    item.style.display = matches ? 'flex' : 'none';
                });
                document.querySelectorAll('.kpi-guide-section').forEach(sec => {
                    const visibleItems = sec.querySelectorAll('.kpi-guide-item:not([style*="display: none"])');
                    sec.style.display = visibleItems.length > 0 ? 'flex' : 'none';
                });
            });
        }
        document.getElementById('enablePushBtn')?.addEventListener('click', () => SettingsController.subscribeToPush());
        document.getElementById('testPushBtn')?.addEventListener('click', () => SettingsController.sendTestPush());

        // Backup & Restore Handlers
        document.getElementById('downloadBackupBtn')?.addEventListener('click', () => SettingsController.downloadBackup());
        document.getElementById('selectRestoreFileBtn')?.addEventListener('click', () => {
            document.getElementById('restoreFileInput')?.click();
        });
        document.getElementById('restoreFileInput')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) SettingsController.handleRestoreFile(file);
        });

        // Card click navigation
        document.getElementById('productsGrid')?.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (card && !e.target.closest('a') && !e.target.closest('button')) {
                this.showProductDetail(card.dataset.id);
            }
        });

        // Archived card click navigation
        document.getElementById('archivedProductsGrid')?.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (card && !e.target.closest('a') && !e.target.closest('button')) {
                this.showProductDetail(card.dataset.id);
            }
        });

        // Back to active products button from archive
        document.getElementById('backToActiveProductsBtn')?.addEventListener('click', () => {
            this.navigateToTab('products');
        });

        // Header button side to Add Product to open Archive section
        document.getElementById('viewArchiveHeaderBtn')?.addEventListener('click', () => {
            this.navigateToTab('archive');
        });

        // Quick filter Archive button navigation
        document.getElementById('viewArchiveQuickBtn')?.addEventListener('click', () => {
            this.navigateToTab('archive');
        });

        // Alert Detail back button navigation
        document.getElementById('backToAlerts')?.addEventListener('click', () => {
            this.navigateToTab('alerts');
        });

        // Product Detail back button navigation
        document.getElementById('backToProducts')?.addEventListener('click', () => {
            this.backToPreviousTab();
        });

        // Close modals on backdrop click or Escape key
        window.addEventListener('click', (e) => {
            if (e.target.classList && e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
            }
        });
    },

    navigateToTab(tabName, updateRoute = true) {
        if (tabName !== 'product-detail' && tabName !== 'bundle-detail' && tabName !== 'alert-detail') {
            this.previousTab = tabName;
        }

        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.tab === tabName);
        });

        const activeContent = document.getElementById(`${tabName}-tab`);
        if (activeContent) {
            activeContent.classList.add('active');
        }

        if (tabName === 'charts' && window.Charts) {
            const prods = (ProductsController.products && ProductsController.products.length > 0)
                ? ProductsController.products
                : (this.products || []);

            if (prods.length > 0) {
                Charts.init(prods);
            } else {
                API.getProducts({ includeHistory: true }).then(productsWithHistory => {
                    this.chartsProductsWithHistory = productsWithHistory;
                    Charts.init(productsWithHistory);
                }).catch(() => {
                    Charts.init([]);
                });
            }
        } else if (tabName === 'alerts') {
            AlertsController.loadAlerts();
        } else if (tabName === 'bundles') {
            BundlesController.loadBundles();
        } else if (tabName === 'stores') {
            StoresController.loadStores();
        } else if (tabName === 'settings') {
            SettingsController.loadSettings();
        } else if (tabName === 'archive') {
            ProductsController.renderArchivedProducts();
        }

        if (updateRoute && window.Router) {
            Router.navigate(tabName, true);
        }
    },

    backToPreviousTab() {
        this.navigateToTab(this.previousTab || 'products');
    },

    // ─── Theme Management ──────────────────────────────────────────────────

    loadTheme() {
        const saved = localStorage.getItem('omniprice_theme') || 'light';
        this.setTheme(saved);
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('omniprice_theme', theme);
        document.querySelectorAll('.theme-opt').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'light' ? 'dark' : 'light';
        this.setTheme(next);
    },

    setupChartTimeframes() {
        // Timeframe button events are managed by Charts.bindEvents()
    },

    // ─── Facade Delegations for Controller Operations ──────────────────────

    // Products Controller delegations
    loadProducts: () => ProductsController.loadProducts(),
    renderProducts: () => ProductsController.renderProducts(),
    renderProductsKpis: () => ProductsController.renderProductsKpis(),
    filterByTag: (tag) => ProductsController.filterByTag(tag),
    setView: (view) => ProductsController.setView(view),
    openModal: (product) => ProductsController.openModal(product),
    closeModal: () => ProductsController.closeModal(),
    toggleModalTag: (tag) => ProductsController.toggleModalTag(tag),
    addSourceRow: (source, index) => ProductsController.addSourceRow(source, index),
    removeSourceItem: (btn, e) => ProductsController.removeSourceItem(btn, e),
    toggleSourceItem: (header, e) => ProductsController.toggleSourceItem(header, e),
    toggleAllSources: () => ProductsController.toggleAllSources(),
    onSourceUrlInput: (input) => ProductsController.onSourceUrlInput(input),
    onSourceNameInput: (input) => ProductsController.onSourceNameInput(input),
    onSourceSelectorInput: (input) => ProductsController.onSourceSelectorInput(input),
    onSourcePresetSelectChange: (select) => ProductsController.onSourcePresetSelectChange(select),
    testSourceSelector: (btn) => ProductsController.testSourceSelector(btn),
    testNewSourceSelector: () => ProductsController.testNewSourceSelector(),
    showProductDetail: (id, updateRoute) => ProductsController.showProductDetail(id, updateRoute),
    showAddSourceForm: (id) => ProductsController.showAddSourceForm(id),
    addSource: (id) => ProductsController.addSource(id),
    removeSource: (id, idx) => ProductsController.removeSource(id, idx),
    scrapeSource: (id, idx, btn) => ProductsController.scrapeSource(id, idx, btn),
    scrapeProductAll: (id, btn) => ProductsController.scrapeProductAll(id, btn),
    editProduct: (id) => ProductsController.editProduct(id),
    deleteProduct: (id) => ProductsController.deleteProduct(id),
    toggleProductActive: (id, currentActive) => ProductsController.toggleProductActive(id, currentActive),
    toggleProductArchive: (id, currentArchived) => ProductsController.toggleProductArchive(id, currentArchived),
    renderArchivedProducts: () => ProductsController.renderArchivedProducts(),
    scrapeAll: () => ProductsController.scrapeAll(),

    // Stores Controller delegations
    openStoreModal: (id) => StoresController.openStoreModal(id),
    closeStoreModal: () => StoresController.closeStoreModal(),
    deleteStore: (id) => StoresController.deleteStore(id),
    syncAllStores: () => StoresController.syncAllStores(),

    // Alerts Controller delegations
    openAlertModal: (alert) => AlertsController.openAlertModal(alert),
    closeAlertModal: () => AlertsController.closeAlertModal(),
    toggleAlert: (id, currentActive) => AlertsController.toggleAlert(id, currentActive),
    deleteAlert: (id) => AlertsController.deleteAlert(id),
    triggerTestAlert: (id) => AlertsController.triggerTestAlert(id),
    showAlertDetail: (id, updateRoute) => AlertsController.showAlertDetail(id, updateRoute),

    // Bundles Controller delegations
    openBundleModal: (id) => BundlesController.openModal(id),
    closeBundleModal: () => BundlesController.closeModal(),
    showBundleDetail: (id, updateRoute) => BundlesController.showBundleDetail(id, updateRoute),
    deleteBundle: (id) => BundlesController.deleteBundle(id),

    // Settings Controller delegations
    saveDiscordSettings: () => SettingsController.saveDiscordSettings(),
    testDiscordWebhook: () => SettingsController.testDiscordWebhook(),
    saveKpiVisibility: () => SettingsController.saveKpiVisibility(),
    downloadBackup: () => SettingsController.downloadBackup(),
    subscribeToPush: () => SettingsController.subscribeToPush(),
    sendTestPush: () => SettingsController.sendTestPush()
};

window.App = App;

// Bootstrap application on DOM load
document.addEventListener('DOMContentLoaded', () => App.init());
