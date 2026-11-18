// rc6: iPad tracing — one finger owns a stroke (a palm / second finger can't break it); hit-test + tolerance logic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTracer, strokeOwner, STROKES, resample, traceHold, traceTouch, traceContact, letterPoint, screenToLetter } from '../js/trace.js';

function strokeOf(letter) {
  const t = createTracer(letter, { tol: 17 });
  return { t, P: t.strokes[0] };
}
// What lesson-screen.js did before the hold: pointercancel calls tracer.up(), so later moves do nothing.
function oldCancelThenMove(letter) {
  const { t, P } = strokeOf(letter);
  t.down(P[0][0], P[0][1]);
  t.up();
  for (let i = 4; i < P.length; i += 4) t.move(P[i][0], P[i][1]);
  return t.state();
}
function drawAfter(letter, interrupt, { mid = false } = {}) {
  const { t, P } = strokeOf(letter);
  const svg = {};
  t.down(P[0][0], P[0][1]);
  const cut = Math.min(Math.max(2, Math.floor(P.length / 3)), P.length - 8);
  if (mid) for (let i = 1; i <= cut; i++) t.move(P[i][0], P[i][1]);
  const atCancel = t.state();
  const act = traceHold({ type: interrupt, target: svg, svg, pointerType: 'touch' });
  if (act !== 'hold') t.up();
  for (let i = (mid ? cut : 0) + 1; i < P.length; i++) t.move(P[i][0], P[i][1]);
  return { act, atCancel, state: t.state() };
}

test('early pointercancel used to stop the ink; holding it lets the same finger continue', () => {
  const dropped = oldCancelThenMove('s');
  assert.equal(dropped.k, 0, 'without the hold, pointercancel calls up() and the stroke stays at 0');
  assert.equal(dropped.active, false);
  const kept = drawAfter('s', 'pointercancel');
  assert.equal(kept.act, 'hold');
  assert.ok(kept.state.k > 0 || kept.state.done, 'moves after an immediate cancel still ink');
});

test('a mid-stroke touch cancel also pauses, and a child lostpointercapture is ignored', () => {
  const kept = drawAfter('s', 'pointercancel', { mid: true });
  assert.equal(kept.act, 'hold');
  assert.ok(kept.state.done || kept.state.stroke > kept.atCancel.stroke || kept.state.k > kept.atCancel.k, 'touchmoves after a mid-stroke cancel still ink');
  const lost = drawAfter('s', 'lostpointercapture', { mid: true });
  assert.equal(lost.act, 'hold');
  assert.ok(lost.state.done || lost.state.stroke > lost.atCancel.stroke || lost.state.k > lost.atCancel.k);
  const svg = {}, child = {};
  assert.equal(traceHold({ type: 'lostpointercapture', target: child, svg, pointerType: 'touch' }), 'ignore');
  assert.equal(traceHold({ type: 'pointercancel', target: svg, svg, pointerType: 'mouse' }), 'end');
  assert.equal(traceHold({ type: 'pointercancel', target: svg, svg, pointerType: 'pen' }), 'hold', 'a Pencil cancel pauses, it does not freeze the ink');
  assert.equal(traceHold({ type: 'lostpointercapture', target: svg, svg, pointerType: 'pen' }), 'hold');
  assert.equal(traceHold({ type: 'pointerup', target: svg, svg, pointerType: 'pen' }), 'end');
  assert.equal(traceHold({ type: 'pointercancel', target: svg, svg, pointerType: 'mouse', touchDevice: true }), 'hold', 'iPadOS can label a finger as mouse');
  assert.equal(traceContact('pen'), 'touch');
  assert.equal(traceContact('mouse'), 'mouse');
  assert.equal(traceContact('mouse', { touchDevice: true }), 'touch');
  assert.equal(traceContact(''), 'touch');
});

