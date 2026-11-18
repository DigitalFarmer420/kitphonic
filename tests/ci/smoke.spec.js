import { test, expect } from '@playwright/test';
import { watch, asIpad, tap } from './guards.js';

// Smoke: the main learning flow a child takes on a fresh device, at desktop, phone and iPad.
// Hello -> Play -> map -> ▶ (go) -> letter intro for m -> (letter games skipped by a test shortcut) -> trace m to the
// end -> the session moves on. Then a word: slide under "map" to blend, answer the check, see the reveal.
// Every step fails on a console error, a failed request, or any request that is not 127.0.0.1 (privacy).

test.beforeEach(async ({ page }, testInfo) => { if (testInfo.project.metadata?.ipad) await asIpad(page); });

async function traceWholeLetter(page, pointerType) {
  // One pointer stroke per stroke of the letter, along the tracer's own sample points.
  return page.evaluate(async (pointerType) => {
    const svg = document.getElementById('tr-svg');
    const run = window.kitphonic.lesson.run;
    const fire = (type, x, y, buttons) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType, isPrimary: true, clientX: x, clientY: y, buttons }));
    for (let guard = 0; guard < 8 && !run.debugState().done; guard++) {
      const pts = run.debugPoints();
      fire('pointerdown', pts[0][0], pts[0][1], 1);
      for (let i = 1; i < pts.length; i++) { fire('pointermove', pts[i][0], pts[i][1], 1); if (i % 6 === 0) await new Promise((r) => setTimeout(r, 4)); }
      fire('pointerup', pts.at(-1)[0], pts.at(-1)[1], 0);
      await new Promise((r) => setTimeout(r, 60));
    }
    return run.debugState();
  }, pointerType);
}

test('fresh load: hello, map, letter intro, trace m, and the session moves on', async ({ page, baseURL }, testInfo) => {
  const hasTouch = !!testInfo.project.use.hasTouch;
  const g = watch(page, baseURL);
  await page.goto('/?reducedMotion=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.kitphonic, null, { timeout: 15_000 });
  await expect(page.locator('#hello')).toBeVisible();
  await tap(page, '#play', hasTouch);
  await expect(page.locator('#map')).toBeVisible({ timeout: 15_000 });
  await tap(page, '#go', hasTouch);
  await page.waitForFunction(() => window.kitphonic.lesson.run?.activity === 'intro', null, { timeout: 15_000 });
  expect(await page.evaluate(() => window.kitphonic.lesson.run.gpc)).toBe('m');
  await tap(page, '#ic-letter', hasTouch);
  await tap(page, '#ic-next', hasTouch);
  // Letter games between the intro and the trace: completed through their own onComplete (test shortcut).
  await expect.poll(async () => page.evaluate(() => {
    const k = window.kitphonic;
    if (k.lesson.run?.activity === 'trace') return 'trace';
    const r = k.letters.run; if (r) { k.letters.stop?.(); r.onComplete?.({ activity: r.activity, score: 0, rounds: 0 }); }
    return r?.activity || 'none';
  }), { timeout: 20_000, intervals: [400] }).toBe('trace');
  await page.waitForFunction(() => window.kitphonic.lesson.run.debugPoints().length > 0, null, { timeout: 15_000 });
  // TRACE_REPS (3) times: each pass must finish the letter, then the card resets for the next pass.
  for (let rep = 1; rep <= 3; rep++) {
    await page.waitForFunction(() => window.kitphonic.lesson.run.debugPoints().length > 0 || !document.getElementById('tr-next').hidden, null, { timeout: 15_000 });
    if (await page.locator('#tr-next').isVisible()) break;
    const end = await traceWholeLetter(page, hasTouch ? 'touch' : 'mouse');
    expect(end.done, `m pass ${rep} traced to the end (${JSON.stringify(end)})`).toBe(true);
  }
  await tap(page, '#tr-next', hasTouch);
  await expect.poll(() => page.evaluate(() => window.kitphonic.lesson.run?.activity === 'trace' && !document.getElementById('trace').hidden), { timeout: 15_000 }).toBe(false);
  g.assertClean();
});

test('word: blend "map" with the slider, answer the check, reach the reveal', async ({ page, baseURL }) => {
  const g = watch(page, baseURL);
  await page.goto('/?skipHello=1&reducedMotion=1&level=2&word=map&seed=1&support=3', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.kitphonic?.screen?.state === 'slide', null, { timeout: 20_000 });
  const h = await page.locator('#handle').boundingBox();
  const t = await page.locator('#track').boundingBox();
  const y = h.y + h.height / 2;
  await page.mouse.move(h.x + h.width / 2, y);
  await page.mouse.down();
  for (let x = h.x + h.width / 2; x <= t.x + t.width + 10; x += 8) { await page.mouse.move(x, y); await page.waitForTimeout(16); }
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.kitphonic.screen.state), { timeout: 20_000 }).toMatch(/^(check|revealed|done)$/);
  if (await page.evaluate(() => window.kitphonic.screen.state) === 'check') {
    await page.waitForSelector('#choices button.choice', { timeout: 8_000 });
    await page.locator('#choices button.choice[data-w="map"]').click();
    await expect.poll(() => page.evaluate(() => window.kitphonic.screen.state), { timeout: 20_000 }).toMatch(/^(picked|revealed|done)$/);
  }
  g.assertClean();
});

test('grown-ups area opens and every screen boots clean', async ({ page, baseURL }) => {
  const g = watch(page, baseURL);
  for (const [q, sel] of [
    ['parent=1&progress=5', '.ptile'],
    ['activity=star&word=the&seed=1', '#star'],
    ['activity=soundTap&seed=1', '#l-arena'],
    ['activity=family&rime=ap', '#fm-word'],
    ['activity=sentence&sentence=map-mat', '#sn-strip'],
    ['activity=story&story=fox', '#sn-strip'],
    ['progress=47', '#go'],
  ]) {
    await page.goto(`/?skipHello=1&reducedMotion=1&${q}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(sel).first(), q).toBeVisible({ timeout: 15_000 });
  }
  g.assertClean();
});
