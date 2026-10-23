// Service worker: apka startuje i działa bez internetu.
// Po każdej zmianie plików aplikacji podbij VERSION – telefony pobiorą nową wersję.
const VERSION = '1.0.0';
const CACHE = `zakupy-${VERSION}`;
const FIREBASE = '12.10.0';

const LOCAL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/util.js',
  'js/brands.js',
  'js/data.js',
  'js/ui.js',
  'js/gestures.js',
  'js/addbar.js',
  'js/sheets.js',
  'js/screens/common.js',
  'js/screens/home.js',
  'js/screens/store.js',
  'js/screens/edit.js',
  'js/screens/settings.js',
  'js/screens/onboarding.js',
  'vendor/qrcode.js',
  'config.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];
const REMOTE = [
  `https://www.gstatic.com/firebasejs/${FIREBASE}/firebase-app.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE}/firebase-firestore.js`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(LOCAL.map((u) => new Request(u, { cache: 'reload' })));
      await Promise.all(REMOTE.map((u) => cache.add(u).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE && key.startsWith('zakupy-')) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

// config.js najpierw z sieci (żeby zmiana konfiguracji zadziałała od razu), offline z pamięci.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(request, { cache: 'no-store' }), new Promise((_, rej) => setTimeout(rej, 4000))]);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(
        caches
          .open(CACHE)
          .then((c) => c.match('index.html'))
          .then((hit) => hit || fetch(req))
      );
      return;
    }
    if (url.pathname.endsWith('/config.js')) {
      event.respondWith(networkFirst(req));
      return;
    }
    event.respondWith(fromCache(req));
    return;
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(fromCache(req));
  }
});
