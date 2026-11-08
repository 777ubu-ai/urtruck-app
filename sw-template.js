// UrTruck Service Worker · v18 — network-first для HTML/JS, cache-first для статики,
// API never cached (otherwise stale demo cards survive deploys).
// v16 (16.08.2026): full Chinese-localization release. Every frontend release that must
// reach already-installed PWA clients bumps the cache epoch so the new bundle
// cannot remain hidden behind an older service-worker cache.
const CACHE = 'urtruck-v18-market';
const STATIC_CACHE = 'urtruck-static-v18';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== STATIC_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHTMLorJS(url) {
  const u = url.pathname || url;
  return u === '/' || u.endsWith('.html') || u.endsWith('.js') || u.endsWith('/manifest.json');
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/security/api/') || url.pathname.startsWith('/api/')) return;

  if (isHTMLorJS(url)) {
    e.respondWith(
      fetch(request)
        .then(r => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then(c => c.put(request, copy));
          }
          return r;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(r => {
      if (r && r.status === 200 && r.type === 'basic') {
        const copy = r.clone();
        caches.open(STATIC_CACHE).then(c => c.put(request, copy));
      }
      return r;
    }))
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'UrTruck', body: 'New notification', icon: '/manifest.json' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚛</text></svg>',
      badge: data.badge,
      data: data.url || '/',
      tag: data.tag || 'urtruck',
      requireInteraction: data.severity === 'critical',
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const c of clients) {
        if (c.url.includes(location.origin)) {
          c.focus();
          c.postMessage({ type: 'notification', url });
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
