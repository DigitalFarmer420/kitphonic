import { test, expect, chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// Chrome's own installability verdict for the app served under a GitHub Pages style subpath
// (/kitphonic/ and /kitphonic-dev/), with the service worker on (?sw=1, as on the real site).
// A persistent profile is used because Chrome reports "in-incognito" for throwaway contexts.
const root = fileURLToPath(new URL('../..', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };

test.describe('web app install (Android Chrome)', () => {

  let server;
  let origin;
  test.beforeAll(async () => {
    server = createServer(async (req, res) => {
      try {
        const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const m = path.match(/^\/(kitphonic|kitphonic-dev)(\/.*)$/);
        if (!m) throw 0;
        let f = join(root, normalize(m[2]).replace(/^(\.\.[/\\])+/, ''));
        if (!f.startsWith(root)) throw 0;
        if ((await stat(f)).isDirectory()) f = join(f, 'index.html');
        res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(await readFile(f));
      } catch { res.writeHead(404); res.end('not found'); }
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  test.afterAll(async () => { await new Promise(r => server.close(r)); });

  for (const path of ['/kitphonic/', '/kitphonic-dev/']) {
    test(`${path} is installable with no errors`, async () => {
      test.skip(test.info().project.name !== 'chromium-phone', 'one Chromium project is enough');
      const profile = mkdtempSync(join(tmpdir(), 'kp-pwa-'));
      const ctx = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
      try {
        const page = ctx.pages()[0] || await ctx.newPage();
        await page.goto(`${origin}${path}?sw=1`);
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
        const cdp = await ctx.newCDPSession(page);
        const { url, errors, data } = await cdp.send('Page.getAppManifest');
        expect(url).toBe(`${origin}${path}manifest.webmanifest`);
        expect(errors).toEqual([]);
        const parsed = JSON.parse(data);
        expect(parsed.start_url).toBe('./');
        let installabilityErrors = [];
        await expect.poll(async () => {
          ({ installabilityErrors } = await cdp.send('Page.getInstallabilityErrors'));
          return installabilityErrors.map(e => e.errorId);
        }, { timeout: 15_000 }).toEqual([]);
        const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => r.scope));
        expect(scopes).toEqual([`${origin}${path}`]);
      } finally {
        await ctx.close();
        rmSync(profile, { recursive: true, force: true });
      }
    });
  }
});
