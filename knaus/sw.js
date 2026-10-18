// Network first, cache as fallback: the room works offline after one visit.
const CACHE = 'knaus-web-d9757342d3df';
const SHELL = ['./', 'index.html', 'style.css', 'tokens.css', '3000-series.css', 'app.js', 'worklet.js', 'knaus-engine.js', 'params.json',
  'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('knaus-web-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/downloads/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match(event.request)));
});
