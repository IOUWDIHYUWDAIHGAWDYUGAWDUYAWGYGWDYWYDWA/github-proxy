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

export function createSafeResolver(resolve = lookup) {
  return async hostname => {
    const records = await resolve(hostname, { all: true, verbatim: true });
    if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error('Hedef genel internette değil.');
    return records.find(record => record.family === 4)?.address || records[0].address;
  };
}

export function configureNetwork({ resolver = createSafeResolver(), ports = [80, 443] } = {}) {
  Object.assign(wisp.options, {
    allow_direct_ip: false,
    allow_private_ips: false,
    allow_loopback_ips: false,
    allow_udp_streams: false,
    allow_tcp_streams: true,
    port_whitelist: ports,
    stream_limit_total: 64,
    // wisp-js 0.5.0 iterates an object incorrectly when this limit is enabled.
    stream_limit_per_host: -1,
    dns_method: resolver,
    dns_ttl: 0,
    parse_real_ip: false,
    hostname_blacklist: [/^localhost\.?$/i, /\.(?:localhost|local|internal)\.?$/i]
  });
}
