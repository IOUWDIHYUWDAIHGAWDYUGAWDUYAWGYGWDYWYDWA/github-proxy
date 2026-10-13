import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createProxyServer } from '../server.mjs';
import { isPublicAddress, createSafeResolver } from '../src/network.mjs';
import { addressToUrl } from '../public/address.mjs';

test('addresses accept web URLs and searches, reject active schemes and credentials', () => {
  assert.equal(addressToUrl('example.com'), 'https://example.com/');
  assert.equal(addressToUrl('https://example.com/path?q=x#y'), 'https://example.com/path?q=x#y');
  assert.equal(addressToUrl('bir arama'), 'https://duckduckgo.com/?q=bir%20arama');
  for (const url of ['', 'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'https://user:password@example.com/', 'https://example.com:8080/']) assert.throws(() => addressToUrl(url));
});
test('private, metadata, mapped IPv4, multicast and reserved IPs are blocked', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.0.1', '172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '192.0.2.1', 'bad']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});
test('DNS resolver rejects mixed public/private answers and rebinding', async () => {
  const mixed = createSafeResolver(async () => [{ address: '1.1.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }]);
  await assert.rejects(mixed('example.test'));
  let calls = 0;
  const resolver = createSafeResolver(async () => [{ address: calls++ ? '169.254.169.254' : '1.1.1.1', family: 4 }]);
  assert.equal(await resolver('example.test'), '1.1.1.1');
  await assert.rejects(resolver('example.test'));
});

test('authentication, CSRF, session revocation and WebSocket access', async t => {
  const server = createProxyServer({ password: 'test-password-for-ci-only' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.shutdown());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, cookie, origin = base) => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  assert.deepEqual(await (await fetch(base + '/api/session')).json(), { authenticated: false, expires: null });
  assert.equal((await post('/api/login', { username: 'proxy', password: 'test-password-for-ci-only' }, null, 'https://attacker.test')).status, 403);
  assert.equal((await post('/api/login', { username: 'proxy', password: 'wrong' })).status, 401);
  const login = await post('/api/login', { username: 'proxy', password: 'test-password-for-ci-only' });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const status = await (await fetch(base + '/api/session', { headers: { Cookie: cookie } })).json();
  assert.equal(status.authenticated, true);
  const wsUrl = base.replace('http:', 'ws:') + '/wisp/';
  async function rejected(headers, expected) {
    const ws = new WebSocket(wsUrl, { headers });
    const result = await new Promise((resolve, reject) => {
      ws.on('unexpected-response', (req, res) => { resolve(res.statusCode); res.resume(); ws.terminate(); });
      ws.on('error', () => {});
      ws.on('open', () => { ws.close(); reject(new Error('WebSocket should have been rejected')); });
    });
    assert.equal(result, expected);
  }
  await rejected({ Origin: base }, 401);
  await rejected({ Origin: 'https://attacker.test', Cookie: cookie }, 403);
  const ws = new WebSocket(wsUrl, { headers: { Origin: base, Cookie: cookie } });
  await once(ws, 'open');
  const blocked = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Private stream was not rejected')), 3000);
    const inspect = data => {
      if (data[0] === 4 && data.readUInt32LE(1) === 1) { clearTimeout(timer); ws.off('message', inspect); resolve(data[5]); }
    };
    ws.on('message', inspect);
  });
  ws.send(Buffer.concat([Buffer.from([1, 1, 0, 0, 0, 1, 80, 0]), Buffer.from('169.254.169.254')]));
  assert.notEqual(await blocked, 0);
  const closed = once(ws, 'close');
  assert.equal((await post('/api/logout', {}, cookie)).status, 200);
  await closed;
  assert.equal((await (await fetch(base + '/api/session', { headers: { Cookie: cookie } })).json()).authenticated, false);
  await rejected({ Origin: base, Cookie: cookie }, 401);
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await fetch(base + '/server.mjs')).status, 404);
});

test('login attempts are rate limited', async t => {
  const server = createProxyServer({ password: 'test-password-for-ci-only' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.shutdown());
  const base = `http://127.0.0.1:${server.address().port}`;
  for (let i = 0; i < 10; i++) assert.equal((await fetch(base + '/api/login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'proxy', password: 'bad' }) })).status, 401);
  assert.equal((await fetch(base + '/api/login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' })).status, 429);
});
