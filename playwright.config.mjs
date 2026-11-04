import { defineConfig } from '@playwright/test';
const testPort = Number(process.env.TEST_PROXY_PORT || 8081);
const baseURL = `http://localhost:${testPort}`;
export default defineConfig({
  testDir: './test/browser',
  timeout: 45_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  use: { baseURL, browserName: 'chromium', ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node test/e2e-server.mjs', url: `${baseURL}/healthz`, reuseExistingServer: false, timeout: 20_000 }
});
