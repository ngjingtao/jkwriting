/* Offline shell for the iPad home-screen app.
   Bump VERSION when you deploy changed app files. */
const VERSION = 'writing-fun-v15';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/app.css',
  '/fonts/nunito-latin.woff2',
  '/fonts/nunito-latin-ext.woff2',
  '/fonts/didact-latin.woff2',
  '/fonts/didact-latin-ext.woff2',
  '/js/app.js',
  '/js/api.js',
  '/js/practice.js',
  '/js/surface.js',
  '/js/scoring.js',
  '/js/units.js',
  '/js/glyphs.js',
  '/js/fontfit.js',
  '/js/skeleton.js',
  '/js/ui.js',
  '/js/i18n.js',
  '/js/settings.js',
  '/js/history.js',
  '/js/sound.js',
  '/js/speech.js',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await Promise.all(
        SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/hanzi/')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (url.pathname === '/api/config') {
    event.respondWith(networkFirst(req, '/api/config'));
    return;
  }

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin') || url.pathname.startsWith('/strokes')) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, '/index.html'));
    return;
  }

  event.respondWith(staleWhileRevalidate(req, event));
});

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(req)) || (fallbackUrl && (await cache.match(fallbackUrl)));
    return hit || new Response('', { status: 504 });
  }
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  const res = await network;
  return res || new Response('', { status: 504 });
}
