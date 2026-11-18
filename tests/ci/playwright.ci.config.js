// CI-only Playwright projects for .github/workflows/pr-checks.yml (smoke, tracing, sweep, uiux, visual).
// The existing `npm run test:e2e` (playwright.config.js) is unchanged and still runs as the "e2e" job.
// Run one group locally:  KP_CI_PORT=20611 npx playwright test -c tests/ci/playwright.ci.config.js --project 'smoke-*'
// Static server only (tools/serve.mjs binds 127.0.0.1). Fresh context per test. Reports stay on the machine.
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const port = +process.env.KP_CI_PORT || 4310;
const baseURL = `http://127.0.0.1:${port}`;
export const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

// iPad as Safari reports it (Request Desktop Website, the default): Mac UA, touch, DPR 2. Specs that need
// navigator.platform 'MacIntel' + maxTouchPoints 5 add them with an init script (metadata.ipad).
const ipad = (w, h) => ({ browserName: 'webkit', viewport: { width: w, height: h }, userAgent: MAC_UA, hasTouch: true, isMobile: false, deviceScaleFactor: 2 });
const iphone = { browserName: 'webkit', viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };
const desktop = (browserName) => ({ browserName, viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 });
const android = { browserName: 'chromium', viewport: { width: 412, height: 915 }, userAgent: ANDROID_UA, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

// Uiux sizes (PM, Nov 17): phones, phone landscape, iPads, laptop. Both engines. Touch on everything below 1280.
export const UIUX_SIZES = [[320, 568], [360, 780], [390, 844], [430, 932], [568, 320], [844, 390], [768, 1024], [820, 1180], [1180, 820], [1280, 800]];
const sized = (browserName, w, h) => ({ browserName, viewport: { width: w, height: h }, hasTouch: w < 1280, isMobile: false, deviceScaleFactor: 1 });

const TRACE_SPECS = /(tests\/ci\/finger-trace|tests\/e2e\/trace|tests\/e2e\/ipad-trace)\.spec\.js$/;

export default defineConfig({
  testDir: '..',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 45_000,
  outputDir: `${root}test-results/ci`,
  snapshotPathTemplate: '{testDir}/ci/__screenshots__/{projectName}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.2, animations: 'disabled', caret: 'hide', scale: 'css' } },
  reporter: [
    ['list'],
    ['json', { outputFile: `${root}test-results/ci-${process.env.KP_CI_GROUP || 'all'}.json` }],
    ['html', { open: 'never', outputFolder: `${root}playwright-report/ci-${process.env.KP_CI_GROUP || 'all'}` }],
  ],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' },
  webServer: {
    command: 'node tools/serve.mjs',
    cwd: root,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PORT: String(port) },
  },
  projects: [
    // smoke: load, main learning flow, no console errors, nothing leaves localhost
    { name: 'smoke-desktop-chromium', testMatch: /ci\/smoke\.spec\.js$/, use: desktop('chromium') },
    { name: 'smoke-desktop-webkit', testMatch: /ci\/smoke\.spec\.js$/, use: desktop('webkit') },
    { name: 'smoke-android-chromium', testMatch: /ci\/smoke\.spec\.js$/, use: android },
    { name: 'smoke-iphone-webkit', testMatch: /ci\/smoke\.spec\.js$/, use: iphone },
    { name: 'smoke-ipad-webkit', testMatch: /ci\/smoke\.spec\.js$/, metadata: { ipad: true }, use: ipad(820, 1180) },
    // tracing: finger, Apple Pencil and mouse. ipad-trace.spec.js runs only on projects named webkit-ipados-*.
    { name: 'webkit-ipados-820x1180', testMatch: TRACE_SPECS, metadata: { ipad: true }, retries: 1, use: ipad(820, 1180) },
    { name: 'webkit-ipados-1180x820', testMatch: TRACE_SPECS, metadata: { ipad: true }, retries: 1, use: ipad(1180, 820) },
    { name: 'trace-iphone-webkit', testMatch: TRACE_SPECS, retries: 1, use: iphone },
    { name: 'trace-ipad-chromium', testMatch: TRACE_SPECS, retries: 1, use: { browserName: 'chromium', viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
    { name: 'trace-desktop-chromium', testMatch: TRACE_SPECS, retries: 1, use: desktop('chromium') },
    { name: 'trace-desktop-webkit', testMatch: TRACE_SPECS, retries: 1, use: desktop('webkit') },
    // KP-BUG-003 miss-then-replay sweep (every word-card word, plus picture-check controls)
    { name: 'sweep-android-chromium', testMatch: /ci\/kp-bug-003-sweep\.spec\.js$/, use: android },
    { name: 'sweep-iphone-webkit', testMatch: /ci\/kp-bug-003-sweep\.spec\.js$/, use: iphone },
    // Uiux layout checks (report-only job) and committed-baseline screenshots (visual job)
    ...['webkit', 'chromium'].flatMap((b) => UIUX_SIZES.map(([w, h]) => ({ name: `uiux-${b}-${w}x${h}`, testMatch: /ci\/uiux\.spec\.js$/, use: sized(b, w, h) }))),
    ...['webkit', 'chromium'].flatMap((b) => UIUX_SIZES.map(([w, h]) => ({ name: `visual-${b}-${w}x${h}`, testMatch: /ci\/visual\.spec\.js$/, use: sized(b, w, h) }))),
  ],
});