test('a CTM that ignores the iPad CSS scale would miss the green dot; the border box still hits it', () => {
  // Letter 'a' start, viewed at ~8.5 CSS px per user unit (iPad portrait).
  const box = { left: 40, top: 120, width: 850, height: 850, vbX: 0, vbY: 40, vbWidth: 100, vbHeight: 100 };
  const ux = 73, uy = 74;
  const sx = box.left + (ux - box.vbX) / box.vbWidth * box.width;
  const sy = box.top + (uy - box.vbY) / box.vbHeight * box.height;
  const bad = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; } };
  const missed = screenToLetter(bad, sx, sy);
  assert.ok(Math.hypot(missed[0] - ux, missed[1] - uy) > 20, 'scale-1 CTM maps the visible dot outside startTol');
  const fixed = letterPoint(bad, sx, sy, box);
  assert.ok(Math.hypot(fixed[0] - ux, fixed[1] - uy) < 1, 'the border box maps the press onto the dot');
  const scale = box.width / box.vbWidth;
  const good = {
    a: scale, b: 0, c: 0, d: scale,
    e: box.left - box.vbX * scale, f: box.top - box.vbY * scale,
    inverse() { return { a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: -this.e / scale, f: -this.f / scale }; },
  };
  const same = letterPoint(good, sx, sy, box);
  assert.ok(Math.hypot(same[0] - ux, same[1] - uy) < 0.5, 'a CTM that matches the box is kept');
  assert.equal(letterPoint(null, sx, sy, box)[0].toFixed(1), ux.toFixed(1));
  // A phone card is taller than a wide letter. The viewBox is letterboxed, not stretched.
  const phone = { left: 21.5, top: 177.4, width: 346.9, height: 547.6, vbX: 16.08, vbY: -6, vbWidth: 157.92, vbHeight: 153 };
  const pFit = Math.min(phone.width / phone.vbWidth, phone.height / phone.vbHeight);
  const pPadY = (phone.height - phone.vbHeight * pFit) / 2;
  const py = phone.top + pPadY + (122 - phone.vbY) * pFit;
  const px = phone.left + (34.41 - phone.vbX) * pFit;
  const phoneCtm = { a: pFit, b: 0, c: 0, d: pFit, e: phone.left - phone.vbX * pFit, f: phone.top + pPadY - phone.vbY * pFit,
    inverse() { return { a: 1 / pFit, b: 0, c: 0, d: 1 / pFit, e: -this.e / pFit, f: -this.f / pFit }; } };
  const kept = letterPoint(phoneCtm, px, py, phone);
  assert.ok(Math.hypot(kept[0] - 34.41, kept[1] - 122) < 0.5, 'letterboxing must not throw away a correct CTM');
  const phoneBad = letterPoint(bad, px, py, phone);
  assert.ok(Math.hypot(phoneBad[0] - 34.41, phoneBad[1] - 122) < 0.5, 'a scale-1 CTM still uses the fitted box');
  // Zoom and a Stage Manager offset must not drag the finger off the rect. The CTM is wrong; the box is not.
  const viewport = { offsetLeft: 40, offsetTop: 90, scale: 2 };
  const zoomed = letterPoint(bad, sx, sy, box, viewport);
  assert.ok(Math.hypot(zoomed[0] - ux, zoomed[1] - uy) < 1, 'visualViewport scale does not replace the rect');
  const shifted = { a: 8.5, b: 0, c: 0, d: 8.5, e: box.left + 120, f: box.top - 80, inverse() { return { a: 1 / 8.5, b: 0, c: 0, d: 1 / 8.5, e: -this.e / 8.5, f: -this.f / 8.5 }; } };
  const offset = letterPoint(shifted, sx, sy, box, { offsetLeft: 30, offsetTop: 50, scale: 1 });
  assert.ok(Math.hypot(offset[0] - ux, offset[1] - uy) < 1, 'a CTM missing the Stage Manager offset still hits the dot');
});

test('only the touch that started the stroke is followed', () => {
  const owner = { identifier: 4, clientX: 10, clientY: 10 };
  const palm = { identifier: 9, clientX: 11, clientY: 10 };
  assert.equal(traceTouch([palm, owner], { id: 4, last: [10, 10] }).identifier, 4);
  assert.equal(traceTouch([palm], { id: 4, last: [80, 80] }).identifier, 9, 'nearest only when the owner finger is gone');
});

test('strokeOwner: the first finger owns the stroke; other pointers can neither take it nor end it', () => {
  const o = strokeOwner();
  assert.equal(o.claim(1), true); assert.equal(o.owns(1), true);
  assert.equal(o.claim(2), false, 'palm down mid-stroke is ignored'); assert.equal(o.owns(2), false);
  assert.equal(o.release(2), false, 'palm lift does not end the stroke'); assert.equal(o.owns(1), true);
  assert.equal(o.claim(1), true, 're-claim by the owner is fine');
  assert.equal(o.release(1), true); assert.equal(o.id, null);
  assert.equal(o.claim(2), true, 'after the owner lifts, any finger may start'); o.reset(); assert.equal(o.id, null);
});

test('a finished stroke stays owned until that finger lifts, so a second pointer cannot start the next one', () => {
  const o = strokeOwner();
  assert.equal(o.claim(7), true); // stroke started; strokeDone must not release or reset
  assert.equal(o.claim(8), false, 'second finger cannot claim the next stroke');
  assert.equal(o.release(8), false); assert.equal(o.owns(7), true);
  assert.equal(o.release(7), true, 'the owning finger lifts');
  assert.equal(o.claim(8), true);
});

test('tracer hit test: green dot accepts a fat-finger press within startTol, rejects one far away', () => {
  const t = createTracer('l', { tol: 17 }), P = t.strokes[0];
  assert.equal(t.down(P[0][0] + 19, P[0][1]).active, true);
  assert.equal(createTracer('l', { tol: 17 }).down(P[0][0] + 21, P[0][1]).active, false);
  assert.equal(createTracer('l', { tol: 17 }).down(P.at(-1)[0], P.at(-1)[1]).active, false, 'must start at the dot');
});

