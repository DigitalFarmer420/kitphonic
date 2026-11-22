import { test, expect } from '@playwright/test';
import { step, visibleScreen, mulberry32 } from '../playthrough/child.js';

// Grown-ups lesson preview (Vinh, Nov 21): press and hold a locked future lesson, play it through (with misses),
// and come back. The device's localStorage must be byte-identical and the map still on the same current stop.
const snapshot = () => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));
const mapReady = () => !document.getElementById('map').hidden && document.querySelectorAll('#m-stops > .stop').length === 56;
const URL = '/?skipHello=1&reducedMotion=1&seed=3';

async function seedChild(page, passed) { // a real saved child (not the in-memory ?progress mode)
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(mapReady, null, { timeout: 20_000 });
  await page.evaluate(async (n) => {
    const { seedProgress } = await import('/js/dev-seed.js');
    localStorage.setItem('kitphonic.v1.responses', JSON.stringify(seedProgress(n).map(({ seeded, ...r }) => r)));
    localStorage.setItem('kitphonic.v1.seen', JSON.stringify({ go: 4, intro: 3, soundTap: 3, hunt: 3 }));
    localStorage.setItem('kitphonic.v1.settings', JSON.stringify({ sessionMinutes: 5, audioSpeed: 'normal' }));
  }, passed);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(mapReady, null, { timeout: 20_000 });
}
async function holdOn(page, locator, ms) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}
async function openGrownUps(page) { // the real gate: press and hold the map gear for 2 s
  await holdOn(page, page.locator('#m-gear'), 2300);
  await page.waitForFunction(() => !document.getElementById('parent').hidden && document.querySelectorAll('.plesson').length === 56, null, { timeout: 10_000 });
}

test('press and hold a locked lesson in Grown-ups: plays through, nothing saved, map unchanged', async ({ page }) => {
  test.setTimeout(240_000);
  await seedChild(page, 12);
  const before = await page.evaluate(() => ({ index: window.kitphonic.map().index, n: window.kitphonic.store.all().length }));
  expect(before.index).toBe(12);
  await openGrownUps(page);
  const ls0 = await page.evaluate(snapshot);

  // a short tap does not open a preview, only a hint
  const target = page.locator('.plesson[data-i="19"]'); // sound "g": locked, well ahead of stop 13
  await expect(target).toHaveClass(/upcoming/);
  await target.scrollIntoViewIfNeeded(); await target.click();
  await expect(page.locator('#pl-hint')).toHaveText(/Press and hold/);
  await page.waitForTimeout(900);
  expect(await visibleScreen(page)).toBe('parent');
  expect(await page.evaluate(() => window.kitphonic.preview.active)).toBe(false);

  // press and hold opens it
  await holdOn(page, target, 1000);
  await page.waitForFunction(() => window.kitphonic.preview.active && document.getElementById('parent').hidden, null, { timeout: 10_000 });
  await expect(page.locator('#preview-badge')).toBeVisible();
  const mid = await page.evaluate(() => ({ stop: window.kitphonic.preview.stop?.id, previewIndex: window.kitphonic.map().index }));
  expect(mid.stop).toBe('sound:g');
  expect(mid.previewIndex).toBe(19); // the preview child is at the chosen stop
  expect(await page.evaluate(snapshot)).toBe(ls0);

  // play the whole lesson (some wrong picks) until it hands back to Grown-ups
  const rng = mulberry32(7), seen = [];
  const t0 = Date.now();
  for (;;) {
    const scr = await visibleScreen(page);
    if (scr === 'parent') break;
    if (seen.at(-1) !== scr) seen.push(scr);
    expect(Date.now() - t0, `stuck on ${scr}`).toBeLessThan(200_000);
    await step(page, scr, rng, 0.35);
  }
  expect(seen).toEqual(expect.arrayContaining(['lesson', 'letters']));
  await expect(page.locator('#preview-badge')).toBeHidden();
  expect(await page.evaluate(() => window.kitphonic.preview.active)).toBe(false);
  expect(await page.evaluate(snapshot)).toBe(ls0);

  // close Grown-ups: the map is on the same stop
  await page.locator('#pa-close').click();
  await page.waitForFunction(mapReady, null, { timeout: 10_000 });
  const after = await page.evaluate(() => ({ index: window.kitphonic.map().index, n: window.kitphonic.store.all().length }));
  expect(after).toEqual(before);
  await expect(page.locator('#m-stops > .stop.current')).toHaveCount(1);
  expect(await page.evaluate(snapshot)).toBe(ls0);
});

test('Home during a preview returns to Grown-ups with nothing saved', async ({ page }) => {
  await seedChild(page, 4);
  await openGrownUps(page);
  const ls0 = await page.evaluate(snapshot);
  await holdOn(page, page.locator('.plesson[data-i="26"]'), 1000); // "stop" words, locked
  await page.waitForFunction(() => window.kitphonic.preview.active && document.getElementById('parent').hidden, null, { timeout: 10_000 });
  const scr = await visibleScreen(page);
  const home = { lesson: '#ls-home', letters: '#l-home', word: '#home', sentence: '#sn-home', star: '#st-home', family: '#fm-home' }[scr];
  await page.waitForTimeout(800);
  await page.locator(home).click();
  await page.waitForFunction(() => !document.getElementById('parent').hidden && !window.kitphonic.preview.active, null, { timeout: 10_000 });
  expect(await page.evaluate(snapshot)).toBe(ls0);
  expect(await page.evaluate(() => window.kitphonic.map().index)).toBe(4);
});

test('the Preview badge is the exit: one tap back to Grown-ups, nothing saved', async ({ page }) => {
  await seedChild(page, 6);
  await openGrownUps(page);
  const ls0 = await page.evaluate(snapshot);
  await holdOn(page, page.locator('.plesson[data-i="40"]'), 1000); // sound "w", locked
  await page.waitForFunction(() => window.kitphonic.preview.active && document.getElementById('parent').hidden, null, { timeout: 10_000 });
  const badge = page.locator('#preview-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAccessibleName('Exit preview');
  await expect(badge).toContainText('Preview');
  await page.waitForTimeout(600);
  await badge.click();
  await page.waitForFunction(() => !document.getElementById('parent').hidden && !window.kitphonic.preview.active, null, { timeout: 10_000 });
  await expect(badge).toBeHidden();
  expect(await page.evaluate(snapshot)).toBe(ls0);
  expect(await page.evaluate(() => window.kitphonic.map().index)).toBe(6);
});

test('exiting mid-word: late screen timers write nothing and Grown-ups stays open', async ({ page }) => {
  await seedChild(page, 4);
  await openGrownUps(page);
  const ls0 = await page.evaluate(snapshot);
  await holdOn(page, page.locator('.plesson[data-i="26"]'), 1000); // "stop" words, locked
  await page.waitForFunction(() => window.kitphonic.preview.active && window.kitphonic.screen?.state === 'slide', null, { timeout: 15_000 });
  await step(page, 'word', () => 0.5, 0); // a full slide: the blend, then a check / reveal on a timer
  await page.locator('#preview-badge').click();
  await page.waitForTimeout(4000); // past the blend -> check -> reveal timers
  expect(await visibleScreen(page)).toBe('parent');
  expect(await page.evaluate(snapshot)).toBe(ls0);
});
