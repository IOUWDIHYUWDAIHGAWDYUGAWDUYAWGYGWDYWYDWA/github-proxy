importScripts('/scramjet/scramjet.all.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const proxy = new ScramjetServiceWorker();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    await proxy.loadConfig();
    if (proxy.route(event)) return proxy.fetch(event);
    return fetch(event.request);
  })());
});
