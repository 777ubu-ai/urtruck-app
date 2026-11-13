/*
 * Public information site worker. It deliberately stores no page/API data.
 * On activation it retires only the old UrTruck web-shell caches and keeps a
 * push handler for already registered browser subscriptions.
 */
const PUBLIC_CACHE = 'urtruck-public-info-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => /^(urtruck-v\d+-|urtruck-static-v\d+|urtruck-info-)/.test(key) && key !== PUBLIC_CACHE)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/security/') || url.pathname.startsWith('/storage/')) return;
  // The new public site is network-only: old app-shell HTML is never served as
  // an offline fallback. The worker does not cache auth, API or file responses.
  event.respondWith(fetch(request, { cache: 'no-store' }));
});

self.addEventListener('push', (event) => {
  let data = { title: 'UrTruck', body: 'New notification', icon: '/manifest.json' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { /* Keep safe fallback. */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚛</text></svg>',
    badge: data.badge,
    data: data.url || data.data?.url || '/',
    tag: data.tag || data.data?.event_id || data.data?.event_key || undefined,
    requireInteraction: data.severity === 'critical',
    vibrate: [200, 100, 200],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((clients) => {
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin)) {
        client.focus();
        client.postMessage({ type: 'notification', url: target });
        return;
      }
    }
    return self.clients.openWindow(target);
  }));
});
