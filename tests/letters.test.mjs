// Phase 1–2 letter activities: tap modes, rounds, floating motion, hit testing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as LL from '../js/letter-logic.js';
import { tapResult, LETTERS } from '../js/core.js';
import { rng } from '../js/word-logic.js';

test('Phase 1 name-only mode: letter says its name', () => {
  assert.equal(tapResult('name', 'letter', 'm').play, 'name');
  assert.equal(LL.letterClip('name', 'letter', 's').id, 'name-s');
  assert.equal(LL.letterClip('sound', 'letter', 's').id, 'snd-s');
  assert.equal(LL.letterClip('nameDot', 'dot', 's').id, 'snd-s');
});
test('tap mode per activity: Phase 1 = name; Phase 2 = sound until L1 blending mastered, then name+dot', () => {
  assert.equal(LL.letterTapMode('find'), 'name'); assert.equal(LL.letterTapMode('float'), 'sound'); assert.equal(LL.letterTapMode('float', { floatMode: 'name' }), 'name');
  assert.equal(LL.letterTapMode('hunt'), 'sound'); assert.equal(LL.letterTapMode('soundTap', { blendL1Mastered: true }), 'nameDot');
  assert.equal(LL.letterTapMode('hunt', { override: 'nameDot' }), 'nameDot');
});
test('assessed activities are static; only free exploration drifts (R14)', () => {
  assert.equal(LL.ACTIVITIES.find.drift, false); assert.equal(LL.ACTIVITIES.hunt.drift, false); assert.equal(LL.ACTIVITIES.float.drift, true);
});
test('round letters: target included, 3–6 letters, unique, never a confusable pair', () => {
  const r = rng(3);
  for (let k = 0; k < 50; k++) {
    const t = LETTERS[k % 8], ls = LL.roundLetters(t, LETTERS, { n: 3 + (k % 4), rand: r });
    assert.ok(ls.includes(t)); assert.ok(ls.length >= 3 && ls.length <= 6); assert.equal(new Set(ls).size, ls.length);
  }
  const bd = LL.roundLetters('b', ['b', 'd', 'm', 's', 'a'], { n: 5, rand: r });
  assert.ok(!(bd.includes('b') && bd.includes('d')));
});
test('round targets cycle without immediate repeats', () => {
  const t = LL.roundTargets(['m', 's', 'a'], 7, rng(1));
  assert.equal(t.length, 7); for (let i = 1; i < t.length; i++) assert.notEqual(t[i], t[i - 1]);
});
test('floating letters: 20–40 pt/s, never leave the box', () => {
  const box = { left: 0, right: 960, top: 150, bottom: 560 }, items = LL.floatInit(['m', 's', 'a', 't'], { box, rand: rng(2) });
  for (const it of items) { const sp = Math.hypot(it.vx, it.vy); assert.ok(sp >= 20 && sp <= 40, sp); }
  for (let i = 0; i < 2000; i++) LL.floatStep(items, 50, box, i * 50);
  for (const it of items) assert.ok(it.x >= 60 && it.x <= 900 && it.y >= 210 && it.y <= 500, JSON.stringify(it));
});
test('tapped letter pauses', () => {
  const box = { left: 0, right: 960, top: 0, bottom: 600 }, [it] = LL.floatInit(['m'], { box, rand: rng(4) });
  it.pausedUntil = 1000; const x = it.x; LL.floatStep([it], 100, box, 500); assert.equal(it.x, x);
  LL.floatStep([it], 100, box, 1500); assert.notEqual(it.x, x);
});
test('hit test: nearest letter within ~80 pt counts', () => {
  const items = [{ l: 'm', x: 100, y: 100 }, { l: 's', x: 250, y: 100 }];
  assert.equal(LL.hitTest(items, 170, 100).l, 'm'); assert.equal(LL.hitTest(items, 190, 100).l, 's');
  assert.equal(LL.hitTest(items, 100, 200), null);
});
test('static layout: centred, fits the stage', () => {
  const p = LL.staticLayout(6, { w: 540, top: 200 });
  assert.equal(p.length, 6); for (const q of p) assert.ok(q.x - 60 >= 0 && q.x + 60 <= 540);
  const l = LL.staticLayout(4, { w: 960, top: 200 }); assert.ok(Math.abs((l[0].x + l[3].x) / 2 - 480) < 1e-9);
});

test('balanced grids: never a lone tile (4 -> 2x2, 5 -> 3+2, 6 -> 3+3 / one row of 6 when wide)', () => {
  assert.deepEqual(LL.gridRows(4, 3), [2, 2]); assert.deepEqual(LL.gridRows(5, 3), [3, 2]);
  assert.deepEqual(LL.gridRows(6, 3), [3, 3]); assert.deepEqual(LL.gridRows(6, 6), [6]); assert.deepEqual(LL.gridRows(3, 3), [3]);
  for (let n = 2; n <= 6; n++) for (const per of [3, 4, 6]) { const r = LL.gridRows(n, per); assert.ok(!(r.length > 1 && r.includes(1)), `${n}/${per}`); assert.ok(Math.max(...r) - Math.min(...r) <= 1); }
  const p = LL.staticLayout(4, { w: 400, top: 200, perRow: 3 }); assert.equal(new Set(p.map(q => q.y)).size, 2);
});
test('floating letters never overlap (phone landscape box: one row of 6; portrait; tablet) over 30 s of drift', () => {
  const boxes = [[{ left: 20, right: 847, top: 130, bottom: 384 }, [55, 62]], [{ left: 20, right: 380, top: 220, bottom: 737 }, [55, 62]],
    [{ left: 20, right: 940, top: 170, bottom: 480 }, [60, 68]]];
  for (const [box, half] of boxes) for (const seed of [1, 2, 3]) {
    const items = LL.floatInit(['m', 's', 'a', 't', 'p', 'i'], { box, rand: rng(seed), half });
    assert.ok(!LL.overlapping(items), `initial overlap ${JSON.stringify(box)}`);
    for (let k = 0; k < 1500; k++) { LL.floatStep(items, 20, box, k * 20); assert.ok(!LL.overlapping(items), `overlap at step ${k} box ${box.right}`); }
    for (const it of items) assert.ok(it.x - half[0] >= box.left - 1e-6 && it.x + half[0] <= box.right + 1e-6 && it.y - half[1] >= box.top - 1e-6 && it.y + half[1] <= box.bottom + 1e-6);
  }
});

test('round targets terminate with repeated / single targets (session planner passes [g, g, ...])', () => {
  assert.deepEqual(LL.roundTargets(['m', 'm'], 5, rng(1)), ['m', 'm', 'm', 'm', 'm']);
  const t = LL.roundTargets(['p', 'p', 'm'], 6, rng(2)); assert.equal(t.length, 6);
  for (let i = 1; i < t.length; i++) assert.notEqual(t[i], t[i - 1]);
});
