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
 * Formats a numeric price in Euros
 * @param {number} val
 * @returns {string}
 */
function formatCurrency(val) {
    if (val == null || isNaN(val)) return '—';
    return `€${parseFloat(val).toFixed(2)}`;
}

// Global Utils namespace for compatibility
window.Utils = {
    escapeHtml,
    formatTimeAgo,
    formatCurrency
};
