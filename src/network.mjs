import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';

export function isPublicAddress(value) {
  try {
    let address = ipaddr.parse(value);
    if (address.kind() === 'ipv6' && address.isIPv4MappedAddress()) address = address.toIPv4Address();
    return address.range() === 'unicast';
  } catch { return false; }
}

export function createSafeResolver(resolve = lookup, { ttlMs = 30_000, maxEntries = 256, now = Date.now } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs < 0 || !Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('Invalid DNS cache settings');
  const cache = new Map();
  const pending = new Map();
  return async hostname => {
    const key = hostname.toLowerCase();
    const entry = cache.get(key);
    if (entry?.expires > now()) return entry.address;
    cache.delete(key);
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxEntries) throw new Error('DNS çözümleme sınırına ulaşıldı.');
    const query = (async () => {
      const records = await resolve(key, { all: true, verbatim: true });
      if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error('Hedef genel internette değil.');
      const address = records.find(record => record.family === 4)?.address || records[0].address;
      if (ttlMs > 0) {
        for (const [name, item] of cache) if (item.expires <= now()) cache.delete(name);
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
        cache.set(key, { address, expires: now() + ttlMs });
      }
      return address;
    })();
    pending.set(key, query);
    try { return await query; } finally { pending.delete(key); }
  };
}

export function configureNetwork({ resolver = createSafeResolver(), ports = null } = {}) {
  Object.assign(wisp.options, {
    allow_direct_ip: false,
    allow_private_ips: false,
    allow_loopback_ips: false,
    allow_udp_streams: false,
    allow_tcp_streams: true,
    port_whitelist: ports, // null means all TCP ports (1-65535) are allowed
    stream_limit_total: 512,
    // wisp-js 0.5.0 iterates an object incorrectly when this limit is enabled.
    stream_limit_per_host: -1,
    dns_method: resolver,
    // wisp-js measures this value in milliseconds, despite its documentation.
    // Cache validated public addresses in createSafeResolver instead.
    dns_ttl: 0,
    parse_real_ip: false,
    hostname_blacklist: [/^localhost\.?$/i, /\.(?:localhost|local|internal)\.?$/i]
  });
}
