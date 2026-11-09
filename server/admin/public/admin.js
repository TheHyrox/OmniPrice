/**
 * OmniPrice Telemetry
 * Live stream, diagnostics, and issue tracking
 */

// Application State
const state = {
    logs: [],
    clientErrors: [],
    issues: [],
    activeFilter: 'all',
    logLevelFilter: 'all',
    logComponentFilter: 'all',
    logSearchText: '',
    autoScroll: true,
    eventSource: null
};

// DOM Elements
const el = {
    connectionStatus: document.getElementById('connectionStatus'),
    navTabs: document.querySelectorAll('.nav-tab'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    issuesCountBadge: document.getElementById('issuesCountBadge'),
    logsCountBadge: document.getElementById('logsCountBadge'),
    clientErrorsCountBadge: document.getElementById('clientErrorsCountBadge'),
    toastContainer: document.getElementById('toastContainer'),

    // Overview
    hostVal: document.getElementById('hostVal'),
    mainAppLink: document.getElementById('mainAppLink'),
    mPorts: document.getElementById('mPorts'),
    mIssuesCount: document.getElementById('mIssuesCount'),
    mIssuesSub: document.getElementById('mIssuesSub'),
    mErrorsCount: document.getElementById('mErrorsCount'),
    mErrorsSub: document.getElementById('mErrorsSub'),
    mHeapUsed: document.getElementById('mHeapUsed'),
    mHeapSub: document.getElementById('mHeapSub'),
    mDbStatus: document.getElementById('mDbStatus'),
    mDbSub: document.getElementById('mDbSub'),
    mSchedulerStatus: document.getElementById('mSchedulerStatus'),
    mSchedulerSub: document.getElementById('mSchedulerSub'),
    mClientErrors: document.getElementById('mClientErrors'),
    mClientErrorsSub: document.getElementById('mClientErrorsSub'),
    mUptime: document.getElementById('mUptime'),
    mNodeVersion: document.getElementById('mNodeVersion'),
    mPlatform: document.getElementById('mPlatform'),
    mPid: document.getElementById('mPid'),
    mConcurrency: document.getElementById('mConcurrency'),
    quickErrorsList: document.getElementById('quickErrorsList'),
    btnRefreshOverview: document.getElementById('btnRefreshOverview'),
    btnTriggerTestError: document.getElementById('btnTriggerTestError'),

    // Issues
    issuesListContainer: document.getElementById('issuesListContainer'),
    btnRefreshIssues: document.getElementById('btnRefreshIssues'),
    btnRetryAllIssues: document.getElementById('btnRetryAllIssues'),
    chipAllCount: document.getElementById('chipAllCount'),
    chips: document.querySelectorAll('.chip'),

    // Live Console
    terminalBody: document.getElementById('terminalBody'),
    logLevelSelect: document.getElementById('logLevelSelect'),
    logComponentSelect: document.getElementById('logComponentSelect'),
    logSearchInput: document.getElementById('logSearchInput'),
    btnPauseScroll: document.getElementById('btnPauseScroll'),
    btnClearLogs: document.getElementById('btnClearLogs'),
    btnExportLogs: document.getElementById('btnExportLogs'),
    logCounterText: document.getElementById('logCounterText'),

    // Client Errors
    clientErrorsList: document.getElementById('clientErrorsList'),
    btnRefreshClientErrors: document.getElementById('btnRefreshClientErrors'),
    btnClearClientErrors: document.getElementById('btnClearClientErrors'),

    // Scraper Diagnostic
    diagnosticForm: document.getElementById('diagnosticForm'),
    diagUrl: document.getElementById('diagUrl'),
    diagSelector: document.getElementById('diagSelector'),
    diagUsePuppeteer: document.getElementById('diagUsePuppeteer'),
    diagAutoDiscover: document.getElementById('diagAutoDiscover'),
    btnRunDiagnostic: document.getElementById('btnRunDiagnostic'),
    diagnosticResults: document.getElementById('diagnosticResults'),
    diagStatusBadge: document.getElementById('diagStatusBadge'),
    diagDuration: document.getElementById('diagDuration'),
    diagEngine: document.getElementById('diagEngine'),
    diagPrice: document.getElementById('diagPrice'),
    diagJsonOutput: document.getElementById('diagJsonOutput')
};

// ==============================================================================
// INITIALIZATION
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (el.hostVal) {
        el.hostVal.textContent = window.location.host;
    }
    initNavigation();
    initSSE();
    loadOverviewMetrics();
    loadIssues();
    loadClientErrors();
    initConsoleControls();
    initDiagnosticForm();

    setInterval(loadOverviewMetrics, 10000);
});

