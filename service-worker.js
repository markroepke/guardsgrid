// GuardsGrid service worker — offline-first caching.
// Bump CACHE_VERSION to force a refresh after a new release.
const CACHE_VERSION = 'guardsgrid-v1';

const PRECACHE_URLS = [
    './',
    './index.html',
    './favicon.svg',
    './apple-touch-icon.svg',
    './manifest.webmanifest',
    'https://fonts.googleapis.com/css2?family=Big+Shoulders+Inline+Display:wght@400;700;800;900&family=Big+Shoulders+Display:wght@400;700;800;900&family=Cinzel:wght@400;500;700;900&family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap'
];

// On install, pre-cache the shell.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// On activate, prune any old cache versions.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// Cache-first with network fallback. On offline-fetch failure, serve
// the cached index.html for navigation requests so the app still loads.
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request).then((response) => {
                // Stash successful responses (incl. font files) for next time.
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(() => {
                // Total network failure — fall back to the cached app shell.
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
