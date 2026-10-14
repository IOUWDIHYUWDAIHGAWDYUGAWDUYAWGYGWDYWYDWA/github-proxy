import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { createProxyServer } from '../server.mjs';

const infoPath = '/tmp/github-proxy-preview/info.json';
const tunnel = spawn('/tmp/cloudflared', ['tunnel', '--no-autoupdate', '--protocol', 'auto', '--url', 'http://127.0.0.1:8787'], { stdio: ['ignore', 'pipe', 'pipe'] });
let server, timer, stopped = false;
async function stop() {
  if (stopped) return;
  stopped = true; clearTimeout(timer);
  tunnel.kill('SIGTERM');
  if (server?.listening) await server.shutdown();
  process.exit(0);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
try {
  const url = await new Promise((resolve, reject) => {
    let text = '';
    const timeout = setTimeout(() => reject(new Error('Tunnel URL was not assigned')), 60_000);
    const inspect = chunk => {
      text = (text + chunk.toString()).slice(-12_000);
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    };
    tunnel.stdout.on('data', inspect); tunnel.stderr.on('data', inspect);
    tunnel.once('error', reject);
    tunnel.once('exit', () => { clearTimeout(timeout); reject(new Error('Tunnel stopped during startup')); });
  });
  const durationMs = Number(process.env.PREVIEW_DURATION_MS) || (5 * 60 * 60_000);
  const expiresAt = new Date(Date.now() + durationMs).toISOString();
  server = createProxyServer({ publicOrigin: url, sessionMs: durationMs });
  server.listen(8787, '127.0.0.1'); await once(server, 'listening');
  timer = setTimeout(stop, durationMs);
  tunnel.on('exit', stop);
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(5000) });
      if (response.ok && (await response.json()).status === 'ok') break;
    } catch {}
    if (attempt === 29) throw new Error('Public tunnel did not become healthy');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  await mkdir('/tmp/github-proxy-preview', { recursive: true });
  const runUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  await writeFile(infoPath, JSON.stringify({ url, expiresAt, runUrl }) + '\n');
  console.log(`Preview ready: ${url}; expires ${expiresAt}. Password is stored only in the repository secret.`);
} catch (error) {
  console.error(`Preview failed: ${error.message}`);
  tunnel.kill();
  if (server?.listening) await server.shutdown();
  process.exit(1);
}
