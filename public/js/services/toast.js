/**
 * OmniPrice - Modern Toast Notification System
 * Replaces native alert() with sleek, non-blocking toast notifications.
 */
const Toast = (() => {
    let container = null;

    function getContainer() {
        if (!container || !document.body.contains(container)) {
            container = document.getElementById('toastContainer');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toastContainer';
                container.className = 'toast-container';
                document.body.appendChild(container);
            }
        }
        return container;
    }

    const ICONS = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    function show(message, type = 'info', duration = 4000) {
        if (!message) return null;
        const cont = getContainer();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');

        const iconStr = ICONS[type] || ICONS.info;

        toast.innerHTML = `
            <div class="toast-icon">${iconStr}</div>
            <div class="toast-message">${Utils.escapeHtml(String(message))}</div>
            <button type="button" class="toast-close" aria-label="Dismiss notification">×</button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        let removeTimer = null;

        const dismiss = () => {
            if (removeTimer) clearTimeout(removeTimer);
            toast.classList.add('toast-hiding');
            toast.addEventListener('transitionend', () => {
                if (toast.parentElement) toast.parentElement.removeChild(toast);
            }, { once: true });
        };

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dismiss();
        });

        toast.addEventListener('click', dismiss);

        cont.appendChild(toast);

        // Force browser layout reflow for animation
        void toast.offsetWidth;
        toast.classList.add('toast-visible');

        if (duration > 0) {
            removeTimer = setTimeout(dismiss, duration);
        }

        return toast;
    }

    return {
        show,
        success: (msg, duration) => show(msg, 'success', duration),
        error: (msg, duration) => show(msg, 'error', duration || 5000),
        warning: (msg, duration) => show(msg, 'warning', duration),
        info: (msg, duration) => show(msg, 'info', duration)
    };
})();

// Export globally for compatibility
window.Toast = Toast;
