import { setTimeout as sleep } from 'node:timers/promises';

export function waitForTunnelUrl(child, { timeoutMs = 60_000, signal } = {}) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', inspect); child.stderr.off('data', inspect);
      child.off('error', onError); child.off('exit', onExit);
      signal?.removeEventListener('abort', onAbort);
      // Keep consuming logs after discovery so pipe backpressure cannot stall cloudflared.
      child.stdout.resume(); child.stderr.resume();
    };
    const finish = (error, url) => { cleanup(); error ? reject(error) : resolve(url); };
    const inspect = chunk => {
      buffer = (buffer + chunk.toString()).slice(-12_000);
      const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com(?=[\s/]|$)/);
      if (match) finish(null, match[0]);
    };
    const onError = () => finish(new Error('Tunnel process could not be started'));
    const onExit = () => finish(new Error('Tunnel stopped during startup'));
    const onAbort = () => finish(signal.reason || new Error('Tunnel startup cancelled'));
    const timer = setTimeout(() => finish(new Error('Tunnel URL was not assigned in time')), timeoutMs);
    child.stdout.on('data', inspect); child.stderr.on('data', inspect);
    child.once('error', onError); child.once('exit', onExit);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else if (child.exitCode !== null && child.exitCode !== undefined) onExit();
  });
}

export async function waitForTunnelHealth(url, { fetchImpl = fetch, timeoutMs = 90_000, signal, retryDelayMs = 250 } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const lifetime = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let attempts = 0;
  while (!lifetime.aborted) {
    try {
      const response = await fetchImpl(`${url}/healthz`, { signal: AbortSignal.any([lifetime, AbortSignal.timeout(5000)]), cache: 'no-store' });
      if (response.ok) {
        if ((await response.json()).status === 'ok') return;
      } else await response.body?.cancel();
    } catch { /* Retry DNS propagation and edge warm-up within the shared deadline. */ }
    const delay = Math.min(2000, retryDelayMs * 2 ** Math.min(attempts++, 4));
    try { await sleep(delay, undefined, { signal: lifetime }); } catch { break; }
  }
  if (signal?.aborted) throw signal.reason || new Error('Tunnel startup cancelled');
  throw new Error('Public tunnel did not become healthy before the deadline');
}
