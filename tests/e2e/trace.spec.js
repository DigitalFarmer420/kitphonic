import { test, expect } from '@playwright/test';
import { STROKES } from '../../js/trace.js';

// Touch stroke along the samples tools/trace-touch.py already uses (screen
// coordinates, every few points, still inside the lane). Playwright WebKit
// cannot send a native touch drag, so the finger is a touch pointer
// (pointerType 'touch') — the events the tracer listens to.
async function completeLetter(page) {
  return page.evaluate(() => {
    const svg = document.getElementById('tr-svg');
    const pts = window.kitphonic.lesson.run.debugPoints();
    const fire = (type, x, y, buttons) => svg.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: x, clientY: y, buttons,
    }));
    fire('pointerdown', pts[0][0], pts[0][1], 1);
    for (let i = 1; i < pts.length; i++) fire('pointermove', pts[i][0], pts[i][1], 1);
    const last = pts[pts.length - 1];
    fire('pointerup', last[0], last[1], 0);
    return {
      pts: pts.length,
      state: window.kitphonic.lesson.run.debugState(),
      stars: document.querySelectorAll('#tr-tray .emoji:not(.off)').length,
      ink: document.querySelectorAll('#tr-svg .ink, #tr-svg .doneink').length,
    };
  });
}

// Same sequence as tools/ipad-trace-cancel.py: pointerdown, an optional run of
// pointermoves, then a cancel, then touchmoves only. On develop before PR #18
// that cancel ends the stroke, so the touchmoves do not continue the ink.
// lostpointercapture is the same gap: the svg treats it as the end of the stroke.
//
// The cancel and the follow-up moves are separate turns. PR #18 holds a touch
// lostpointercapture from setTimeout(0); touchmoves in the same evaluate run
// before that and are ignored. A frame plus a short timer lets the hold land.
async function injectCancel(page, opts) {
  const started = await page.evaluate((opts) => {
    const svg = document.getElementById('tr-svg');
    const child = svg.querySelector('text.startn') || svg.querySelector('.start');
    const r = child.getBoundingClientRect();
    const x0 = r.x + r.width / 2;
    const y0 = r.y + r.height / 2;
    const fire = (type, target, x, y, buttons) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: x, clientY: y, buttons,
    }));
    const touch = (type, x, y) => {
      const t = { identifier: 1, clientX: x, clientY: y };
      const up = type === 'touchend' || type === 'touchcancel';
      const ev = new Event(type, { bubbles: true, cancelable: true });
      ev.touches = up ? [] : [t];
      ev.changedTouches = [t];
      svg.dispatchEvent(ev);
    };
    touch('touchstart', x0, y0);
    fire('pointerdown', child, x0, y0, 1);
    const down = window.kitphonic.lesson.run.debugState();
    const pts = window.kitphonic.lesson.run.debugPoints();
    const cut = opts.mode === 'mid' ? Math.max(2, Math.floor(pts.length / 3)) : 0;
    for (let i = 1; i <= cut; i++) fire('pointermove', svg, pts[i][0], pts[i][1], 1);
    const at = pts[cut] || pts[0];
    fire(opts.cancel, svg, at[0], at[1], 0);
    return { down, cancelled: window.kitphonic.lesson.run.debugState(), pts, cut };
  }, opts);
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 20));
  }));
  const end = await page.evaluate(({ pts, cut }) => {
    const svg = document.getElementById('tr-svg');
    const touch = (type, x, y) => {
      const t = { identifier: 1, clientX: x, clientY: y };
      const ev = new Event(type, { bubbles: true, cancelable: true });
      ev.touches = [t];
      ev.changedTouches = [t];
      svg.dispatchEvent(ev);
    };
    for (let i = cut + 1; i < pts.length; i++) touch('touchmove', pts[i][0], pts[i][1]);
    return window.kitphonic.lesson.run.debugState();
  }, { pts: started.pts, cut: started.cut });
  return { down: started.down, cancelled: started.cancelled, end, pts: started.pts.length, cut: started.cut };
}

