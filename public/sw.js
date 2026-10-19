// Foolscap service worker: after one visit everything works offline (the pronunciation dictionary included).
// Hashed build assets are cached forever; the page itself is fetched fresh when there is a network.
const CACHE = 'foolscap-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // lookups on the network are optional extras; never cached here
  // the page: network first (so an update arrives), cache when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); void caches.open(CACHE).then((c) => c.put('index.html', copy)); return r; }).catch(() => caches.match('index.html').then((r) => r || caches.match('./'))));
    return;
  }
  // everything else: cache first, fill the cache as it is used
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); void caches.open(CACHE).then((c) => c.put(req, copy)); }
      return r;
    })),
  );
});
