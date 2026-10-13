import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser',
  timeout: 45_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://localhost:8081', browserName: 'chromium', ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node test/e2e-server.mjs', url: 'http://localhost:8081/healthz', reuseExistingServer: false, timeout: 20_000 }
});
