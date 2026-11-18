import { test, expect } from '@playwright/test';

// iPadOS Safari requests a desktop Macintosh UA, reports maxTouchPoints > 0, and
// lays the trace card out much larger than a phone (portrait scale is several
// CSS px per letter unit). These projects are the only ones that match that.
// 'm' is the first letter a child traces. 'a' stays as a second case.

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('webkit-ipados-'), 'iPadOS desktop WebKit projects only');
  // Playwright WebKit leaves maxTouchPoints at 0 even with hasTouch. A real iPadOS
  // desktop page reports 5, and that is what sends a mouse-labelled finger down the
  // touch path. Install the same value before the app boots.
  await page.addInitScript(() => {
    try { Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { configurable: true, get: () => 5 }); }
    catch { /* already exposed */ }
  });
});

async function openTrace(page, letter) {
  await page.goto(`/?skipHello=1&reducedMotion=1&activity=trace&gpc=${letter}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => (window.kitphonic?.lesson?.run?.debugPoints?.() ?? []).length > 2
      && document.querySelector('#tr-svg .start'),
    null,
    { timeout: 15_000 },
  );
}

// Drive every stroke of the open letter. The press starts on the green dot's
// centre (what the child sees), not on a pre-mapped sample. `cancel` fires a
// pointercancel or lostpointercapture part-way through stroke 1; the rest of
// that stroke arrives as touchmoves, which is what iPadOS does after it takes
// the pointer stream away.
async function traceLetter(page, { pointerType = 'touch', cancel = null, touchOnly = false } = {}) {
  const started = await page.evaluate(({ pointerType, cancel, touchOnly }) => {
    const svg = document.getElementById('tr-svg');
    const run = window.kitphonic.lesson.run;
    const dotOf = () => {
      const dot = svg.querySelector('.start');
      const r = dot.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const nameOf = el => el?.id ? '#' + el.id : (el?.className?.baseVal ?? el?.className ?? el?.tagName ?? '');
    const P = (type, target, id, x, y, buttons, kind) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: id, pointerType: kind, isPrimary: true, clientX: x, clientY: y, buttons,
    }));
    const active = new Map();
    const T = (type, target, ident, x, y) => {
      const t = { identifier: ident, clientX: x, clientY: y };
      if (type === 'touchend' || type === 'touchcancel') active.delete(ident); else active.set(ident, t);
      const ev = new Event(type, { bubbles: true, cancelable: true });
      ev.touches = [...active.values()];
      ev.changedTouches = [t];
      target.dispatchEvent(ev);
    };
    const dot = dotOf();
    const hit = document.elementFromPoint(dot.x, dot.y);
    const ctm = svg.getScreenCTM();
    const strokes = run.debugState().strokes;
    const onDot = dot.x >= dot.left && dot.x <= dot.right && dot.y >= dot.top && dot.y <= dot.bottom;
    let pts = run.debugPoints();
    const downOnDot = pts.length && pts[0][0] >= dot.left && pts[0][0] <= dot.right && pts[0][1] >= dot.top && pts[0][1] <= dot.bottom;
    const surface = hit && (hit === svg || svg.contains(hit)) ? svg : (hit || svg);
    if (!touchOnly) {
      if (pointerType === 'touch') T('touchstart', surface, 1, dot.x, dot.y);
      P('pointerdown', surface, 1, dot.x, dot.y, 1, pointerType);
    } else {
      T('touchstart', surface, 1, dot.x, dot.y);
    }
    const down = run.debugState();
    if (!touchOnly) P('pointermove', surface, 1, pts[1][0], pts[1][1], 1, pointerType);
    else T('touchmove', surface, 1, pts[1][0], pts[1][1]);
    const first = { k: run.debugState().k, active: run.debugState().active, ink: svg.querySelectorAll('.ink').length };
    return {
      strokes, onDot, downOnDot, down, first,
      hit: String(nameOf(hit)).slice(0, 40),
      hitTouchAction: hit ? getComputedStyle(hit).touchAction : '',
      svgTouchAction: getComputedStyle(svg).touchAction,
      hand: getComputedStyle(document.querySelector('.ghosthand') || document.body).pointerEvents,
      ua: navigator.userAgent,
      touchPoints: navigator.maxTouchPoints,
      ontouch: 'ontouchstart' in window,
      scale: ctm ? Math.hypot(ctm.a, ctm.b) : 0,
      pts, pointerType, cancel, touchOnly,
    };
  }, { pointerType, cancel, touchOnly });

  if (cancel) {
    await page.evaluate(({ pointerType, cancel }) => {
      const svg = document.getElementById('tr-svg');
      const run = window.kitphonic.lesson.run;
      const pts = run.debugPoints();
      const cut = Math.max(2, Math.floor(pts.length / 3));
      const P = (type, x, y, buttons) => svg.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, pointerType, isPrimary: true, clientX: x, clientY: y, buttons,
      }));
      for (let i = 2; i <= cut; i++) P('pointermove', pts[i][0], pts[i][1], 1);
      if (cancel === 'lostpointercapture') {
        svg.dispatchEvent(new PointerEvent('lostpointercapture', {
          bubbles: true, pointerId: 1, pointerType, isPrimary: true, clientX: pts[cut][0], clientY: pts[cut][1],
        }));
      } else P('pointercancel', pts[cut][0], pts[cut][1], 0);
      const cancelled = run.debugState();
      return { cut, cancelled, pts };
    }, { pointerType, cancel }).then(data => { started.cut = data.cut; started.cancelled = data.cancelled; started.pts = data.pts; });
    await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => setTimeout(resolve, 20)); }));
  }

  const end = await page.evaluate(({ cancel, touchOnly, pointerType }) => {
    const svg = document.getElementById('tr-svg');
    const run = window.kitphonic.lesson.run;
    const active = new Map();
    const P = (type, id, x, y, buttons, kind) => svg.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: id, pointerType: kind, isPrimary: true, clientX: x, clientY: y, buttons,
    }));
    const T = (type, ident, x, y) => {
      const t = { identifier: ident, clientX: x, clientY: y };
      if (type === 'touchend' || type === 'touchcancel') active.delete(ident); else active.set(ident, t);
      const ev = new Event(type, { bubbles: true, cancelable: true });
      ev.touches = [...active.values()];
      ev.changedTouches = [t];
      svg.dispatchEvent(ev);
    };
    const finishStroke = (pts, from, id, ident, kind, touches) => {
      for (let i = from; i < pts.length; i++) {
        if (touches) T('touchmove', ident, pts[i][0], pts[i][1]);
        else P('pointermove', id, pts[i][0], pts[i][1], 1, kind);
      }
      const last = pts[pts.length - 1];
      if (touches) T('touchend', ident, last[0], last[1]);
      else P('pointerup', id, last[0], last[1], 0, kind);
    };
    let pts = run.debugPoints();
    const strokes = run.debugState().strokes;
    if (cancel || touchOnly) finishStroke(pts, cancel ? Math.max(2, Math.floor(pts.length / 3)) + 1 : 2, touchOnly ? 'touch-1' : 1, 1, pointerType, true);
    else finishStroke(pts, 2, 1, 1, pointerType, false);
    for (let s = 1; s < strokes; s++) {
      if (run.debugState().done) break;
      pts = run.debugPoints();
      if (!pts.length) break;
      const dot = svg.querySelector('.start')?.getBoundingClientRect();
      const x = dot ? dot.x + dot.width / 2 : pts[0][0];
      const y = dot ? dot.y + dot.height / 2 : pts[0][1];
      const id = 10 + s, ident = 10 + s;
      T('touchstart', ident, x, y);
      P('pointerdown', id, x, y, 1, 'touch');
      for (let i = 1; i < pts.length; i++) P('pointermove', id, pts[i][0], pts[i][1], 1, 'touch');
      P('pointerup', id, pts[pts.length - 1][0], pts[pts.length - 1][1], 0, 'touch');
      T('touchend', ident, pts[pts.length - 1][0], pts[pts.length - 1][1]);
    }
    const state = run.debugState();
    return {
      state, strokes,
      ink: svg.querySelectorAll('.ink, .doneink').length,
      stars: document.querySelectorAll('#tr-tray .emoji:not(.off)').length,
    };
  }, { cancel, touchOnly, pointerType });
  return { ...started, end };
}

test('m: a finger traces every stroke from the green dot and the first move leaves ink', async ({ page }) => {
  await openTrace(page, 'm');
  const data = await traceLetter(page, { pointerType: 'touch' });
  expect(data.ua, 'desktop Macintosh UA').toContain('Macintosh');
  expect(data.ontouch, 'hasTouch').toBe(true);
  expect(data.touchPoints, 'iPadOS desktop reports a touch screen').toBeGreaterThan(0);
  expect(data.scale, 'SVG scale').toBeGreaterThan(3);
  expect(data.onDot && data.downOnDot, 'samples start on the green dot').toBe(true);
  expect(data.down.active, JSON.stringify(data.down)).toBe(true);
  expect(data.hit, 'the hint or the prompt took the press').not.toMatch(/ghosthand|ls-bubble|ls-mascot/);
  expect(data.hitTouchAction, data.hit).toBe('none');
  expect(data.svgTouchAction).toBe('none');
  expect(data.first.ink, 'ink on the first move').toBeGreaterThan(0);
  expect(data.first.k, JSON.stringify(data.first)).toBeGreaterThan(0);
  expect(data.strokes, 'm is traced in full').toBeGreaterThan(0);
  expect(data.end.state.done, JSON.stringify(data.end)).toBe(true);
  expect(data.end.ink).toBeGreaterThan(0);
  expect(data.end.stars).toBeGreaterThanOrEqual(1);
});

test('m: a Pencil pointercancel mid-stroke does not freeze the ink', async ({ page }) => {
  await openTrace(page, 'm');
  const data = await traceLetter(page, { pointerType: 'pen', cancel: 'pointercancel' });
  expect(data.down.active, 'pen press on the green dot').toBe(true);
  expect(data.first.ink, 'ink before the cancel').toBeGreaterThan(0);
  // Before the fix, traceHold treated pen like mouse and endStroke cleared the stroke here.
  expect(data.cancelled.active, JSON.stringify(data.cancelled)).toBe(true);
  expect(data.end.state.done, JSON.stringify(data.end)).toBe(true);
  expect(data.end.stars).toBeGreaterThanOrEqual(1);
});

test('m: a finger pointercancel mid-stroke still finishes every stroke', async ({ page }) => {
  await openTrace(page, 'm');
  const data = await traceLetter(page, { pointerType: 'touch', cancel: 'pointercancel' });
  expect(data.cancelled.active, JSON.stringify(data.cancelled)).toBe(true);
  expect(data.end.state.done, JSON.stringify(data.end)).toBe(true);
  expect(data.end.ink).toBeGreaterThan(0);
});

test('m: touch events alone, with no pointerdown, still register on the green dot', async ({ page }) => {
  await openTrace(page, 'm');
  const data = await traceLetter(page, { touchOnly: true });
  expect(data.first.active, JSON.stringify(data.first)).toBe(true);
  expect(data.first.ink, 'first touchmove inks').toBeGreaterThan(0);
  expect(data.end.state.done, JSON.stringify(data.end)).toBe(true);
});

test('m: a press on the green dot still counts when getScreenCTM ignores the iPad scale', async ({ page }) => {
  await openTrace(page, 'm');
  const data = await page.evaluate(() => {
    const svg = document.getElementById('tr-svg');
    const dot = svg.querySelector('.start').getBoundingClientRect();
    const x = dot.x + dot.width / 2, y = dot.y + dot.height / 2;
    svg.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; } });
    svg.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId: 4, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: 1,
    }));
    const state = window.kitphonic.lesson.run.debugState();
    return { active: state.active, k: state.k };
  });
  expect(data.active, JSON.stringify(data)).toBe(true);
});

test('m: the pointing-hand hint does not swallow the green dot', async ({ page }) => {
  await openTrace(page, 'm');
  await page.waitForSelector('.ghosthand', { timeout: 8_000 });
  const data = await page.evaluate(() => {
    const svg = document.getElementById('tr-svg');
    const hand = document.querySelector('.ghosthand');
    const dot = svg.querySelector('.start').getBoundingClientRect();
    const x = dot.x + dot.width / 2, y = dot.y + dot.height / 2;
    const hit = document.elementFromPoint(x, y);
    const cs = getComputedStyle(hand);
    svg.parentElement.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: 1,
    }));
    const down = window.kitphonic.lesson.run.debugState();
    const pts = window.kitphonic.lesson.run.debugPoints();
    svg.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
      clientX: pts[1][0], clientY: pts[1][1], buttons: 1,
    }));
    return {
      active: down.active,
      ink: svg.querySelectorAll('.ink').length,
      hit: hit?.id || (hit?.className?.baseVal ?? hit?.className ?? ''),
      // WebKit's computed pointer-events is often "", so the inline style is the one we set.
      pointerEvents: hand.style.pointerEvents || cs.getPropertyValue('pointer-events') || cs.pointerEvents,
      callout: hand.style.webkitTouchCallout || cs.getPropertyValue('-webkit-touch-callout') || cs.webkitTouchCallout,
      touchAction: hand.style.touchAction || cs.getPropertyValue('touch-action') || cs.touchAction,
    };
  });
  expect(String(data.hit)).not.toMatch(/ghosthand/);
  expect(data.pointerEvents).toBe('none');
  expect(data.callout).toBe('none');
  expect(data.touchAction).toBe('none');
  expect(data.active, JSON.stringify(data)).toBe(true);
  expect(data.ink).toBeGreaterThan(0);
});

test('m: page zoom and a Stage Manager offset still hit the green dot', async ({ page }) => {
  await openTrace(page, 'm');
  const data = await page.evaluate(() => {
    const svg = document.getElementById('tr-svg');
    const dot = svg.querySelector('.start').getBoundingClientRect();
    const x = dot.x + dot.width / 2, y = dot.y + dot.height / 2;
    const real = svg.getScreenCTM.bind(svg);
    const press = () => {
      svg.parentElement.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: 1,
      }));
      const active = window.kitphonic.lesson.run.debugState().active;
      svg.parentElement.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: 0,
      }));
      return active;
    };
    svg.getScreenCTM = () => { const m = real(); return new DOMMatrix([1, m.b, m.c, 1, m.e, m.f]); };
    const zoom = press();
    svg.getScreenCTM = () => { const m = real(); return new DOMMatrix([m.a, m.b, m.c, m.d, m.e + 90, m.f + 140]); };
    const offset = press();
    return { zoom, offset };
  });
  expect(data.zoom, 'CTM ignored the zoom').toBe(true);
  expect(data.offset, 'CTM missed the viewport offset').toBe(true);
});

test('m: a stale owner does not block the next press on the card', async ({ page }) => {
  await openTrace(page, 'm');
  const data = await page.evaluate(() => {
    const svg = document.getElementById('tr-svg');
    const card = svg.parentElement;
    const run = window.kitphonic.lesson.run;
    const dot = svg.querySelector('.start').getBoundingClientRect();
    const x = dot.x + dot.width / 2, y = dot.y + dot.height / 2;
    const fire = (type, id, buttons) => card.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons,
    }));
    fire('pointerdown', 1, 1);
    const stuck = run.debugOwner();
    fire('pointerdown', 2, 1); // no pointerup for 1: the lift was lost, and no touch was within 4px
    return { stuck, owner: run.debugOwner(), active: run.debugState().active };
  });
  expect(data.stuck).toBe(1);
  expect(data.owner, JSON.stringify(data)).toBe(2);
  expect(data.active).toBe(true);
});

function boxesOverlap(a, b) {
  return a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0
    && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('m: the trace log stays off the letter, collapsed and expanded', async ({ page }) => {
  await page.goto('/?skipHello=1&reducedMotion=1&activity=trace&gpc=m&tracelog=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => (window.kitphonic?.lesson?.run?.debugPoints?.() ?? []).length > 2 && document.getElementById('tracelog'),
    null,
    { timeout: 15_000 },
  );
  const measure = () => page.evaluate(() => {
    const box = document.getElementById('tracelog').getBoundingClientRect();
    const card = document.querySelector('#trace .tcard').getBoundingClientRect();
    const pre = document.querySelector('#tracelog pre');
    const btn = document.getElementById('tracelog-log');
    const copy = document.getElementById('tracelog-copy');
    const size = el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; };
    return {
      open: pre && !pre.hidden,
      boxPE: getComputedStyle(document.getElementById('tracelog')).pointerEvents,
      btnPE: getComputedStyle(btn).pointerEvents,
      log: size(btn),
      copy: copy && !copy.hidden ? size(copy) : null,
      box: { x: box.x, y: box.y, w: box.width, h: box.height },
      card: { x: card.x, y: card.y, w: card.width, h: card.height },
    };
  });
  const collapsed = await measure();
  expect(collapsed.open, 'starts as the Log pill').toBe(false);
  expect(collapsed.boxPE).toBe('none');
  expect(collapsed.btnPE).toBe('auto');
  expect(collapsed.log.h, 'Log is a grown-up target').toBeGreaterThanOrEqual(44);
  expect(collapsed.log.w).toBeGreaterThanOrEqual(44);
  expect(boxesOverlap(collapsed.box, collapsed.card), JSON.stringify(collapsed)).toBe(false);
  await page.locator('#tracelog-log').click();
  const expanded = await measure();
  expect(expanded.open).toBe(true);
  expect(expanded.log.h).toBeGreaterThanOrEqual(44);
  expect(expanded.copy.h, 'Copy is a grown-up target').toBeGreaterThanOrEqual(44);
  expect(expanded.copy.w).toBeGreaterThanOrEqual(44);
  expect(boxesOverlap(expanded.box, expanded.card), JSON.stringify(expanded)).toBe(false);
  const data = await traceLetter(page, { pointerType: 'touch' });
  expect(data.end.state.done, JSON.stringify(data.end)).toBe(true);
  expect(data.first.ink).toBeGreaterThan(0);
});

test('a: a finger still traces the bowl from its green dot', async ({ page }) => {
  await openTrace(page, 'a');
  const data = await traceLetter(page, { pointerType: 'touch' });
  expect(data.down.active, 'press on the green dot of a').toBe(true);
  expect(data.downOnDot).toBe(true);
  expect(data.first.ink, 'ink on the first move').toBeGreaterThan(0);
  expect(data.end.state.done, JSON.stringify(data.end)).toBe(true);
  expect(data.end.stars).toBeGreaterThanOrEqual(1);
});
