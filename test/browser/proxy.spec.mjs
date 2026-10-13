import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';

async function login(page) {
  await page.goto('/');
  await page.getByLabel('Şifre', { exact: true }).fill('test-password-for-ci-only');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Oturum açık', { exact: true })).toBeVisible();
}
async function openFixture(page) {
  await page.getByRole('textbox', { name: 'Site adresi veya arama' }).fill('http://proxy-fixture.test/');
  await page.getByRole('button', { name: 'Aç', exact: false }).click();
  const frame = page.frameLocator('#viewport iframe');
  await expect(frame.getByRole('heading', { name: 'Proxy fixture' })).toBeVisible();
  return frame;
}
test('login, scripted page and link navigation stay in the proxy', async ({ page }) => {
  await login(page);
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  const frame = await openFixture(page);
  await expect(frame.locator('#script')).toHaveText('JavaScript works: proxy-fixture.test');
  expect(page.frames().find(f => f.parentFrame()).url()).toContain('/proxy/');
  expect(requests.some(url => url.startsWith('http://proxy-fixture.test'))).toBe(false);
  await frame.getByRole('link', { name: 'Second page' }).click();
  await expect(frame.getByRole('heading', { name: 'Second page' })).toBeVisible();
  await page.getByRole('button', { name: 'Geri', exact: true }).click();
  await expect(frame.getByRole('heading', { name: 'Proxy fixture' })).toBeVisible();
  await page.getByRole('button', { name: 'Çıkış', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
  await expect(page.locator('#viewport iframe')).toHaveCount(0);
});
test('file uploads and downloads pass through the proxy', async ({ page }) => {
  await login(page);
  const frame = await openFixture(page);
  await frame.getByLabel('Test file').setInputFiles({ name: 'hello.txt', mimeType: 'text/plain', buffer: Buffer.from('upload via proxy') });
  await frame.getByRole('button', { name: 'Upload file' }).click();
  await expect(frame.locator('#result')).toContainText('upload via proxy');
  const pending = page.waitForEvent('download');
  await frame.getByRole('link', { name: 'Download file' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('proxy-test.txt');
  expect(await readFile(await download.path(), 'utf8')).toBe('download via proxy');
  const pendingAttachment = page.waitForEvent('download');
  await frame.getByRole('link', { name: 'Download attachment' }).click();
  const attachment = await pendingAttachment;
  expect(attachment.suggestedFilename()).toBe('proxy-test.txt');
  expect(await readFile(await attachment.path(), 'utf8')).toBe('download via proxy');
});
test('target cookies are emulated and proxy authentication is not sent upstream', async ({ page }) => {
  await login(page);
  const frame = await openFixture(page);
  await frame.getByRole('link', { name: 'Cookie test' }).click();
  await expect(frame.getByRole('heading', { name: 'Cookie set' })).toBeVisible();
  await frame.getByRole('link', { name: 'Inspect cookie' }).click();
  await expect(frame.locator('#cookie-report')).toContainText('target_cookie=fixture-value');
  await expect(frame.locator('#cookie-report')).not.toContainText('gp_session');
});
test('interface fits desktop and mobile, invalid URLs report errors', async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.goto('/');
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
  await login(page);
  await page.getByRole('textbox', { name: 'Site adresi veya arama' }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Aç', exact: false }).click();
  await expect(page.locator('#browser-error')).toContainText('Yalnız http ve https');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a delayed initial session response cannot undo a successful login', async ({ page }) => {
  let release, started, finished;
  const gate = new Promise(resolve => { release = resolve; });
  const initialStarted = new Promise(resolve => { started = resolve; });
  const initialFinished = new Promise(resolve => { finished = resolve; });
  let first = true;
  await page.route('**/api/session', async route => {
    if (!first) return route.continue();
    first = false;
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
    finished();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await initialStarted;
  await page.getByLabel('Şifre', { exact: true }).fill('test-password-for-ci-only');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Oturum açık', { exact: true })).toBeVisible();
  release(); await initialFinished;
  const frame = await openFixture(page);
  await expect(frame.getByRole('heading', { name: 'Proxy fixture' })).toBeVisible();
});
