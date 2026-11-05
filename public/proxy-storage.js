// Scramjet 1.1.0 opens its database in both the page and the service worker,
// but only the controller creates stores. A worker opening first leaves an
// empty version-1 database permanently. Bootstrap the schema in either realm.
// Keep the old database untouched; other apps may also use "$scramjet".
(() => {
  const marker = Symbol.for('github-proxy.storage');
  const factory = IDBFactory.prototype;
  if (factory[marker]) return;
  const open = factory.open;
  const stores = ['config', 'cookies', 'redirectTrackers', 'referrerPolicies', 'publicSuffixList'];
  Object.defineProperty(factory, marker, { value: true });
  factory.open = function (name, version) {
    if (name !== '$scramjet') return open.apply(this, arguments);
    // Version 2 also upgrades an incomplete version-1 app database, without
    // deleting existing stores or their records. Every engine realm uses this.
    const request = open.call(this, '$github-proxy-scramjet', 2);
    request.addEventListener('upgradeneeded', () => {
      for (const store of stores) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
      }
    });
    request.addEventListener('success', () => {
      const db = request.result;
      db.addEventListener('versionchange', () => db.close());
    });
    return request;
  };
})();
