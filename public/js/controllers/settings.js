/**
 * OmniPrice - Settings Controller
 * Manages currency preferences, Discord webhook integration, Web Push, and backup/restore.
 */
const SettingsController = {
    settings: {},

    async loadSettings() {
        try {
            this.settings = await API.getSettings();
            if (window.App) window.App.settings = this.settings;

            // Apply active currency
            if (this.settings.currency) {
                Utils.setAppCurrency(this.settings.currency);
                const currSelect = document.getElementById('currencySetting');
                if (currSelect) currSelect.value = this.settings.currency;
            }

            const freqSelect = document.getElementById('scrapeFrequency');
            if (freqSelect && this.settings.scrapeFrequency !== undefined) {
                freqSelect.value = this.settings.scrapeFrequency;
            }

            const webhookInput = document.getElementById('discordWebhookUrl');
            if (webhookInput && this.settings.discordWebhookUrl) {
                webhookInput.value = this.settings.discordWebhookUrl;
            }

            // Populate KPI visibility checkboxes
            const kpi = this.settings.kpiVisibility || {};
            const setCheck = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.checked = (val !== false);
            };
            setCheck('kpiShowTracked', kpi.showTrackedKpi);
            setCheck('kpiShowRecordLows', kpi.showRecordLowsKpi);
            setCheck('kpiShowTotalSavings', kpi.showTotalSavingsKpi);
            setCheck('kpiShowStoreFeeds', kpi.showStoreFeedsKpi);
            setCheck('kpiShowDealScoreBadge', kpi.showDealScoreBadge);
            setCheck('kpiShowBuyAdvice', kpi.showBuyAdvice);
            setCheck('kpiShowStoreVolatility', kpi.showStoreVolatility);
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    },

    async handleCurrencyChange(currencyCode) {
        if (!currencyCode) return;
        try {
            Utils.setAppCurrency(currencyCode);
            await API.updateSettings({ currency: currencyCode });
            Toast.success(`Currency changed to ${currencyCode} (${Utils.getCurrencySymbol()})`);

            // Re-render UI views to reflect currency change
            if (window.App) {
                if (typeof window.App.renderProducts === 'function') window.App.renderProducts();
                if (typeof window.App.renderProductsKpis === 'function') window.App.renderProductsKpis();
                if (typeof window.AlertsController?.renderAlerts === 'function') window.AlertsController.renderAlerts();
                if (window.ProductDetail?.currentProduct) {
                    window.ProductDetail.render(window.ProductDetail.currentProduct);
                }
                if (window.Charts && window.Charts.products && window.Charts.products.length > 0) {
                    window.Charts.init(window.Charts.products);
                }
            }
        } catch (error) {
            Toast.error('Failed to save currency setting: ' + error.message);
        }
    },

    async handleFrequencyChange(val) {
        const freq = parseInt(val, 10);
        try {
            await API.updateSettings({ scrapeFrequency: freq });
            Toast.success('Scraping frequency updated');
        } catch (error) {
            Toast.error('Failed to update scraping frequency: ' + error.message);
        }
    },

    async saveDiscordSettings() {
        const webhookUrl = document.getElementById('discordWebhookUrl').value.trim();
        const btn = document.getElementById('saveDiscordBtn');
        const originalText = btn ? btn.textContent : '';

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving...';
        }

        try {
            await API.updateSettings({ discordWebhookUrl: webhookUrl });
            Toast.success('Discord webhook saved successfully!');
        } catch (error) {
            Toast.error('Failed to save Discord settings: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    },

    async saveKpiVisibility({ quiet = false } = {}) {
        const btn = document.getElementById('saveKpiVisibilityBtn');
        const originalText = btn ? btn.textContent : '';

        if (btn && !quiet) {
            btn.disabled = true;
            btn.textContent = 'Saving...';
        }

        const getCheck = (id) => {
            const el = document.getElementById(id);
            return el ? el.checked : true;
        };

        const kpiVisibility = {
            showTrackedKpi: getCheck('kpiShowTracked'),
            showRecordLowsKpi: getCheck('kpiShowRecordLows'),
            showTotalSavingsKpi: getCheck('kpiShowTotalSavings'),
            showStoreFeedsKpi: getCheck('kpiShowStoreFeeds'),
            showDealScoreBadge: getCheck('kpiShowDealScoreBadge'),
            showBuyAdvice: getCheck('kpiShowBuyAdvice'),
            showStoreVolatility: getCheck('kpiShowStoreVolatility')
        };

        try {
            const updated = await API.updateSettings({ kpiVisibility });
            this.settings.kpiVisibility = updated.kpiVisibility || kpiVisibility;
            if (window.App) window.App.settings = this.settings;
            if (!quiet) Toast.success('Analytics & KPI visibility saved!');

            // Re-render affected views immediately
            if (window.ProductsController) {
                ProductsController.renderProductsKpis();
                ProductsController.renderProducts();
            }
            if (window.StoresController) {
                StoresController.renderStores();
            }
            if (window.ProductDetail?.currentProduct) {
                const content = document.getElementById('productDetailContent');
                if (content) content.innerHTML = ProductDetail.render(ProductDetail.currentProduct);
            }
        } catch (error) {
            if (!quiet) Toast.error('Failed to save KPI visibility preferences: ' + error.message);
        } finally {
            if (btn && !quiet) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    },

    async testDiscordWebhook() {
        const webhookUrl = document.getElementById('discordWebhookUrl').value.trim();
        const btn = document.getElementById('testDiscordBtn');
        const originalText = btn ? btn.textContent : '';

        if (!webhookUrl) {
            Toast.warning('Please enter a Discord Webhook URL first.');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Sending...';
        }

        try {
            Toast.info('Sending test notification to Discord...');
            const res = await API.testDiscordWebhook(webhookUrl);
            Toast.success(res.message || 'Test message sent to Discord successfully!');
        } catch (error) {
            Toast.error('Discord webhook test failed: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    },

    async downloadBackup() {
        const btn = document.getElementById('downloadBackupBtn');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Generating...';
        }

        try {
            Toast.info('Preparing database backup snapshot...');
            const res = await fetch('/api/settings/backup');
            if (!res.ok) throw new Error(`Backup export failed with status ${res.status}`);

            const blob = await res.blob();
            const disposition = res.headers.get('content-disposition');
            let filename = `omniprice-backup-${new Date().toISOString().slice(0, 10)}.json`;
            if (disposition && disposition.includes('filename=')) {
                const match = disposition.match(/filename="?([^";]+)"?/);
                if (match && match[1]) filename = match[1];
            }

            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);

            Toast.success(`Backup downloaded (${filename})`);
        } catch (error) {
            Toast.error('Failed to download backup: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    },

    async handleRestoreFile(file) {
        if (!file) return;

        const mode = document.querySelector('input[name="restoreMode"]:checked')?.value || 'replace';

        let text;
        let parsed;
        try {
            text = await file.text();
            parsed = JSON.parse(text);
        } catch (e) {
            if (text && text.trim().startsWith('<')) {
                Toast.error('Selected file contains HTML (webpage markup) instead of valid JSON data. It appears to have been saved from a webpage fallback. Please export a fresh backup from the server.');
            } else {
                Toast.error('Invalid JSON file. Please provide a valid OmniPrice backup.');
            }
            return;
        }

        const backupData = parsed.data || parsed;
        const counts = {
            products: backupData.products?.length || parsed.stats?.productsCount || 0,
            stores: backupData.stores?.length || parsed.stats?.storesCount || 0,
            alerts: backupData.alerts?.length || parsed.stats?.alertsCount || 0,
            bundles: backupData.bundles?.length || parsed.stats?.bundlesCount || 0,
            priceRecords: backupData.priceRecords?.length || backupData.price_records?.length || parsed.stats?.priceRecordsCount || 0
        };

        const countParts = [];
        if (counts.products) countParts.push(`${counts.products} product${counts.products > 1 ? 's' : ''}`);
        if (counts.stores) countParts.push(`${counts.stores} store${counts.stores > 1 ? 's' : ''}`);
        if (counts.alerts) countParts.push(`${counts.alerts} alert${counts.alerts > 1 ? 's' : ''}`);
        if (counts.bundles) countParts.push(`${counts.bundles} bundle${counts.bundles > 1 ? 's' : ''}`);
        if (counts.priceRecords) countParts.push(`${counts.priceRecords} price record${counts.priceRecords > 1 ? 's' : ''}`);
        const summary = countParts.join(', ') || '0 items';

        const isReplace = mode === 'replace';
        const confirmed = await Confirm.ask({
            title: isReplace ? 'Replace Entire Database?' : 'Merge Backup Data?',
            message: isReplace
                ? `WARNING: Replace mode will DELETE all current products, history, stores, alerts, and bundles, and replace them with the backup (${summary}). Are you sure?`
                : `Merge mode will upsert ${summary} without deleting existing data. Proceed?`,
            confirmText: isReplace ? 'Yes, Replace Everything' : 'Proceed with Merge',
            danger: isReplace
        });

        if (!confirmed) return;

        const btn = document.getElementById('selectRestoreFileBtn');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Restoring...';
        }

        try {
            Toast.info('Restoring backup data...');
            const res = await API.importBackup(parsed, mode);
            const restoredStats = res.restored;
            const successDetail = restoredStats
                ? ` (${restoredStats.products} products, ${restoredStats.stores} stores, ${restoredStats.alerts} alerts, ${restoredStats.bundles || 0} bundles)`
                : '';
            Toast.success((res.message || 'Database restored successfully!') + successDetail);

            // Reload application data
            if (window.App) {
                await window.App.loadProducts();
                await window.StoresController?.loadStores();
                await window.AlertsController?.loadAlerts();
                if (window.BundlesController?.loadBundles) {
                    await window.BundlesController.loadBundles();
                }
                await this.loadSettings();
            }
        } catch (error) {
            Toast.error('Database restore failed: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
            const fileInput = document.getElementById('restoreFileInput');
            if (fileInput) fileInput.value = '';
        }
    },

    async initServiceWorkerAndPush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            this.updatePushUI('unsupported');
            return;
        }

        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                this.updatePushUI('subscribed');
            } else if (Notification.permission === 'denied') {
                this.updatePushUI('blocked');
            } else {
                this.updatePushUI('prompt');
            }
        } catch (err) {
            console.warn('[Push] ServiceWorker registration error:', err.message);
            this.updatePushUI('error');
        }
    },

    updatePushUI(state) {
        const badge = document.getElementById('pushStatusBadge');
        const enableBtn = document.getElementById('enablePushBtn');
        const testBtn = document.getElementById('testPushBtn');

        if (!badge || !enableBtn) return;

        if (state === 'subscribed') {
            badge.textContent = 'Active';
            badge.style.background = 'rgba(16, 185, 129, 0.15)';
            badge.style.color = '#059669';
            enableBtn.textContent = 'Push Notifications Enabled';
            enableBtn.disabled = true;
            if (testBtn) testBtn.style.display = 'inline-block';
        } else if (state === 'blocked') {
            badge.textContent = 'Blocked in Browser';
            badge.style.background = 'rgba(239, 68, 68, 0.15)';
            badge.style.color = '#dc2626';
            enableBtn.textContent = 'Permission Blocked';
            enableBtn.disabled = true;
            if (testBtn) testBtn.style.display = 'none';
        } else if (state === 'unsupported') {
            badge.textContent = 'Not Supported';
            enableBtn.disabled = true;
            if (testBtn) testBtn.style.display = 'none';
        } else {
            badge.textContent = 'Disabled';
            enableBtn.textContent = 'Enable Web Push Notifications';
            enableBtn.disabled = false;
            if (testBtn) testBtn.style.display = 'none';
        }
    },

    async subscribeToPush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            Toast.warning('Web Push is not supported in this browser.');
            return;
        }

        try {
            const reg = await navigator.serviceWorker.ready;
            const keyRes = await API.getVapidPublicKey();
            if (!keyRes.publicKey) throw new Error('Server VAPID public key not found');

            const applicationServerKey = Utils.urlBase64ToUint8Array(keyRes.publicKey);
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            });

            await API.subscribeWebPush(subscription);
            this.updatePushUI('subscribed');
            Toast.success('Web Push notifications enabled!');
        } catch (err) {
            if (Notification.permission === 'denied') {
                this.updatePushUI('blocked');
                Toast.error('Push notification permission was denied in browser settings.');
            } else {
                Toast.error('Web Push subscription failed: ' + err.message);
            }
        }
    },

    async sendTestPush() {
        const btn = document.getElementById('testPushBtn');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Sending...';
        }

        try {
            Toast.info('Sending test push notification...');
            const res = await API.sendTestWebPush();
            Toast.success(res.message || 'Test push notification delivered!');
        } catch (err) {
            Toast.error('Failed to send test push: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    }
};

window.SettingsController = SettingsController;
