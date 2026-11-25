// Retires the service worker left in visitors' browsers by aelaa.org's previous site builder.
// That worker kept serving old cached copies of pages and scripts. When a browser checks for an
// update, it gets this file, which deletes those caches, removes itself and reloads open pages.
// Keep this file on the site for several months so returning visitors are cleaned up too.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
