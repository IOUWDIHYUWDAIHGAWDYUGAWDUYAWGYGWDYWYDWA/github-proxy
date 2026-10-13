import { chromium } from '@playwright/test';
import { readFile, appendFile, mkdir, writeFile } from 'node:fs/promises';
const info = JSON.parse(await readFile('/tmp/github-proxy-preview/info.json', 'utf8'));
const browser = await chromium.launch();
let page;
try {
  page = await browser.newPage();
  await page.goto(info.url);
  await page.getByLabel('Şifre', { exact: true }).fill(process.env.PROXY_PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.getByText('Oturum açık', { exact: true }).waitFor({ timeout: 15_000 });
  await page.getByRole('textbox', { name: 'Site adresi veya arama' }).fill('https://discord.com/');
  await page.getByRole('button', { name: 'Aç', exact: false }).click();
  await page.waitForFunction(() => document.querySelector('#viewport iframe')?.contentDocument?.body?.innerText?.trim().length > 20, null, { timeout: 45_000 });
  const frame = page.frames().find(item => item.parentFrame());
  const text = await frame.locator('body').innerText();
  if (/UnknownIssuer|Hyper client:|Proxy encountered an error|failed to fetch/i.test(text)) throw new Error('Discord did not render through the public tunnel');
  console.log('Public HTTPS tunnel, login and Discord proxy rendering passed.');
  await page.getByRole('button', { name: 'Çıkış', exact: true }).click();
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Manual development preview\n\n[Open the proxy](${info.url})\n\nUser: proxy. Password: repository PROXY_PASSWORD secret (same as the local .env).\n\nExpires: ${info.expiresAt}. No automatic restart.\n\nPublic tunnel, login and Discord rendering were verified.\n`);
} catch (error) {
  await mkdir('artifacts/preview-diagnostics', { recursive: true });
  if (page) {
    // Password inputs are masked in screenshots; values are never serialized.
    await page.screenshot({ path: 'artifacts/preview-diagnostics/page.png', fullPage: true });
    const details = await page.evaluate(() => ({
      title: document.title, status: document.getElementById('status')?.textContent,
      loginError: document.getElementById('login-error')?.textContent,
      browserHidden: document.getElementById('browser')?.hidden,
      addressPresent: Boolean(document.getElementById('address')),
      addressVisible: Boolean(document.getElementById('address')?.getClientRects().length)
    }));
    await writeFile('artifacts/preview-diagnostics/details.json', JSON.stringify(details, null, 2));
    console.log('Preview UI diagnostics:', JSON.stringify(details));
  }
  throw error;
} finally { await browser.close(); }
