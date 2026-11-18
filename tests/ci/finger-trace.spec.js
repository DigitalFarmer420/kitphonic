import { test, expect } from '@playwright/test';
import { asIpad } from './guards.js';

// Ported from the Test Engineer's KP-BUG-004 harness (issue #42, PRs #43 / #44). Finger, Apple Pencil and mouse
// tracing for 'm' and 'a' at the tracing projects in tests/ci/playwright.ci.config.js:
//  1. Nothing covers the letter: elementFromPoint at the green start dot and every path sample is #tr-svg or inside it,
//     while the pointing-hand hint is on screen (it must be pointer-events:none) and after it has gone.
//  2. A real (trusted) touch at the dot reaches the svg and the tracer accepts it (state.active at pointerdown).
//  3. A finger stroke (pointerType 'touch' PointerEvents + TouchEvents, the pair iOS sends) that starts on the dot,
//     or 5 / 10 / 20 / 30 CSS px off it, starts a stroke and lays ink.
//  4. An Apple Pencil stroke (pointerType 'pen') on the dot lays ink.
//  5. A trusted mouse drag (page.mouse) along every stroke finishes the letter (desktop and iPad with a trackpad).
// Playwright WebKit can only send a trusted tap, not a trusted drag, so 3 and 4 are synthetic PointerEvents.
// Touch-only tests skip on the desktop projects by design; the mouse test runs everywhere.

test.beforeEach(async ({ page }, testInfo) => { if (testInfo.project.metadata?.ipad) await asIpad(page); });

async function openTrace(page, g) {
  await page.goto(`/?skipHello=1&reducedMotion=1&activity=trace&gpc=${g}`);
  await page.waitForFunction(() => {
    const r = window.kitphonic?.lesson?.run;
    return r && r.debugPoints && r.debugPoints().length > 0 && !document.getElementById('trace').hidden;
  }, null, { timeout: 15_000 });
}

const covered = (page) => page.evaluate(() => {
  const svg = document.getElementById('tr-svg');
  const dot = svg.querySelector('circle.start').getBoundingClientRect();
  const pts = [[dot.left + dot.width / 2, dot.top + dot.height / 2], ...window.kitphonic.lesson.run.debugPoints()];
  const name = (e) => (e ? (e.id ? `#${e.id}` : (e.getAttribute('class') || e.tagName)) : 'nothing');
  const bad = pts.map(([x, y], i) => ({ i, x: Math.round(x), y: Math.round(y), e: document.elementFromPoint(x, y) }))
    .filter((p) => !(p.e && svg.contains(p.e))).map((p) => `${p.i === 0 ? 'start dot' : 'path ' + p.i} ${p.x},${p.y} -> ${name(p.e)}`);
  const hint = document.querySelector('.ghosthand');
  return { bad, hint: hint ? getComputedStyle(hint).pointerEvents : null };
});


// The first trace a new child meets: fresh load, no URL shortcuts except skipping the two letter games between the intro
// and the trace (test shortcut).
test('KP-BUG-004 [m, first run]: from a fresh load, the first finger stroke on m starts at the green dot and lays ink', async ({ page }) => {
  test.skip(!test.info().project.use.hasTouch, 'finger: touch projects');
  const tap = async (sel) => {
    const el = page.locator(sel); await expect(el).toBeVisible({ timeout: 15_000 });
    const b = await el.boundingBox(); await page.touchscreen.tap(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2));
  };
  await page.goto('/?reducedMotion=1');
  await page.waitForFunction(() => !!window.kitphonic, null, { timeout: 15_000 });
  await tap('#play');
  await expect(page.locator('#map')).toBeVisible({ timeout: 15_000 });
  await tap('#go');
  await page.waitForFunction(() => window.kitphonic.lesson.run?.activity === 'intro', null, { timeout: 15_000 });
  expect(await page.evaluate(() => window.kitphonic.lesson.run.gpc)).toBe('m');
  await tap('#ic-letter');
  await tap('#ic-next');
  await expect.poll(async () => page.evaluate(() => {
    const k = window.kitphonic;
    if (k.lesson.run?.activity === 'trace') return 'trace';
    const r = k.letters.run; if (r) { k.letters.stop?.(); r.onComplete?.({ activity: r.activity, score: 0, rounds: 0 }); }
    return r?.activity || 'none';
  }), { timeout: 20_000, intervals: [400] }).toBe('trace');
  await page.waitForFunction(() => window.kitphonic.lesson.run.debugPoints().length > 0, null, { timeout: 15_000 });
  expect(await page.evaluate(() => window.kitphonic.lesson.run.gpc)).toBe('m');
  const hit = await covered(page);
  expect(hit.bad, 'nothing covers the start dot or the path of m').toEqual([]);
  const r = await page.evaluate(async () => {
    const svg = document.getElementById('tr-svg'); const run = window.kitphonic.lesson.run;
    const all = run.debugPoints(); const pts = all.slice(0, Math.max(4, Math.floor(all.length / 3)));
    const ptr = (type, x, y) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 21, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }));
    ptr('pointerdown', ...pts[0]); const down = run.debugState();
    for (const q of pts.slice(1)) { ptr('pointermove', ...q); await new Promise((res) => setTimeout(res, 8)); }
    const mid = run.debugState(); const ink = svg.querySelectorAll('.ink, .doneink').length; ptr('pointerup', ...pts.at(-1));
    return { downActive: down.active, k: mid.k, ink };
  });
  expect(r.downActive, 'the first press on m\'s green dot started a stroke').toBe(true);
  expect(r.k).toBeGreaterThan(0);
  expect(r.ink).toBeGreaterThan(0);
});

