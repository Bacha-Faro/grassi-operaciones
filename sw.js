// Service worker de Grassi Operaciones: solo recibe las notificaciones de IT (no guarda la app en caché).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: 'IT Grassi', cuerpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'IT Grassi', {
    body: d.cuerpo || '', tag: d.tag || 'it-grassi', renotify: true, requireInteraction: !!d.urgente,
    icon: 'img/isotipo.png', badge: 'img/favicon.png', data: { url: d.url || './#tickets' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './#tickets', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) if (w.url.startsWith(self.registration.scope)) { await w.focus(); return w.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
