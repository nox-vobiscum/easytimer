const CACHE_NAME = 'easytimer-shell-v10';
const APP_SHELL = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './js/timer.mjs',
    './manifest.webmanifest',
    './assets/branding/favicon.ico',
    './assets/branding/apple-touch-icon.png',
    './assets/branding/android-chrome-192x192.png',
    './assets/branding/android-chrome-512x512.png',
    './assets/branding/stopwatch-header-standard-96.png',
    './assets/branding/stopwatch-header-dark-96.png'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith('easytimer-') && key !== CACHE_NAME)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match('./index.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});