// ==============================================================================
// TOAST NOTIFICATIONS
// ==============================================================================
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 120ms ease';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 120);
    }, 3000);
}

// ==============================================================================
// NAVIGATION TABS
// ==============================================================================
function initNavigation() {
    el.navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabId) {
    el.navTabs.forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
    });

    el.tabPanes.forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });

    if (tabId === 'issues') loadIssues();
    if (tabId === 'client-errors') loadClientErrors();
    if (tabId === 'overview') loadOverviewMetrics();
}
window.switchTab = switchTab;

// ==============================================================================
// SERVER-SENT EVENTS (SSE) STREAM
// ==============================================================================
function initSSE() {
    if (state.eventSource) {
        state.eventSource.close();
    }

    setConnectionStatus('connecting');

    const sse = new EventSource('/api/admin/logs/stream');
    state.eventSource = sse;

    sse.addEventListener('open', () => {
        setConnectionStatus('connected');
    });

    sse.addEventListener('init', (e) => {
        try {
            const data = JSON.parse(e.data);
            if (Array.isArray(data.logs)) {
                state.logs = data.logs;
                renderTerminalLogs();
            }
        } catch (_) {}
    });

    sse.addEventListener('log', (e) => {
        try {
            const entry = JSON.parse(e.data);
            state.logs.push(entry);
            if (state.logs.length > 1000) state.logs.shift();

            updateLogCounts();

            if (matchesLogFilter(entry)) {
                appendLogRow(entry);
                if (state.autoScroll) {
                    el.terminalBody.scrollTop = el.terminalBody.scrollHeight;
                }
            }

            if (entry.level === 'error') {
                updateQuickErrors();
            }
        } catch (_) {}
    });

    sse.addEventListener('client-error', (e) => {
        try {
            const clientErr = JSON.parse(e.data);
            state.clientErrors.unshift(clientErr);
            updateClientErrorsCount();
            showToast(`Browser error: ${clientErr.message}`, 'error');
            loadClientErrors();
        } catch (_) {}
    });

    sse.addEventListener('clear', () => {
        state.logs = [];
        renderTerminalLogs();
        showToast('Console cleared', 'info');
    });

    sse.onerror = () => {
        setConnectionStatus('disconnected');
    };
}

function setConnectionStatus(status) {
    if (status === 'connected') {
        el.connectionStatus.className = 'connection-status';
        el.connectionStatus.innerHTML = '<span class="status-dot"></span><span class="status-text">Connected</span>';
    } else if (status === 'connecting') {
        el.connectionStatus.className = 'connection-status disconnected';
        el.connectionStatus.innerHTML = '<span class="status-dot"></span><span class="status-text">Connecting</span>';
    } else {
        el.connectionStatus.className = 'connection-status disconnected';
        el.connectionStatus.innerHTML = '<span class="status-dot"></span><span class="status-text">Disconnected</span>';
    }
}

