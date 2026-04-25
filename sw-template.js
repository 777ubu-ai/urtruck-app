// UrTruck Service Worker · v4 — network-first для HTML/JS, cache-first для остального
const CACHE = 'urtruck-v5-market';
const STATIC_CACHE = 'urtruck-static-v5';

self.addEventListener('install', (e) => {
  // Сразу активируем новый SW без ожидания закрытия вкладок
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

  // Security API — всегда сеть, не кешируем
  if (url.pathname.startsWith('/security/api/')) return;

  // HTML и JS — network-first (чтобы обновлялся bundle без залипания)
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

  // Картинки/шрифты/прочая статика — cache-first (быстро)
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

// Push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'UrTruck', body: 'Новое уведомление', icon: '/manifest.json' };
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
