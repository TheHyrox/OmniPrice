/**
 * OmniPrice - Global Frontend Utilities
 * Multi-currency formatting, sanitization, and helpers.
 */

const CURRENCY_CONFIGS = {
    EUR: { locale: 'fr-FR', currency: 'EUR', symbol: '€', digits: 2 },
    USD: { locale: 'en-US', currency: 'USD', symbol: '$', digits: 2 },
    GBP: { locale: 'en-GB', currency: 'GBP', symbol: '£', digits: 2 },
    CAD: { locale: 'en-CA', currency: 'CAD', symbol: 'CA$', digits: 2 },
    JPY: { locale: 'ja-JP', currency: 'JPY', symbol: '¥', digits: 0 },
    CHF: { locale: 'de-CH', currency: 'CHF', symbol: 'CHF', digits: 2 },
    AUD: { locale: 'en-AU', currency: 'AUD', symbol: 'A$', digits: 2 }
};

let currentAppCurrency = 'EUR';

/**
 * Sets the active currency code across the UI.
 * @param {string} currencyCode
 */
function setAppCurrency(currencyCode) {
    if (!currencyCode) return;
    const upper = String(currencyCode).toUpperCase();
    if (CURRENCY_CONFIGS[upper]) {
        currentAppCurrency = upper;
    }
}

/**
 * Returns the currently active currency code.
 * @returns {string}
 */
function getAppCurrency() {
    return currentAppCurrency;
}

/**
 * Returns the currency symbol for the specified or current currency.
 * @param {string} [currencyCode]
 * @returns {string}
 */
function getCurrencySymbol(currencyCode = currentAppCurrency) {
    const config = CURRENCY_CONFIGS[(currencyCode || currentAppCurrency).toUpperCase()];
    return config ? config.symbol : '€';
}

/**
 * Escapes HTML special characters to prevent XSS when injecting
 * user-controlled strings into innerHTML.
 * @param {any} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Formats a date into a human-readable relative time string
 * @param {string|Date} dateString
 * @returns {string}
 */
function formatTimeAgo(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Never';
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 0) return 'Just now';
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Formats a numeric price in the active or specified currency.
 * @param {number} val
 * @param {string} [currencyCode]
 * @returns {string}
 */
function formatCurrency(val, currencyCode = currentAppCurrency) {
    if (val == null || isNaN(val) || val === '') return '—';
    const num = parseFloat(val);
    const curr = (currencyCode || currentAppCurrency || 'EUR').toUpperCase();
    const config = CURRENCY_CONFIGS[curr] || CURRENCY_CONFIGS.EUR;

    try {
        return new Intl.NumberFormat(config.locale, {
            style: 'currency',
            currency: config.currency,
            minimumFractionDigits: config.digits,
            maximumFractionDigits: config.digits
        }).format(num);
    } catch (_) {
        return `${config.symbol}${num.toFixed(config.digits)}`;
    }
}

/**
 * Converts a base64 URL string to a Uint8Array (required for Web Push applicationServerKey)
 * @param {string} base64String
 * @returns {Uint8Array}
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Global Utils namespace for compatibility
window.Utils = {
    escapeHtml,
    formatTimeAgo,
    formatCurrency,
    setAppCurrency,
    getAppCurrency,
    getCurrencySymbol,
    urlBase64ToUint8Array
};
