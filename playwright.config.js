import { defineConfig } from '@playwright/test';

// Static server only (tools/serve.mjs binds 127.0.0.1). Each test gets a new
// browser context — Playwright's default. No storageState, no shared cookies,
// and no reporter that sends results anywhere but the local report files.
const port = +process.env.KP_E2E_PORT || 4173; // CI uses 4173; local runs can pick another port
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
    // iPadOS requests the desktop site (Macintosh UA) while still reporting a touch screen.
    // 1024×1366 and 820×1180 are portrait; 1180×820 is landscape.
    ...[
      ['1024x1366', 1024, 1366],
      ['820x1180', 820, 1180],
      ['1180x820', 1180, 820],
    ].map(([name, width, height]) => ({
      name: `webkit-ipados-${name}`,
      testMatch: /ipad-trace\.spec\.js/,
      use: {
        browserName: 'webkit',
        viewport: { width, height },
        hasTouch: true,
        isMobile: false,
        deviceScaleFactor: 2,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
      },
    })),
  ],
});
