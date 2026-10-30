const CACHE_NAME = 'easytimer-shell-v62';
const APP_SHELL = [
    './',
    './index.html',
    './about.html',
    './faq.html',
    './imprint.html',
    './privacy.html',
    './js/info.js?v=59',
    './js/header.mjs?v=59',
    './css/styles.css?v=62',
    './js/app.js?v=62',
    './js/recovery.mjs?v=54',
    './js/planner.js?v=55',
    './js/templates.mjs?v=37',
    './js/timer.mjs?v=54',
    './js/session.mjs?v=54',
    './js/time-visuals.mjs?v=54',
    './js/portability.mjs?v=37',
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
            fetch(event.request).catch(async () => {
                const pages = ['about.html', 'faq.html', 'imprint.html', 'privacy.html'];
                const page = pages.find(name => url.pathname === new URL(name, self.registration.scope).pathname);
                if (page) return (await caches.match(new URL(page, self.registration.scope).href)) || Response.error();
                return caches.match('./index.html');
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});
