import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createProxyServer } from '../server.mjs';

test('Minecraft TCP proxy endpoint returns capabilities, blocks private IPs and answers WebSocket ping', async t => {
  const server = createProxyServer({ password: '@hmet355' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.shutdown());

  const base = `http://127.0.0.1:${server.address().port}`;

  // 1. Capabilities check + CORS check
  const infoRes = await fetch(`${base}/api/vm/net/connect`, {
    headers: { Origin: 'https://s.mcraft.fun' }
  });
  assert.equal(infoRes.status, 200);
  assert.equal(infoRes.headers.get('access-control-allow-origin'), '*');
  const info = await infoRes.json();
  assert.equal(info.version, '0.0.4');
  assert.equal(info.capabilities.ping, true);

  // 2. Private IP SSRF protection
  const privateRes = await fetch(`${base}/api/vm/net/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://s.mcraft.fun' },
    body: JSON.stringify({ host: '127.0.0.1', port: 25565 })
  });
  assert.equal(privateRes.status, 403);

  // 3. WebSocket ping endpoint check
  const ws = new WebSocket(`${base.replace('http:', 'ws:')}/api/vm/net/ping`);
  await once(ws, 'open');
  ws.send('ping:42');
  const [reply] = await once(ws, 'message');
  assert.match(reply.toString(), /^pong:42:/);
  ws.close();
});
