import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createProxyServer } from '../server.mjs';
import { waitForTunnelUrl, waitForTunnelHealth } from '../src/tunnel.mjs';

const infoPath = '/tmp/github-proxy-preview/info.json';
const startup = new AbortController();
let tunnel, server, timer, stopped = false;
async function stop(code = 0) {
  if (stopped) return;
  stopped = true; clearTimeout(timer); startup.abort(new Error('Preview stopped'));
  const closeTunnel = async () => {
    if (!tunnel?.pid || tunnel.exitCode !== null || tunnel.signalCode !== null) return;
    const exited = once(tunnel, 'exit');
    tunnel.kill('SIGTERM');
    const force = setTimeout(() => tunnel.kill('SIGKILL'), 3000);
    try { await exited; } finally { clearTimeout(force); }
  };
  await Promise.allSettled([closeTunnel(), server?.listening ? server.shutdown() : Promise.resolve()]);
  await Promise.allSettled([rm(infoPath, { force: true }), rm(`${infoPath}.tmp`, { force: true })]);
  process.exit(code);
}
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
try {
  const durationMs = Number(process.env.PREVIEW_DURATION_MS) || (5 * 60 * 60_000);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 2 ** 31 - 1) throw new Error('Invalid preview duration');
  await mkdir('/tmp/github-proxy-preview', { recursive: true });
  await rm(infoPath, { force: true });
  tunnel = spawn('/tmp/cloudflared', ['tunnel', '--no-autoupdate', '--protocol', 'auto', '--edge-ip-version', 'auto', '--url', 'http://127.0.0.1:8787'], { stdio: ['ignore', 'pipe', 'pipe'] });
  tunnel.on('error', () => startup.abort(new Error('Tunnel process failed')));
  tunnel.on('exit', () => {
    if (stopped) return;
    startup.abort(new Error('Tunnel stopped unexpectedly'));
    console.error('Tunnel stopped unexpectedly; preview is unavailable.');
    void stop(1);
  });
  const url = await waitForTunnelUrl(tunnel, { signal: startup.signal });
  const expiresAt = new Date(Date.now() + durationMs).toISOString();
  server = createProxyServer({ publicOrigin: url, sessionMs: durationMs });
  server.listen(8787, '127.0.0.1'); await once(server, 'listening');
  timer = setTimeout(() => stop(), durationMs);
  await waitForTunnelHealth(url, { signal: startup.signal });
  startup.signal.throwIfAborted();
  await writeFile(`${infoPath}.tmp`, JSON.stringify({ url, expiresAt, runUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` }) + '\n');
  startup.signal.throwIfAborted();
  await rename(`${infoPath}.tmp`, infoPath);
  console.log(`Preview ready: ${url}; expires ${expiresAt}. Password is stored only in the repository secret.`);
} catch (error) {
  if (!stopped) {
    console.error(`Preview failed: ${error.message}`);
    await stop(1);
  }
}
