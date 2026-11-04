import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSafeResolver } from '../src/network.mjs';
const publicRecord = [{ address: '1.1.1.1', family: 4 }];

test('100 concurrent requests and repeated connections use one validated DNS lookup', async () => {
  let calls = 0;
  const resolver = createSafeResolver(async () => { calls++; return publicRecord; });
  const answers = await Promise.all(Array.from({ length: 100 }, () => resolver('Example.COM')));
  assert.equal(answers.length, 100);
  assert.ok(answers.every(address => address === '1.1.1.1'));
  assert.equal(await resolver('example.com'), '1.1.1.1');
  assert.equal(calls, 1);
});
test('expired DNS entries are resolved again and a rebound private address is rejected', async () => {
  let clock = 0, calls = 0;
  const resolver = createSafeResolver(async () => ++calls === 1 ? publicRecord : [{ address: '127.0.0.1', family: 4 }], { ttlMs: 30_000, now: () => clock });
  assert.equal(await resolver('example.test'), '1.1.1.1');
  clock = 29_999; assert.equal(await resolver('example.test'), '1.1.1.1');
  clock = 30_000; await assert.rejects(resolver('example.test'));
  assert.equal(calls, 2);
});
test('DNS errors are not cached and bounded storage evicts old domains', async () => {
  let calls = 0;
  const resolver = createSafeResolver(async () => { if (++calls === 1) throw new Error('temporary DNS failure'); return publicRecord; }, { maxEntries: 1 });
  await assert.rejects(resolver('a.test'));
  assert.equal(await resolver('a.test'), '1.1.1.1');
  assert.equal(await resolver('b.test'), '1.1.1.1');
  assert.equal(await resolver('a.test'), '1.1.1.1');
  assert.equal(calls, 4);
});
test('concurrent distinct domains cannot grow pending DNS work without a limit', async () => {
  let release;
  const resolver = createSafeResolver(() => new Promise(resolve => { release = resolve; }), { maxEntries: 1 });
  const first = resolver('a.test');
  await assert.rejects(resolver('b.test'), /sınırına/);
  release(publicRecord);
  assert.equal(await first, '1.1.1.1');
});
