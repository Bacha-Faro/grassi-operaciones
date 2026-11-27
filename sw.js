// La app instalada desde la dirección vieja tenía guardada una copia en el celular o la compu.
// Este "service worker" reemplaza al viejo: borra esa copia, se da de baja y manda cada ventana abierta a la dirección nueva.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) {
      const h = new URL(c.url).hash;
      c.navigate('https://grassi-operaciones.pages.dev/' + h);
    }
  })());
});