test('tolerance is in letter units, so it scales with the letter on screen (iPad = phone, as a share of the letter)', () => {
  for (const g of ['s', 'a', 'k', 'm', 'sh']) {
    const t = createTracer(g, { tol: 17 });
    for (const P of t.strokes) { // wobble ±14 units (just inside tol) perpendicular-ish along the whole stroke
      assert.equal(t.down(P[0][0], P[0][1]).active, true, g);
      let st; for (let i = 1; i < P.length; i++) { st = t.move(P[i][0] + (i % 2 ? 14 : -14) * 0.7, P[i][1] + (i % 2 ? -14 : 14) * 0.7); if (st.strokeDone) break; }
      assert.equal(st.strokeDone, true, `${g}: wobbly stroke completes`);
    }
    assert.equal(t.state().done, true);
  }
});

test('fast strokes: coalesced samples complete a stroke a single big jump cannot (no skipping ahead)', () => {
  const P = resample(STROKES.l[0]);
  const big = createTracer('l'); big.down(...P[0]); assert.equal(big.move(...P.at(-1)).strokeDone, undefined, 'one jump to the end is ignored');
  const co = createTracer('l'); co.down(...P[0]); let st; for (let i = 4; i < P.length; i += 4) st = co.move(...P[i]); st = co.move(...P.at(-1));
  assert.equal(co.state().stroke, 1, 'coalesced samples finish the stroke'); assert.ok(st);
});

test('trace screen wiring: pointer ownership, coalesced events, cancel and lost capture keep the ink', () => {
  const src = readFileSync(new URL('../js/lesson-screen.js', import.meta.url), 'utf8');
  assert.match(src, /owner\.id !== null && !owner\.owns\(e\.pointerId\)\) return/); // next stroke waits until the owning finger lifts
  assert.match(src, /dragging && !owner\.owns\(e\.pointerId\)\) return/);
  assert.match(src, /onpointermove = e => \{\s*if \(!dragging \|\| !run \|\| !owner\.owns\(e\.pointerId\)\) return/);
  assert.match(src, /getCoalescedEvents/);
  assert.match(src, /letterPoint\(svg\.getScreenCTM\(\)/);
  assert.doesNotMatch(src, /owner\.reset\(\)/);
  assert.match(src, /onpointerup = svg\.onpointercancel = endStroke/);
  assert.match(src, /onlostpointercapture = e => \{[^\n]*traceHold\([^\n]*=== 'hold'\) held = true;\s*scheduleLostCaptureOnSelf\(e, pid => owner\.owns\(pid\), \(\) => endStroke\(e\)\)/); // a finger or Pencil pauses at once; a real mouse still ends next turn
  assert.doesNotMatch(src, /onlostpointercapture = endStroke/);
  assert.match(src, /addEventListener\('pointercancel', endStroke\)/);
  const endAt = src.indexOf('const endStroke');
  assert.ok(endAt > 0);
  assert.doesNotMatch(src.slice(endAt, src.indexOf('svg.onpointerup')), /reset\(\)|replaceChildren/); // cancel / lost capture keeps the ink
  assert.match(src, /passive: false/);
  assert.match(src, /tryCapture\(card, e\.pointerId\)/); // capture the HTML card, including a finger (not the SVG)
  assert.match(src, /traceContact\(e\.pointerType/);
  assert.doesNotMatch(src, /pointerType !== 'pen'/);
  assert.match(src, /addEventListener\('pointerdown', onpointerdown, true\)/);
  assert.match(src, /tracelog=1/);
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  assert.match(css, /#tr-svg\{[^}]*touch-action:none/); assert.match(css, /\.short #lesson\.tracing \.top\{pointer-events:none\}/); assert.match(css, /html,body\{[^}]*touch-action:none/);
});

test('two-stroke letters after an iOS cancel: the finished stroke is released when its finger lifts (PR #18 Uiux)', () => {
  const src = readFileSync(new URL('../js/lesson-screen.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  // drawMarks() replaces the start dot under the finger when a stroke finishes: no child may be a touch target.
  assert.match(css, /#tr-svg \*\{pointer-events:none\}/);
  assert.match(css, /#tr-svg \.hit\{[^}]*pointer-events:all/);
  assert.doesNotMatch(css.replace(/#tr-svg \.hit\{[^}]*}/, ''), /#tr-svg [^{]*\{[^}]*pointer-events:(auto|all|visible)/);
  // a lift ends a held stroke, and a stroke already finished by touchmoves (no pointerup will come)
  assert.match(src, /if \(mine && \(held \|\| !dragging \|\| !pointerStream\)\) finishStroke\(\)/);
  // a new press clears an owner whose touch never bound or has already lifted, whatever the distance
  assert.match(src, /touchId == null \|\| !live\.has\(touchId\)\)\) finishStroke\(\)/);
  assert.match(src, /live\.size === 0\) finishStroke\(\)/);
  // a touchend that never reached the svg cannot leave a stale finger in `live`
  assert.match(src, /for \(const id of \[\.\.\.live\.keys\(\)\]\) if \(!on\.has\(id\)\) live\.delete\(id\)/);
});
