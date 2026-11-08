/**
 * OmniPrice - Hash-based Client Router
 * Manages deep linking, back/forward history, and tab activation.
 */
const Router = (() => {
    let currentRoute = null;
    let isHandlingHashChange = false;

    const routes = [
        {
            pattern: /^#product\/([a-zA-Z0-9_-]+)$/,
            handler: (match) => {
                const productId = match[1];
                if (window.App && typeof window.App.showProductDetail === 'function') {
                    window.App.showProductDetail(productId, false);
                }
            }
        },
        {
            pattern: /^#(products|stores|charts|alerts|settings)$/,
            handler: (match) => {
                const tabName = match[1];
                if (window.App && typeof window.App.navigateToTab === 'function') {
                    window.App.navigateToTab(tabName, false);
                }
            }
        }
    ];

    function handleRoute(hash = window.location.hash) {
        const cleanHash = hash || '#products';
        currentRoute = cleanHash;

        for (const route of routes) {
            const match = cleanHash.match(route.pattern);
            if (match) {
                route.handler(match);
                return;
            }
        }

        // Default route
        if (window.App && typeof window.App.navigateToTab === 'function') {
            window.App.navigateToTab('products', false);
        }
    }

    function navigate(hash, updateHistory = true) {
        if (!hash.startsWith('#')) {
            hash = '#' + hash;
        }

        if (window.location.hash === hash) {
            handleRoute(hash);
            return;
        }

        if (updateHistory) {
            window.location.hash = hash;
        } else {
            isHandlingHashChange = true;
            window.history.replaceState(null, '', hash);
            handleRoute(hash);
            isHandlingHashChange = false;
        }
    }

    function init() {
        window.addEventListener('hashchange', () => {
            if (isHandlingHashChange) return;
            handleRoute(window.location.hash);
        });

        // Trigger route handling on initial load once DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                handleRoute(window.location.hash);
            });
        } else {
            handleRoute(window.location.hash);
        }
    }

    return {
        init,
        navigate,
        handleRoute,
        getCurrentRoute: () => currentRoute
    };
})();

window.Router = Router;
