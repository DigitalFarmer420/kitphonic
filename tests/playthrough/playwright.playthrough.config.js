// Full-map playthrough (release gate, .github/workflows/playthrough.yml). Not part of the PR checks: it plays
// 56 stops of real sessions and takes a long time. The spec serves this checkout itself (tests/playthrough/server.js). Run locally:
//   npm run test:playthrough                         (chromium, local server, perfect child)
//   KP_PT_BROWSER=webkit KP_PT_WRONG=0.15 npm run test:playthrough
//   KP_PT_BASE=https://digitalfarmer420.github.io/kitphonic/ npm run test:playthrough   (fresh profile, live site)
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const browserName = process.env.KP_PT_BROWSER || 'chromium';
const remote = !!process.env.KP_PT_BASE;

export default defineConfig({
  testDir: '.',
  testMatch: /full-playthrough\.spec\.js$/,
  retries: 0,
  workers: 1,
  timeout: +(process.env.KP_PT_TIMEOUT_MIN || 240) * 60_000,
  outputDir: `${root}test-results/playthrough-${browserName}`,
  reporter: [['list'], ['html', { open: 'never', outputFolder: `${root}playwright-report/playthrough-${browserName}` }]],
  use: { browserName, viewport: { width: 390, height: 844 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1,
    serviceWorkers: remote ? 'allow' : 'block', trace: 'off', screenshot: 'only-on-failure', video: 'off' },
});
