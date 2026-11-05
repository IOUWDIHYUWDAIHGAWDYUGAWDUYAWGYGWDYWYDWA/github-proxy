importScripts('/proxy-storage.js', '/scramjet/scramjet.all.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
let configuration = Promise.resolve();
// Upstream's message handler assigns proxy.config without initializing its
// shared codecs/Wasm. Serialize a full disk reload before any proxy fetch.
// Register before the engine's own message listener.
self.addEventListener('message', event => {
  if (event.data?.scramjet$type !== 'loadConfig') return;
  event.stopImmediatePropagation();
  configuration = configuration.catch(() => {}).then(async () => {
    proxy.config = undefined;
    await proxy.loadConfig();
  });
  event.waitUntil(configuration);
});
const proxy = new ScramjetServiceWorker();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    const path = new URL(event.request.url).pathname;
    if (path.startsWith('/proxy/') || path === '/scramjet/scramjet.wasm.wasm') {
      await configuration;
      await proxy.loadConfig();
      if (proxy.route(event)) return proxy.fetch(event);
    }
    return fetch(event.request);
  })());
});
