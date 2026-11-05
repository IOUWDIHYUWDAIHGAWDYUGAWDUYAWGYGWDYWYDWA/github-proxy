importScripts('/scramjet/scramjet.all.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const proxy = new ScramjetServiceWorker();

// Config'i en başta arka planda hazırla, her fetch'te bekleme yapmasın (Instant Fetch)
const configPromise = proxy.loadConfig();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(Promise.all([self.clients.claim(), configPromise])));

self.addEventListener('fetch', event => {
  if (proxy.route(event)) {
    event.respondWith((async () => {
      await configPromise;
      return proxy.fetch(event);
    })());
  }
});
