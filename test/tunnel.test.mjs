import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { waitForTunnelUrl, waitForTunnelHealth } from '../src/tunnel.mjs';
function child() {
  return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null });
}
test('tunnel discovery handles split log chunks, removes listeners and continues draining logs', async () => {
  const process = child();
  const ready = waitForTunnelUrl(process);
  process.stderr.write('Tunnel created: https://some-name.try');
  process.stderr.write('cloudflare.com\n');
  assert.equal(await ready, 'https://some-name.trycloudflare.com');
  assert.equal(process.listenerCount('error'), 0);
  assert.equal(process.listenerCount('exit'), 0);
  assert.equal(process.stderr.listenerCount('data'), 0);
  process.stderr.write('x'.repeat(100_000));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(process.stderr.readableLength, 0);
});
test('startup discovery fails promptly on exit, spawn failure, cancellation and timeout', async () => {
  for (const event of ['exit', 'error']) {
    const process = child();
    const ready = waitForTunnelUrl(process);
    process.emit(event, new Error('failed'));
    await assert.rejects(ready);
  }
  const process = child(), cancel = new AbortController();
  const ready = waitForTunnelUrl(process, { signal: cancel.signal });
  cancel.abort(new Error('cancelled'));
  await assert.rejects(ready, /cancelled/);
  await assert.rejects(waitForTunnelUrl(child(), { timeoutMs: 10 }), /in time/);
});
test('health warm-up retries transient failures, releases rejected response bodies and accepts only ready JSON', async () => {
  let calls = 0, cancelled = 0;
  await waitForTunnelHealth('https://test.trycloudflare.com', { retryDelayMs: 1, fetchImpl: async () => {
    calls++;
    if (calls === 1) throw new Error('DNS not propagated');
    if (calls === 2) return { ok: false, body: { cancel: async () => { cancelled++; } } };
    return { ok: true, json: async () => ({ status: 'ok' }) };
  } });
  assert.equal(calls, 3); assert.equal(cancelled, 1);
});
test('health probing respects a total deadline and caller cancellation', async () => {
  await assert.rejects(waitForTunnelHealth('https://test.trycloudflare.com', { timeoutMs: 20, retryDelayMs: 2, fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'not ready' }) }) }), /deadline/);
  const cancel = new AbortController();
  const ready = waitForTunnelHealth('https://test.trycloudflare.com', { signal: cancel.signal, fetchImpl: async () => { cancel.abort(new Error('stopped')); throw new Error(); } });
  await assert.rejects(ready, /stopped/);
});