// ==============================================================================
// METRICS & HEALTH (OVERVIEW)
// ==============================================================================
async function loadOverviewMetrics() {
    try {
        const res = await fetch('/api/admin/metrics');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        // System & Process
        el.mHeapUsed.textContent = `${data.process.memory.heapUsedMB} MB`;
        el.mHeapSub.textContent = `RSS: ${data.process.memory.rssMB} MB (${data.system.usedPercent}% system used)`;
        el.mUptime.textContent = data.process.uptimeFormatted;
        el.mNodeVersion.textContent = data.process.nodeVersion;
        el.mPlatform.textContent = `${data.process.platform} (${data.process.arch})`;
        el.mPid.textContent = data.process.pid;
        el.mConcurrency.textContent = `${data.scraper.puppeteerConcurrency} tab`;

        if (data.ports && el.mPorts) {
            el.mPorts.textContent = `:${data.ports.admin} (Admin) / :${data.ports.main} (App)`;
        }

        if (el.mainAppLink) {
            const mainPort = (data.ports && data.ports.main) || 3005;
            if (window.location.hostname.startsWith('admin.')) {
                const domain = window.location.hostname.replace(/^admin\./, '');
                const portPart = window.location.port ? `:${window.location.port}` : '';
                el.mainAppLink.href = `${window.location.protocol}//${domain}${portPart}`;
            } else {
                el.mainAppLink.href = `${window.location.protocol}//${window.location.hostname}:${mainPort}`;
            }
        }

        // Database
        if (data.database.status === 'connected') {
            el.mDbStatus.textContent = 'Connected';
            el.mDbStatus.className = 'metric-value text-success';
            el.mDbSub.textContent = `${data.database.totalProducts} products (${data.database.totalSources} sources)`;
        } else {
            el.mDbStatus.textContent = 'Disconnected';
            el.mDbStatus.className = 'metric-value text-danger';
            el.mDbSub.textContent = data.database.error || 'Connection failed';
        }

        // Issues
        const failing = data.database.failingSources || 0;
        el.mIssuesCount.textContent = failing;
        el.mIssuesCount.className = failing > 0 ? 'metric-value text-danger' : 'metric-value';
        el.mIssuesSub.textContent = failing > 0 ? `${failing} source(s) failing` : 'All sources healthy';

        if (failing > 0) {
            el.issuesCountBadge.style.display = 'inline-block';
            el.issuesCountBadge.textContent = failing;
        } else {
            el.issuesCountBadge.style.display = 'none';
        }

        // Scheduler
        if (data.scheduler.isRunning) {
            el.mSchedulerStatus.textContent = 'Running';
            el.mSchedulerSub.textContent = `Every ${data.scheduler.frequencyHours}h`;
        } else {
            el.mSchedulerStatus.textContent = 'Idle';
            el.mSchedulerSub.textContent = `Interval inactive (every ${data.scheduler.frequencyHours}h)`;
        }

        // Logs stats
        const errs = data.logs.errorCount || 0;
        const warns = data.logs.warnCount || 0;
        el.mErrorsCount.textContent = errs;
        el.mErrorsSub.textContent = `${warns} warnings, ${data.logs.totalLogs} total logs`;
        el.logsCountBadge.textContent = errs + warns;

        // Client errors
        const clientErrs = data.logs.clientErrorCount || 0;
        el.mClientErrors.textContent = clientErrs;
        if (clientErrs > 0) {
            el.clientErrorsCountBadge.style.display = 'inline-block';
            el.clientErrorsCountBadge.textContent = clientErrs;
        } else {
            el.clientErrorsCountBadge.style.display = 'none';
        }

        updateQuickErrors();
    } catch (err) {
        console.error('Failed to load overview metrics:', err);
    }
}

function updateQuickErrors() {
    const errorLogs = state.logs.filter(l => l.level === 'error').slice(-5).reverse();
    if (errorLogs.length === 0) {
        el.quickErrorsList.innerHTML = '<div class="empty-state">No recent errors detected</div>';
        return;
    }

    el.quickErrorsList.innerHTML = errorLogs.map(l => `
        <div style="padding: 8px 0; border-bottom: 1px solid var(--border-hairline);">
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px; font-family:var(--font-mono);">
                <span class="badge badge-danger">${escapeHtml(l.component)}</span>
                <span class="text-muted">${formatRelativeTime(l.timestamp)}</span>
            </div>
            <div style="font-family:var(--font-mono); font-size:12px; color:var(--text-secondary); word-break:break-all;">
                ${escapeHtml(l.message)}
            </div>
        </div>
    `).join('');
}

// ==============================================================================
// SCRAPER ISSUES MANAGEMENT
// ==============================================================================
async function loadIssues() {
    try {
        el.issuesListContainer.innerHTML = '<div class="loading-state">Loading scraper issues...</div>';
        const res = await fetch('/api/admin/issues');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        state.issues = data.issues || [];
        el.chipAllCount.textContent = state.issues.length;
        renderIssues();
    } catch (err) {
        el.issuesListContainer.innerHTML = `<div class="empty-state text-danger">Error loading issues: ${escapeHtml(err.message)}</div>`;
    }
}