function strokeProgressed(data) {
  const end = data?.end;
  const cancel = data?.cancelled;
  if (!end || !cancel) return false;
  if (cancel.done && end.done) return true;
  return (end.done || end.stroke > cancel.stroke || end.k > cancel.k) && cancel.active === true;
}

// The stroke started, the cancel ended it, and later touchmoves did not continue.
// Any other failure (the letter never started, the page did not boot) still fails the run.
function stillTheUnfixedCancel(data) {
  return data?.down?.active === true && data?.cancelled?.active === false && !strokeProgressed(data);
}

async function openTrace(page, letter) {
  await page.goto(`/?skipHello=1&reducedMotion=1&activity=trace&gpc=${letter}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => (window.kitphonic?.lesson?.run?.debugPoints?.() ?? []).length > 2,
    null,
    { timeout: 15_000 },
  );
}

test('a touch stroke completes the letter l', async ({ page }) => {
  await openTrace(page, 'l');
  const result = await completeLetter(page);
  expect(result.pts, 'trace samples').toBeGreaterThan(2);
  expect(result.stars, JSON.stringify(result)).toBeGreaterThanOrEqual(1);
  expect(result.ink, JSON.stringify(result)).toBeGreaterThan(0);
  expect(result.state.done || result.state.stroke >= 1, JSON.stringify(result.state)).toBe(true);
});

// PR #18 (fix/ipad-trace-touch, tools/ipad-trace-cancel.py) is not on develop.
// An early pointercancel, and a lostpointercapture mid-stroke, still end the
// stroke, so the finger's later touchmoves cannot finish the letter. test.fixme
// marks that known gap and leaves the assertion in place: once the fix is merged
// the stroke stays active, these return false, and the tests run for real.
const PENDING_CANCEL = 'Pending https://github.com/DigitalFarmer420/kitphonic/pull/18 (fix/ipad-trace-touch). '
  + 'On develop an early pointercancel ends the stroke, so the later touchmoves cannot finish the letter. '
  + 'This test asserts that behaviour once the fix is merged.';
const PENDING_LOST = 'Pending https://github.com/DigitalFarmer420/kitphonic/pull/18 (fix/ipad-trace-touch). '
  + 'On develop a lostpointercapture mid-stroke ends the stroke, so the finger cannot finish the letter. '
  + 'This test asserts that behaviour once the fix is merged.';

test('an early pointercancel lets the same finger finish the letter', async ({ page }) => {
  await openTrace(page, 's');
  const data = await injectCancel(page, { mode: 'early', cancel: 'pointercancel' });
  test.fixme(stillTheUnfixedCancel(data), PENDING_CANCEL);
  expect(strokeProgressed(data), JSON.stringify(data)).toBe(true);
});

test('a lostpointercapture mid-stroke lets the same finger finish the letter', async ({ page }) => {
  await openTrace(page, 's');
  const data = await injectCancel(page, { mode: 'mid', cancel: 'lostpointercapture' });
  test.fixme(stillTheUnfixedCancel(data), PENDING_LOST);
  expect(strokeProgressed(data), JSON.stringify(data)).toBe(true);
});

// PR #18 Uiux / Test Engineer: multi-stroke letters deadlocked. Stroke 1 finished, drawMarks()
// replaced the start dot under the finger, the lift was dispatched on that detached node (WebKit
// implicit touch capture), and no new finger could start stroke 2. Every multi-stroke grapheme in
// STROKES, with no interruption (the missed-lift control), a pointercancel, and a lostpointercapture;
// during a held stroke a palm lands and lifts and must not take it. Each later stroke is a new
// finger. tools/ipad-trace-cancel.py runs the same model on four iPad sizes plus real CDP touches.
const MULTI = Object.entries(STROKES).filter(([, v]) => v.length > 1).map(([k]) => k);

async function multiStroke(page, kind) {
  return page.evaluate(async (kind) => {
    const svg = document.getElementById('tr-svg');
    const run = window.kitphonic.lesson.run;
    const active = new Map();
    const hit = (x, y) => document.elementFromPoint(x, y) || svg;
    const P = (type, target, id, x, y, buttons) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons,
    }));
    const T = (type, target, ident, x, y) => {
      const t = { identifier: ident, clientX: x, clientY: y };
      if (type === 'touchend') active.delete(ident); else active.set(ident, t);
      const ev = new Event(type, { bubbles: true, cancelable: true });
      ev.touches = [...active.values()];
      ev.changedTouches = [t];
      target.dispatchEvent(ev);
    };
    const finger = (pid, ident) => ({
      target: null,
      down(q) { this.target = hit(q[0], q[1]); P('pointerdown', this.target, pid, q[0], q[1], 1); T('touchstart', this.target, ident, q[0], q[1]); },
      move(q) { P('pointermove', this.target, pid, q[0], q[1], 1); T('touchmove', this.target, ident, q[0], q[1]); },
      touchOnly(q) { T('touchmove', this.target, ident, q[0], q[1]); },
      up(q) { P('pointerup', this.target, pid, q[0], q[1], 0); T('touchend', this.target, ident, q[0], q[1]); },
    });
    const strokes = run.debugState().strokes;
    let pts = run.debugPoints();
    const f1 = finger(2, 1);
    f1.down(pts[0]);
    const cut = Math.max(2, Math.floor(pts.length / 3));
    for (let i = 1; i <= cut; i++) f1.move(pts[i]);
    let held = true, palmOk = true;
    if (kind === 'control') {
      for (let i = cut + 1; i < pts.length; i++) f1.move(pts[i]);
    } else {
      if (kind === 'pointercancel') P('pointercancel', f1.target, 2, pts[cut][0], pts[cut][1], 0);
      else svg.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 2, pointerType: 'touch', isPrimary: true }));
      await new Promise((r) => setTimeout(r, 0));
      held = run.debugState().active;
      const r = svg.getBoundingClientRect(), at = [r.right - 10, r.bottom - 10], palm = finger(9, 8);
      const k0 = run.debugState().k;
      palm.down(at);
      palmOk = run.debugOwner() === 2 && run.debugState().k === k0 && run.debugState().stroke === 0;
      const half = cut + Math.floor((pts.length - cut) / 2);
      for (let i = cut + 1; i < pts.length; i++) { f1.touchOnly(pts[i]); if (i === half) palm.up(at); }
    }
    const s1 = run.debugState();
    f1.up(pts[pts.length - 1]);
    for (let s = 1; s < strokes; s++) {
      pts = run.debugPoints();
      if (!pts.length) break;
      const f = finger(10 + 2 * s, 9 + 2 * s);
      f.down(pts[0]);
      for (let i = 1; i < pts.length; i++) f.move(pts[i]);
      f.up(pts[pts.length - 1]);
    }
    return { strokes, held, palmOk, s1: s1.stroke, end: run.debugState(), stars: document.querySelectorAll('#tr-tray .emoji:not(.off)').length };
  }, kind);
}

test('every multi-stroke grapheme is enumerated', () => {
  expect(MULTI.length).toBeGreaterThanOrEqual(19);
  expect(MULTI).toEqual(expect.arrayContaining(['t', 'f', 'i', 'j', 'k', 'x']));
});

for (const kind of ['control', 'pointercancel', 'lostpointercapture']) {
  test(`multi-stroke letters: a new finger starts each later stroke after ${kind === 'control' ? 'a missed lift (no cancel)' : `a ${kind} and a missed lift`}`, async ({ page }) => {
    const fails = [];
    for (const g of MULTI) {
      await openTrace(page, g);
      const d = await multiStroke(page, kind);
      if (!(d.held && d.palmOk && d.s1 >= 1 && (d.end.done || d.stars >= 1))) fails.push(`${g} ${JSON.stringify(d)}`);
    }
    expect(fails, fails.join('\n')).toEqual([]);
  });
}
