// rc6: iPad tracing — one finger owns a stroke (a palm / second finger can't break it); hit-test + tolerance logic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTracer, strokeOwner, STROKES, resample } from '../js/trace.js';

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
  assert.match(src, /screenToLetter\(svg\.getScreenCTM\(\)/);
  assert.doesNotMatch(src, /owner\.reset\(\)/);
  assert.match(src, /onpointerup = svg\.onpointercancel = svg\.onlostpointercapture = endStroke/);
  assert.match(src, /addEventListener\('pointercancel', endStroke\)/);
  const endAt = src.indexOf('const endStroke');
  assert.ok(endAt > 0);
  assert.doesNotMatch(src.slice(endAt, endAt + 280), /reset\(\)|replaceChildren/); // cancel / lost capture keeps the ink
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  assert.match(css, /#tr-svg\{[^}]*touch-action:none/); assert.match(css, /\.short #lesson\.tracing \.top\{pointer-events:none\}/); assert.match(css, /html,body\{[^}]*touch-action:none/);
});
