// Bounded integration test for the proxy's public HTTPS/TLS path, not a service.
import { chromium } from '@playwright/test';
import { lookup } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createProxyServer } from '../server.mjs';

const sites = { discord: 'https://discord.com/', roblox: 'https://www.roblox.com/', wikipedia: 'https://www.wikipedia.org/' };
const url = sites[process.env.TEST_SITE || 'discord'];
if (!url) throw new Error('TEST_SITE discord, roblox veya wikipedia olmalı.');
const report = { site: url, checkedAt: new Date().toISOString(), dns: 'not tested', https: 'not tested', proxyBrowser: 'not tested' };
const directory = 'artifacts/connectivity';
await mkdir(directory, { recursive: true });
try {
  const records = await lookup(new URL(url).hostname, { all: true });
  report.dns = `${records.length} DNS address(es) resolved`;
} catch (error) { report.dns = `failed: ${error.code || 'DNS error'}`; }
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  report.https = `HTTP ${response.status}; TLS certificate validation enabled`;
  await response.body?.cancel();
} catch (error) { report.https = `failed: ${error.cause?.code || error.name}`; }

const password = randomBytes(24).toString('hex');
const server = createProxyServer({ password, publicOrigin: undefined });
let browser;
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.getByRole('textbox', { name: 'Site adresi veya arama' }).fill(url);
  await page.getByRole('button', { name: 'Aç', exact: false }).click();
  await page.waitForFunction(() => document.querySelector('#viewport iframe')?.contentDocument?.body?.innerText?.trim().length > 20, null, { timeout: 45_000 });
  const frame = page.frames().find(item => item.parentFrame());
  const text = await frame.locator('body').innerText();
  const applicationError = await page.locator('#browser-error').textContent();
  const engineError = /UnknownIssuer|Hyper client:|Proxy encountered an error|failed to fetch/i.test(text);
  report.proxyBrowser = engineError || applicationError ? 'failed: application/transport error' : 'page rendered inside the proxy; site functionality is not fully tested';
  report.pageTitle = (await frame.title()).slice(0, 120);
  if (engineError) report.transportError = text.match(/UnknownIssuer|Hyper client:[^\n]{0,180}|failed to fetch/i)?.[0] || 'proxy error';
  await page.screenshot({ path: `${directory}/website.png`, fullPage: true });
  if (engineError || applicationError) process.exitCode = 1;
} catch (error) {
  report.proxyBrowser = `failed: ${error.name}`;
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.shutdown();
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    // JSON is encoded to keep remote titles from injecting Markdown directives.
    const escaped = JSON.stringify(report, null, 2).replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('`', '\\u0060');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Website connectivity test\n\n\`\`\`json\n${escaped}\n\`\`\`\n\nScreenshot and JSON report: site-connectivity-results artifact.\n\nThis job tests the application and terminates. It does not expose a live proxy or tunnel.\n`);
  }
}