for (const g of ['m', 'a']) {
  test(`KP-BUG-004 [${g}]: no overlay covers the start dot or the path, during and after the hint`, async ({ page }) => {
    test.skip(!test.info().project.use.hasTouch, 'finger: touch projects');
    await openTrace(page, g);
    const hintShown = await page.waitForSelector('.ghosthand', { timeout: 12_000 }).then(() => true).catch(() => false);
    if (hintShown) {
      const during = await covered(page);
      expect(during.hint, 'the pointing-hand hint must not take touches').toBe('none');
      expect(during.bad, 'covered while the hint animates').toEqual([]);
      // While the child is idle the hint never goes away on its own: it replays every 5 s (ghost-hand idleMs) before the
      // previous run ends. The app hides it on the first press on the svg (hand.hide() in onpointerdown), so press once
      // on the card away from the letter, the way a child's first touch would land.
      const corner = await page.evaluate(() => { const r = document.getElementById('tr-svg').getBoundingClientRect(); return [Math.round(r.left + 6), Math.round(r.bottom - 6)]; });
      await page.touchscreen.tap(...corner);
      await page.waitForSelector('.ghosthand', { state: 'detached', timeout: 5_000 });
    }
    const after = await covered(page);
    expect(after.bad, 'covered after the hint').toEqual([]);
  });

  test(`KP-BUG-004 [${g}]: a real tap on the start dot reaches the svg and the tracer accepts it`, async ({ page }) => {
    test.skip(!test.info().project.use.hasTouch, 'finger: touch projects');
    await openTrace(page, g);
    await page.evaluate(() => {
      window.__kp = [];
      const svg = document.getElementById('tr-svg');
      // added after the app's own onpointerdown, so it runs after it and sees the tracer's answer
      svg.addEventListener('pointerdown', (e) => window.__kp.push({ t: e.type, pt: e.pointerType, tr: e.isTrusted, active: window.kitphonic.lesson.run.debugState().active }), { passive: true });
      svg.addEventListener('touchstart', (e) => window.__kp.push({ t: e.type, tr: e.isTrusted }), { passive: true });
    });
    const [x, y] = await page.evaluate(() => window.kitphonic.lesson.run.debugPoints()[0]);
    await page.touchscreen.tap(Math.round(x), Math.round(y));
    await expect.poll(() => page.evaluate(() => window.__kp.length)).toBeGreaterThan(0);
    const seen = await page.evaluate(() => window.__kp);
    const down = seen.find((e) => e.t === 'pointerdown');
    expect(down, `events on the svg: ${JSON.stringify(seen)}`).toBeTruthy();
    expect(down.pt).toBe('touch');
    expect(down.active, 'the press on the green dot started a stroke').toBe(true);
  });

  for (const off of [0, 5, 10, 20, 30]) {
    test(`KP-BUG-004 [${g}]: a finger stroke starting ${off ? off + ' px off' : 'on'} the start dot lays ink`, async ({ page }) => {
      test.skip(!test.info().project.use.hasTouch, 'finger: touch projects');
      await openTrace(page, g);
      const r = await page.evaluate(async (off) => {
        const svg = document.getElementById('tr-svg');
        const run = window.kitphonic.lesson.run;
        const all = run.debugPoints();
        const pts = all.slice(0, Math.max(4, Math.floor(all.length / 3)));
        // start `off` px outward from the dot, away from the bowl centre (the side a child's finger lands on)
        const c = svg.getBoundingClientRect(); const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
        const [x0, y0] = pts[0]; const len = Math.hypot(x0 - cx, y0 - cy) || 1;
        const start = [x0 + (x0 - cx) / len * off, y0 + (y0 - cy) / len * off];
        const touch = (type, x, y) => {
          let ev;
          try {
            const t = new Touch({ identifier: 4, target: svg, clientX: x, clientY: y });
            ev = new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] });
          } catch { // engines without the Touch constructor
            const t = { identifier: 4, clientX: x, clientY: y };
            ev = new Event(type, { bubbles: true, cancelable: true }); ev.touches = type === 'touchend' ? [] : [t]; ev.changedTouches = [t];
          }
          svg.dispatchEvent(ev);
        };
        const ptr = (type, x, y) => svg.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y,
          buttons: type === 'pointerup' ? 0 : 1, width: 30, height: 30, pressure: 0.5,
        }));
        ptr('pointerdown', ...start); touch('touchstart', ...start);
        const down = run.debugState();
        for (const q of pts.slice(1)) { ptr('pointermove', ...q); touch('touchmove', ...q); await new Promise((res) => setTimeout(res, 8)); }
        const mid = run.debugState();
        const ink = svg.querySelectorAll('.ink, .doneink').length;
        ptr('pointerup', ...pts.at(-1)); touch('touchend', ...pts.at(-1));
        const m = svg.getScreenCTM();
        return { downActive: down.active, k: mid.k, stroke: mid.stroke, ink, startTolPx: 20 * Math.hypot(m.a, m.b) };
      }, off);
      expect(off, 'test assumption: the offset is inside the start tolerance').toBeLessThan(r.startTolPx);
      expect(r.downActive, `press ${off}px off the dot was not accepted (tolerance ${r.startTolPx.toFixed(1)}px)`).toBe(true);
      expect(r.k, 'the stroke advanced').toBeGreaterThan(0);
      expect(r.ink, 'ink was laid').toBeGreaterThan(0);
    });
  }
}

