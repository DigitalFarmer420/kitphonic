// Shared CI guards: console errors, failed requests, and the privacy rule (nothing leaves 127.0.0.1).
import { expect } from '@playwright/test';

export function watch(page, baseURL) {
  const origin = new URL(baseURL).origin;
  const errors = [], failed = [], offsite = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('request', (r) => {
    const u = r.url();
    if (/^(data|blob|about):/.test(u)) return;
    if (new URL(u).origin !== origin) offsite.push(`${r.method()} ${u}`);
  });
  page.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText || 'failed'} ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  return {
    errors, failed, offsite,
    assertClean() {
      expect(offsite, 'privacy: requests to a non-localhost origin').toEqual([]);
      expect(errors, 'console errors').toEqual([]);
      expect(failed, 'failed requests').toEqual([]);
    },
  };
}

// iPadOS Safari with Request Desktop Website (the default) reports a Mac with 5 touch points.
export async function asIpad(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
  });
}

// A tap the way the project's input works: a trusted touch on touch projects, a mouse click otherwise.
export async function tap(page, sel, hasTouch) {
  const el = page.locator(sel);
  await expect(el).toBeVisible({ timeout: 15_000 });
  const b = await el.boundingBox();
  const x = Math.round(b.x + b.width / 2), y = Math.round(b.y + b.height / 2);
  if (hasTouch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}