function renderIssues() {
    let filtered = state.issues;
    if (state.activeFilter !== 'all') {
        filtered = state.issues.filter(i => i.category === state.activeFilter);
    }

    if (filtered.length === 0) {
        el.issuesListContainer.innerHTML = `
            <div class="empty-state">
                <p>No active scrape issues found</p>
                <p class="text-muted" style="margin-top:2px;">All tracked product sources are scraping normally</p>
            </div>
        `;
        return;
    }

    el.issuesListContainer.innerHTML = filtered.map(issue => `
        <div class="issue-item" id="issue-row-${issue.productId}-${issue.sourceIndex}">
            <img class="issue-thumb" src="${issue.productImage || '/images/placeholder.png'}" onerror="this.src='/images/placeholder.png'" alt="">
            <div class="issue-main">
                <div class="issue-title-row">
                    <span class="issue-title">${escapeHtml(issue.productTitle)}</span>
                    <span class="badge badge-${issue.badge}">${escapeHtml(issue.category)}</span>
                    <span class="badge">${escapeHtml(issue.siteName)}</span>
                </div>
                <a href="${escapeHtml(issue.url)}" target="_blank" class="issue-url">${escapeHtml(issue.url)}</a>
                <div class="issue-error-box">
                    ${escapeHtml(issue.lastError)}
                </div>
                <div class="issue-meta">
                    <span>Last attempt: ${issue.lastScraped ? formatRelativeTime(issue.lastScraped) : 'Never'}</span>
                    <span>Selector: ${escapeHtml(issue.cssSelector || 'Auto')}</span>
                    <span>Puppeteer: ${issue.usePuppeteer ? 'Yes' : 'No'}</span>
                </div>
            </div>
            <div class="issue-actions">
                <button class="btn btn-sm btn-secondary" onclick="retryScrape('${issue.productId}', ${issue.sourceIndex})">
                    Retry
                </button>
            </div>
        </div>
    `).join('');
}

// Retry a single broken product source
async function retryScrape(productId, sourceIndex) {
    const row = document.getElementById(`issue-row-${productId}-${sourceIndex}`);
    const btn = row ? row.querySelector('button') : null;
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Retrying...';
    }

    try {
        const res = await fetch('/api/admin/issues/retry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, sourceIndex })
        });

        const data = await res.json();
        if (data.success) {
            showToast(`Scrape succeeded: €${data.price}`, 'success');
            state.issues = state.issues.filter(i => !(i.productId === productId && i.sourceIndex === sourceIndex));
            renderIssues();
            loadOverviewMetrics();
        } else {
            showToast(`Retry failed: ${data.error}`, 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Retry';
            }
        }
    } catch (err) {
        showToast(`Request failed: ${err.message}`, 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Retry';
        }
    }
}
window.retryScrape = retryScrape;

