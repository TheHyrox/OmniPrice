/**
 * OmniPrice - Alerts Controller
 * Manages price drop, all-time low, percentage drop, and price rise alerts.
 */
const AlertsController = {
    alerts: [],

    async loadAlerts() {
        try {
            if ((!window.App?.products || window.App.products.length === 0) && window.App?.loadProducts) {
                await window.App.loadProducts();
            }
            this.alerts = await API.getAlerts();
            if (window.App) window.App.alerts = this.alerts;
            this.renderAlerts();
        } catch (error) {
            console.error('Failed to load alerts:', error);
            Toast.error('Failed to load alerts');
        }
    },

    renderAlerts() {
        const container = document.getElementById('alertsContainer');
        if (!container) return;

        if (!this.alerts || this.alerts.length === 0) {
            container.innerHTML = `
                <div class="empty-state alerts-empty-state" style="padding: 48px;">
                    <div class="empty-state-icon">🔔</div>
                    <h3>No price alerts configured</h3>
                    <p>Create an alert to get notified via Discord or Web Push when prices drop or reach historical lows.</p>
                    <button class="btn btn-primary btn-sm" onclick="App.openAlertModal()" style="margin-top: 14px;">+ Create First Alert</button>
                </div>
            `;
            return;
        }

        const products = (window.App && window.App.products) || [];

        container.innerHTML = `
            <div class="alerts-grid">
                ${this.alerts.map(alert => {
                    const product = products.find(p => p._id === alert.productId) || alert.product || {
                        title: 'Unknown Product',
                        image: '/images/placeholder.svg',
                        lowestPrice: null,
                        referencePrice: null
                    };

                    const id = Utils.escapeHtml(alert._id);
                    const title = Utils.escapeHtml(product.title);
                    const image = Utils.escapeHtml(product.image || '/images/placeholder.svg');
                    const isActive = alert.active !== false;
                    const alertType = alert.alertType || 'drop';

                    let typeLabel = '';
                    let conditionDesc = '';

                    if (alertType === 'atl') {
                        typeLabel = '<span class="alert-type-chip atl">🔥 All-Time Low</span>';
                        conditionDesc = 'Notifies whenever a new all-time low price is recorded.';
                    } else if (alertType === 'percentage_drop') {
                        const pct = alert.thresholdPercent || 15;
                        typeLabel = `<span class="alert-type-chip percent">🏷️ ≥ ${pct}% Drop</span>`;
                        conditionDesc = `Triggers when price is at least <strong>${pct}% off</strong> reference price (Target: ≤ ${Utils.formatCurrency(alert.targetPrice)}).`;
                    } else if (alertType === 'rise') {
                        typeLabel = '<span class="alert-type-chip rise">📈 Price Rise</span>';
                        conditionDesc = `Triggers if price rises to or above <strong>${Utils.formatCurrency(alert.targetPrice)}</strong>.`;
                    } else {
                        typeLabel = '<span class="alert-type-chip drop">📉 Price Drop</span>';
                        conditionDesc = `Triggers when lowest price drops to or below <strong>${Utils.formatCurrency(alert.targetPrice)}</strong>.`;
                    }

                    const lastTriggered = alert.lastTriggeredAt
                        ? `<span class="alert-last-triggered">Last triggered: ${Utils.formatTimeAgo(alert.lastTriggeredAt)} (${Utils.formatCurrency(alert.lastTriggeredPrice)})</span>`
                        : '<span class="alert-never-triggered">Waiting for condition...</span>';

                    return `
                        <div class="alert-card ${!isActive ? 'is-paused' : ''}">
                            <div class="alert-card-header">
                                <img src="${image}" alt="${title}" class="alert-product-thumb" width="60" height="60" loading="lazy" onerror="this.src='/images/placeholder.svg'">
                                <div class="alert-product-info">
                                    <h4 class="alert-product-title" title="${title}">${title}</h4>
                                    <div class="alert-product-prices">
                                        <span class="alert-cur-price">Current: <strong>${Utils.formatCurrency(product.lowestPrice)}</strong></span>
                                        ${product.referencePrice ? `<span class="alert-ref-price">Ref: ${Utils.formatCurrency(product.referencePrice)}</span>` : ''}
                                    </div>
                                </div>
                            </div>

                            <div class="alert-card-body">
                                <div class="alert-type-row">
                                    ${typeLabel}
                                    ${alert.notifyOnRise ? '<span class="alert-pill-rise-note" title="Also alerts when deal ends">Ends alert ✓</span>' : ''}
                                    <span class="alert-status-pill ${isActive ? 'active' : 'paused'}">
                                        ${isActive ? 'Active' : 'Paused'}
                                    </span>
                                </div>
                                <p class="alert-condition-text">${conditionDesc}</p>
                                ${alert.webhookUrl ? '<span class="alert-custom-webhook-badge" title="Custom Discord Webhook configured">🔗 Custom Webhook</span>' : ''}
                                <div class="alert-trigger-meta">
                                    ${lastTriggered}
                                </div>
                            </div>

                            <div class="alert-card-footer">
                                <button class="btn btn-secondary btn-sm" onclick="App.triggerTestAlert('${id}')" title="Send a test notification">
                                    Test
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="App.toggleAlert('${id}', ${isActive})" title="${isActive ? 'Pause alert' : 'Activate alert'}">
                                    ${isActive ? 'Pause' : 'Resume'}
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="App.openAlertModal('${id}')">
                                    Edit
                                </button>
                                <button class="btn btn-ghost btn-sm alert-delete-btn" onclick="App.deleteAlert('${id}')" title="Delete alert">
                                    ×
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    onAlertTypeSelectChange(type) {
        const targetPriceGroup = document.getElementById('targetPriceGroup');
        const thresholdPercentGroup = document.getElementById('thresholdPercentGroup');
        const atlInfoGroup = document.getElementById('atlInfoGroup');
        const notifyOnRiseGroup = document.getElementById('notifyOnRiseGroup');
        const targetPriceInput = document.getElementById('alertTargetPrice');
        const thresholdPercentInput = document.getElementById('alertThresholdPercent');

        if (!targetPriceGroup) return;

        targetPriceGroup.style.display = 'none';
        if (thresholdPercentGroup) thresholdPercentGroup.style.display = 'none';
        if (atlInfoGroup) atlInfoGroup.style.display = 'none';
        if (notifyOnRiseGroup) notifyOnRiseGroup.style.display = (type === 'rise') ? 'none' : 'block';

        if (targetPriceInput) targetPriceInput.required = false;
        if (thresholdPercentInput) thresholdPercentInput.required = false;

        if (type === 'percentage_drop') {
            if (thresholdPercentGroup) thresholdPercentGroup.style.display = 'block';
            if (thresholdPercentInput) thresholdPercentInput.required = true;
            this.updateAlertPercentHint();
        } else if (type === 'atl') {
            if (atlInfoGroup) atlInfoGroup.style.display = 'block';
        } else {
            // 'drop' or 'rise'
            targetPriceGroup.style.display = 'block';
            if (targetPriceInput) targetPriceInput.required = true;
        }
    },

    updateAlertPercentHint() {
        const prodSelect = document.getElementById('alertProductSelect');
        const pctInput = document.getElementById('alertThresholdPercent');
        const hint = document.getElementById('alertPercentCalculationHint');
        if (!prodSelect || !pctInput || !hint) return;

        const prodId = prodSelect.value;
        const pct = parseFloat(pctInput.value);

        if (!prodId || isNaN(pct) || pct <= 0) {
            hint.textContent = '';
            return;
        }

        const products = (window.App && window.App.products) || [];
        const product = products.find(p => p._id === prodId);

        if (product && product.referencePrice && product.referencePrice > 0) {
            const calculatedTarget = product.referencePrice * (1 - pct / 100);
            hint.textContent = `Calculated alert target: ≤ ${Utils.formatCurrency(calculatedTarget)} (Ref: ${Utils.formatCurrency(product.referencePrice)})`;
        } else {
            hint.textContent = 'Product has no reference price configured. Target will be calculated once set.';
        }
    },

    openAlertModal(alertIdOrObj = null) {
        const modal = document.getElementById('alertModal');
        const form = document.getElementById('alertForm');
        const title = document.getElementById('alertModalTitle');
        const productSelect = document.getElementById('alertProductSelect');
        if (!modal || !form || !productSelect) return;

        form.reset();
        document.getElementById('alertId').value = '';

        // Dynamic currency in target price label
        const targetLabel = document.getElementById('alertTargetPriceLabel') || document.querySelector('label[for="alertTargetPrice"]');
        if (targetLabel && typeof Utils !== 'undefined' && Utils.getCurrencySymbol) {
            targetLabel.textContent = `Target Price (${Utils.getCurrencySymbol()}) *`;
        }

        // Populate products dropdown
        const products = (window.App && window.App.products) || [];
        productSelect.innerHTML = '<option value="">Select a tracked product...</option>' +
            products.map(p => `
                <option value="${Utils.escapeHtml(p._id)}" data-price="${p.lowestPrice || ''}" data-ref="${p.referencePrice || ''}">
                    ${Utils.escapeHtml(p.title)} (${Utils.formatCurrency(p.lowestPrice)})
                </option>
            `).join('');

        let alert = null;
        if (typeof alertIdOrObj === 'string') {
            alert = this.alerts.find(a => a._id === alertIdOrObj);
        } else if (typeof alertIdOrObj === 'object' && alertIdOrObj !== null) {
            alert = alertIdOrObj;
        }

        if (alert) {
            title.textContent = 'Edit Price Alert';
            document.getElementById('alertId').value = alert._id;
            productSelect.value = alert.productId;
            document.getElementById('alertTypeSelect').value = alert.alertType || 'drop';
            if (alert.targetPrice != null) document.getElementById('alertTargetPrice').value = alert.targetPrice;
            if (alert.thresholdPercent != null) document.getElementById('alertThresholdPercent').value = alert.thresholdPercent;
            document.getElementById('alertWebhookUrl').value = alert.webhookUrl || '';
            document.getElementById('alertNotifyOnRise').checked = Boolean(alert.notifyOnRise);
            this.onAlertTypeSelectChange(alert.alertType || 'drop');
        } else {
            title.textContent = 'Create Price Alert';
            document.getElementById('alertTypeSelect').value = 'drop';
            this.onAlertTypeSelectChange('drop');
        }

        modal.classList.add('active');
    },

    closeAlertModal() {
        const modal = document.getElementById('alertModal');
        if (modal) modal.classList.remove('active');
    },

    onAlertProductSelectChange(e) {
        const select = e.target;
        const opt = select.options[select.selectedIndex];
        const hint = document.getElementById('alertProductCurrentPriceHint');
        const targetInput = document.getElementById('alertTargetPrice');

        if (opt && opt.dataset.price && hint) {
            hint.textContent = `Current lowest price across all stores: ${Utils.formatCurrency(opt.dataset.price)}`;
            if (targetInput && !targetInput.value) {
                const curPrice = parseFloat(opt.dataset.price);
                if (curPrice > 0) {
                    targetInput.value = (curPrice * 0.95).toFixed(2);
                }
            }
        } else if (hint) {
            hint.textContent = '';
        }
        this.updateAlertPercentHint();
    },

    async handleAlertFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('alertId').value;
        const productId = document.getElementById('alertProductSelect').value;
        const alertType = document.getElementById('alertTypeSelect').value;
        const targetPriceVal = document.getElementById('alertTargetPrice').value;
        const thresholdPercentVal = document.getElementById('alertThresholdPercent').value;
        const webhookUrl = document.getElementById('alertWebhookUrl').value.trim();
        const notifyOnRise = document.getElementById('alertNotifyOnRise').checked;

        if (!productId) {
            Toast.warning('Please select a product for this alert.');
            return;
        }

        let targetPrice = null;
        let thresholdPercent = null;

        if (alertType === 'percentage_drop') {
            thresholdPercent = parseFloat(thresholdPercentVal);
            if (isNaN(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent >= 100) {
                Toast.warning('Please enter a valid drop percentage between 1% and 99%.');
                return;
            }
        } else if (alertType === 'drop' || alertType === 'rise') {
            targetPrice = parseFloat(targetPriceVal);
            if (isNaN(targetPrice) || targetPrice <= 0) {
                Toast.warning('Please enter a valid target price greater than 0.');
                return;
            }
        }

        const data = {
            productId,
            alertType,
            targetPrice: (alertType === 'drop' || alertType === 'rise') ? targetPrice : null,
            thresholdPercent: (alertType === 'percentage_drop') ? thresholdPercent : null,
            webhookUrl: webhookUrl || null,
            notifyOnRise: (alertType !== 'rise') ? notifyOnRise : false
        };

        try {
            if (id) {
                await API.updateAlert(id, data);
                Toast.success('Alert updated successfully!');
            } else {
                await API.createAlert(data);
                Toast.success('Alert created successfully!');
            }

            this.closeAlertModal();
            await this.loadAlerts();
        } catch (error) {
            Toast.error('Error saving alert: ' + error.message);
        }
    },

    async toggleAlert(id, currentActive) {
        try {
            await API.updateAlert(id, { active: !currentActive });
            Toast.info(`Alert ${!currentActive ? 'activated' : 'paused'}`);
            await this.loadAlerts();
        } catch (error) {
            Toast.error('Error updating alert: ' + error.message);
        }
    },

    async deleteAlert(id) {
        const confirmed = await Confirm.ask({
            title: 'Delete Price Alert',
            message: 'Are you sure you want to delete this alert? You will no longer receive notifications for this trigger.',
            confirmText: 'Delete Alert',
            danger: true
        });

        if (!confirmed) return;

        try {
            await API.deleteAlert(id);
            Toast.success('Alert deleted successfully');
            await this.loadAlerts();
        } catch (error) {
            Toast.error('Error deleting alert: ' + error.message);
        }
    },

    async triggerTestAlert(id) {
        try {
            Toast.info('Sending test notification...');
            const res = await API.triggerTestAlert(id);
            Toast.success(res.message || 'Test notification sent successfully!');
        } catch (error) {
            Toast.error('Failed to send test notification: ' + error.message);
        }
    }
};

window.AlertsController = AlertsController;