for (const g of ['m', 'a']) {
  test(`[${g}]: an Apple Pencil stroke on the start dot lays ink`, async ({ page }) => {
    test.skip(!test.info().project.use.hasTouch, 'pencil: touch projects');
    await openTrace(page, g);
    const r = await page.evaluate(async () => {
      const svg = document.getElementById('tr-svg'); const run = window.kitphonic.lesson.run;
      const all = run.debugPoints(); const pts = all.slice(0, Math.max(4, Math.floor(all.length / 3)));
      const ptr = (type, x, y) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 31, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.4, tiltX: 20 }));
      ptr('pointerdown', ...pts[0]); const down = run.debugState();
      for (const q of pts.slice(1)) { ptr('pointermove', ...q); await new Promise((res) => setTimeout(res, 8)); }
      const mid = run.debugState(); const ink = svg.querySelectorAll('.ink, .doneink').length; ptr('pointerup', ...pts.at(-1));
      return { downActive: down.active, k: mid.k, ink };
    });
    expect(r.downActive, 'the pencil press on the green dot started a stroke').toBe(true);
    expect(r.k).toBeGreaterThan(0);
    expect(r.ink).toBeGreaterThan(0);
  });

  test(`[${g}]: a trusted mouse drag along every stroke finishes the letter`, async ({ page }) => {
    await openTrace(page, g);
    for (let guard = 0; guard < 6; guard++) {
      const st = await page.evaluate(() => window.kitphonic.lesson.run.debugState());
      if (st.done) break;
      const pts = await page.evaluate(() => window.kitphonic.lesson.run.debugPoints());
      expect(pts.length).toBeGreaterThan(1);
      await page.mouse.move(pts[0][0], pts[0][1]);
      await page.mouse.down();
      for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 2 });
      await page.mouse.up();
      await page.waitForTimeout(50);
    }
    const end = await page.evaluate(() => window.kitphonic.lesson.run.debugState());
    expect(end.done, `mouse finished ${g}: ${JSON.stringify(end)}`).toBe(true);
    expect(await page.locator('#tr-svg .doneink').count()).toBeGreaterThan(0);
  });
}
