// Älskog 3000: caches only Älskog's own shell; the machines' large files pass through.
const CACHE = 'alskog-web-3';
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'worklet.js', 'shim.js', 'icon.svg', 'icon-512.png', 'apple-touch-icon.png', 'manifest.webmanifest', 'maskiner.json'];
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('alskog-web-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const own = SHELL.some((f) => url.pathname.endsWith('/' + f.replace('./', '')) && !url.pathname.includes('/machines/'));
  if (!own) return; // machines and their samples: straight from the network
  event.respondWith(fetch(event.request).then((response) => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); } return response; }).catch(() => caches.match(event.request)));
});
