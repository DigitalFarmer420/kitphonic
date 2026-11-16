import { test, expect } from '@playwright/test';

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
