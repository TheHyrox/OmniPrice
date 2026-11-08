const CACHE_NAME = 'omniprice-v8';
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/styles.css',
    '/js/utils.js',
    '/js/services/api.js',
    '/js/services/toast.js',
    '/js/services/confirm.js',
    '/js/router.js',
    '/js/components/productCard.js',
    '/js/components/productDetail.js',
    '/js/components/charts.js',
    '/js/controllers/stores.js',
    '/js/controllers/alerts.js',
    '/js/controllers/settings.js',
    '/js/controllers/products.js',
    '/js/app.js',
    '/images/placeholder.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(SHELL_ASSETS).catch((err) => {
                console.warn('[SW] Cache addAll warning:', err.message);
            });
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Network-First with Cache Fallback for instant updates and offline resiliency
self.addEventListener('fetch', (event) => {
    // Skip non-GET or API requests
    if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return caches.match('/index.html');
                    }
                    return new Response('', { status: 404, statusText: 'Not Found' });
                });
            })
    );
});

// Web Push Notification Event
self.addEventListener('push', (event) => {
    let payload = {
        title: 'OmniPrice Price Alert',
        body: 'A price update was detected on your tracked products!',
        icon: '/images/placeholder.svg',
        data: { url: '/' }
    };

    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload.body = event.data.text();
        }
    }

    const options = {
        body: payload.body,
        icon: payload.icon || '/images/placeholder.svg',
        badge: '/images/placeholder.svg',
        data: payload.data || { url: '/' },
        vibrate: [200, 100, 200]
    };

    event.waitUntil(
        self.registration.showNotification(payload.title, options)
    );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
