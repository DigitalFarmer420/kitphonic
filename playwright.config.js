import { defineConfig } from '@playwright/test';

// Static server only (tools/serve.mjs binds 127.0.0.1). Each test gets a new
// browser context — Playwright's default. No storageState, no shared cookies,
// and no reporter that sends results anywhere but the local report files.
const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;
const touch = { hasTouch: true, isMobile: true, deviceScaleFactor: 1 };

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { PORT: String(port) },
  },
  projects: [
    { name: 'webkit-ipad-landscape', use: { browserName: 'webkit', viewport: { width: 1376, height: 1032 }, ...touch } },
    { name: 'webkit-ipad-portrait', use: { browserName: 'webkit', viewport: { width: 1032, height: 1376 }, ...touch } },
    { name: 'webkit-phone', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, ...touch } },
    { name: 'webkit-desktop', use: { browserName: 'webkit', viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 } },
    { name: 'chromium-ipad-landscape', use: { browserName: 'chromium', viewport: { width: 1376, height: 1032 }, ...touch } },
    { name: 'chromium-ipad-portrait', use: { browserName: 'chromium', viewport: { width: 1032, height: 1376 }, ...touch } },
    { name: 'chromium-phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, ...touch } },
    { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 } },
  ],
});