// ==============================================================================
// LIVE TERMINAL CONSOLE
// ==============================================================================
function initConsoleControls() {
    el.logLevelSelect.addEventListener('change', (e) => {
        state.logLevelFilter = e.target.value;
        renderTerminalLogs();
    });

    el.logComponentSelect.addEventListener('change', (e) => {
        state.logComponentFilter = e.target.value;
        renderTerminalLogs();
    });

    el.logSearchInput.addEventListener('input', (e) => {
        state.logSearchText = e.target.value.toLowerCase();
        renderTerminalLogs();
    });

    el.btnPauseScroll.addEventListener('click', () => {
        state.autoScroll = !state.autoScroll;
        el.btnPauseScroll.textContent = state.autoScroll ? 'Pause scroll' : 'Resume scroll';
        el.btnPauseScroll.classList.toggle('btn-primary', !state.autoScroll);
    });

    el.btnClearLogs.addEventListener('click', async () => {
        await fetch('/api/admin/logs', { method: 'DELETE' });
        state.logs = [];
        renderTerminalLogs();
        showToast('Console cleared', 'info');
    });

    el.btnExportLogs.addEventListener('click', () => {
        const text = state.logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.component}] ${l.message} ${l.details || ''}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `omniprice-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        a.click();
    });

    el.btnTriggerTestError.addEventListener('click', async () => {
        await fetch('/api/admin/logs/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: 'error',
                component: 'scraper',
                message: `[Scraper] Diagnostic test error on sample target (${new Date().toLocaleTimeString()})`
            })
        });
        showToast('Test error emitted to console', 'info');
    });

    el.btnRefreshOverview.addEventListener('click', () => {
        loadOverviewMetrics();
        showToast('Metrics refreshed', 'info');
    });

    el.chips.forEach(chip => {
        chip.addEventListener('click', () => {
            el.chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.activeFilter = chip.getAttribute('data-filter');
            renderIssues();
        });
    });

    el.btnRefreshIssues.addEventListener('click', () => {
        loadIssues();
        showToast('Issues refreshed', 'info');
    });

    el.btnRetryAllIssues.addEventListener('click', async () => {
        if (state.issues.length === 0) {
            showToast('No failing sources to retry', 'info');
            return;
        }

        el.btnRetryAllIssues.disabled = true;
        el.btnRetryAllIssues.textContent = 'Retrying all...';

        try {
            const res = await fetch('/api/admin/issues/retry-all', { method: 'POST' });
            const data = await res.json();
            showToast(`Retry complete: ${data.successful} resolved, ${data.failed} failed`, data.successful > 0 ? 'success' : 'error');
            await loadIssues();
            await loadOverviewMetrics();
        } catch (err) {
            showToast(`Bulk retry error: ${err.message}`, 'error');
        } finally {
            el.btnRetryAllIssues.disabled = false;
            el.btnRetryAllIssues.textContent = 'Retry all';
        }
    });
}

function matchesLogFilter(entry) {
    if (state.logLevelFilter !== 'all') {
        if (state.logLevelFilter === 'warn') {
            if (entry.level !== 'warn' && entry.level !== 'error') return false;
        } else if (entry.level !== state.logLevelFilter) {
            return false;
        }
    }

    if (state.logComponentFilter !== 'all') {
        if (entry.component.toLowerCase() !== state.logComponentFilter.toLowerCase()) {
            return false;
        }
    }

    if (state.logSearchText) {
        const str = `${entry.message} ${entry.details || ''} ${entry.component}`.toLowerCase();
        if (!str.includes(state.logSearchText)) return false;
    }

    return true;
}

function renderTerminalLogs() {
    const filtered = state.logs.filter(matchesLogFilter);
    el.logCounterText.textContent = `${filtered.length} / ${state.logs.length} lines`;

    if (filtered.length === 0) {
        el.terminalBody.innerHTML = '<div class="empty-state">No matching log entries</div>';
        return;
    }

    el.terminalBody.innerHTML = filtered.map(createLogRowHtml).join('');
    if (state.autoScroll) {
        el.terminalBody.scrollTop = el.terminalBody.scrollHeight;
    }
}

function appendLogRow(entry) {
    const temp = document.createElement('div');
    temp.innerHTML = createLogRowHtml(entry);
    const row = temp.firstElementChild;
    if (row) {
        if (el.terminalBody.querySelector('.empty-state')) {
            el.terminalBody.innerHTML = '';
        }
        el.terminalBody.appendChild(row);
    }
    el.logCounterText.textContent = `${el.terminalBody.children.length} lines`;
}

function createLogRowHtml(entry) {
    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
    const detailsHtml = entry.details ? `<div class="log-details">${escapeHtml(entry.details)}</div>` : '';

    return `
        <div class="log-row level-${entry.level}">
            <span class="log-time">${time}</span>
            <span class="log-level log-level-${entry.level}">${entry.level}</span>
            <span class="log-component">${escapeHtml(entry.component)}</span>
            <div class="log-msg">${escapeHtml(entry.message)}${detailsHtml}</div>
        </div>
    `;
}

function updateLogCounts() {
    const errors = state.logs.filter(l => l.level === 'error').length;
    const warns = state.logs.filter(l => l.level === 'warn').length;
    el.logsCountBadge.textContent = errors + warns;
}

// ==============================================================================
// CLIENT BROWSER ERRORS
// ==============================================================================
async function loadClientErrors() {
    try {
        const res = await fetch('/api/admin/logs/client-errors');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        state.clientErrors = data.errors || [];
        updateClientErrorsCount();
        renderClientErrors();
    } catch (err) {
        el.clientErrorsList.innerHTML = `<div class="empty-state text-danger">Error: ${escapeHtml(err.message)}</div>`;
    }
}

function updateClientErrorsCount() {
    const count = state.clientErrors.length;
    if (count > 0) {
        el.clientErrorsCountBadge.style.display = 'inline-block';
        el.clientErrorsCountBadge.textContent = count;
    } else {
        el.clientErrorsCountBadge.style.display = 'none';
    }
}

function renderClientErrors() {
    if (state.clientErrors.length === 0) {
        el.clientErrorsList.innerHTML = `
            <div class="empty-state">
                <p>No browser errors recorded</p>
                <p class="text-muted" style="margin-top:2px;">Client session errors are reported here automatically</p>
            </div>
        `;
        return;
    }

    el.clientErrorsList.innerHTML = state.clientErrors.map(err => `
        <div class="client-error-item">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-family:var(--font-mono);">
                <span class="badge badge-danger">${escapeHtml(err.type)}</span>
                <span class="text-muted" style="font-size:11px;">${formatRelativeTime(err.timestamp)}</span>
            </div>
            <div class="client-error-msg">${escapeHtml(err.message)}</div>
            <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px; font-family:var(--font-mono);">
                <span>${escapeHtml(err.url || err.source)}</span>
            </div>
            ${err.userAgent ? `<div style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${escapeHtml(err.userAgent)}</div>` : ''}
            ${err.stack ? `<pre class="client-error-stack">${escapeHtml(err.stack)}</pre>` : ''}
        </div>
    `).join('');
}

el.btnRefreshClientErrors.addEventListener('click', () => {
    loadClientErrors();
    showToast('Client errors refreshed', 'info');
});

el.btnClearClientErrors.addEventListener('click', async () => {
    await fetch('/api/admin/logs/client-errors', { method: 'DELETE' });
    state.clientErrors = [];
    updateClientErrorsCount();
    renderClientErrors();
    showToast('Client errors cleared', 'info');
});

// ==============================================================================
// SCRAPER DIAGNOSTIC FORM
// ==============================================================================
function initDiagnosticForm() {
    el.diagnosticForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = el.diagUrl.value.trim();
        const cssSelector = el.diagSelector.value.trim();
        const usePuppeteer = el.diagUsePuppeteer.checked;
        const autoDiscover = el.diagAutoDiscover.checked;

        if (!url) return;

        el.btnRunDiagnostic.disabled = true;
        el.btnRunDiagnostic.textContent = 'Running test scrape...';
        el.diagnosticResults.style.display = 'none';

        try {
            const res = await fetch('/api/admin/scraper/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, cssSelector, usePuppeteer, autoDiscover })
            });

            const data = await res.json();
            el.diagnosticResults.style.display = 'block';

            if (data.success) {
                el.diagStatusBadge.className = 'badge badge-success';
                el.diagStatusBadge.textContent = 'Success';
                el.diagPrice.textContent = `€${data.price}`;
            } else {
                el.diagStatusBadge.className = 'badge badge-danger';
                el.diagStatusBadge.textContent = 'Failed';
                el.diagPrice.textContent = 'None';
            }

            el.diagDuration.textContent = `${data.durationMs}ms`;
            el.diagEngine.textContent = data.engine;
            el.diagJsonOutput.textContent = JSON.stringify(data, null, 2);

            showToast(data.success ? `Scrape succeeded: €${data.price}` : `Scrape failed: ${data.error}`, data.success ? 'success' : 'error');
        } catch (err) {
            el.diagnosticResults.style.display = 'block';
            el.diagStatusBadge.className = 'badge badge-danger';
            el.diagStatusBadge.textContent = 'Error';
            el.diagJsonOutput.textContent = `Request error: ${err.message}`;
            showToast(`Diagnostic failed: ${err.message}`, 'error');
        } finally {
            el.btnRunDiagnostic.disabled = false;
            el.btnRunDiagnostic.textContent = 'Run test scrape';
        }
    });
}

// ==============================================================================
// UTILITIES
// ==============================================================================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatRelativeTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
}
