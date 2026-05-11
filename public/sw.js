// ReOrderly Station — Service Worker
const CACHE = 'reorderly-station-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  clients.claim();
});

self.addEventListener('fetch', e => {
  // Network first — always get fresh content
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
