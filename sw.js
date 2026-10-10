/* Ma Collection : service worker.
   Réseau d'abord (tu as toujours la dernière version du site),
   copie locale seulement si tu n'as pas de connexion. */
const CACHE = 'ma-collection-v1';
const SHELL = ['./', 'index.html', 'style.css', 'script.js', 'config.js', 'manifest.json', 'icon.svg', 'icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Supabase, pochettes en ligne, etc. : on ne s'en mêle pas
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => {
        if (hit) return hit;
        return req.mode === 'navigate' ? caches.match('index.html') : Response.error();
      }))
  );
});
