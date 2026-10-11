/* Offline shell for Gongfu Timer. Bump CACHE when the shell files change. */

const CACHE = 'gongfu-v4';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    const fromNetwork = fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);

    // Navigations prefer fresh markup so edits show up; assets load from cache
    // first and refresh themselves in the background.
    if (req.mode === 'navigate') {
      return (await fromNetwork) || cached || cache.match('./index.html');
    }

    return cached || (await fromNetwork) || Response.error();
  })());
});

// The completion notification carries a "start next" button. The page is still
// alive whenever this fires — a frozen page could not have posted the
// notification — so handing the action to an open client is enough.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const startNext = event.action === 'start-next';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((c) => c.url.startsWith(self.registration.scope)) || windows[0];

    if (client) {
      if (startNext) client.postMessage({ action: 'start-next' });
      if ('focus' in client) await client.focus();
      return;
    }
    await self.clients.openWindow('./');
  })());
});
