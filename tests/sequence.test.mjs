// Review R1: GPC sequence + confusable separation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GPCS, GPC, PROTOTYPE_SET, CONFUSABLE_PAIRS, MIN_CONFUSABLE_GAP, PAIR_GAP, CONTINUOUS } from '../js/sequence.js';
import { LETTERS, STRETCHY } from '../js/core.js';

test('first 8 GPCs are m s a t p i n o, and core.LETTERS reads them', () => {
  assert.deepEqual(GPCS.slice(0, 8).map(g => g.id), ['m', 's', 'a', 't', 'p', 'i', 'n', 'o']);
  assert.deepEqual(LETTERS, PROTOTYPE_SET); assert.equal(STRETCHY, CONTINUOUS);
});
test('every entry has {id, grapheme, phoneme, set, order, continuous}; ids unique; orders 1..n', () => {
  assert.equal(new Set(GPCS.map(g => g.id)).size, GPCS.length);
  GPCS.forEach((g, i) => {
    for (const k of ['id', 'grapheme', 'phoneme', 'set', 'order', 'continuous']) assert.ok(k in g, `${g.id}.${k}`);
    assert.equal(g.order, i + 1); assert.equal(typeof g.continuous, 'boolean');
  });
});
test(`confusable pairs are >= ${MIN_CONFUSABLE_GAP} positions apart and never in the same set`, () => {
  for (const [a, b] of CONFUSABLE_PAIRS) {
    assert.ok(GPC[a] && GPC[b], `${a}/${b} in sequence`);
    const rule = PAIR_GAP[`${a}|${b}`] ?? { gap: MIN_CONFUSABLE_GAP, sameSet: false };
    assert.ok(Math.abs(GPC[a].order - GPC[b].order) >= rule.gap, `${a}/${b} too close`);
    if (!rule.sameSet) assert.notEqual(GPC[a].set, GPC[b].set, `${a}/${b} same set`);
  }
});
test('continuous flags: m n s f l r v z a e i o u sh th th_v ng; stops are not', () => {
  for (const id of ['m', 'n', 's', 'f', 'l', 'r', 'v', 'z', 'a', 'e', 'i', 'o', 'u', 'sh', 'th', 'th_v', 'ng']) assert.ok(CONTINUOUS.has(id), id);
  for (const id of ['p', 't', 'k', 'c', 'b', 'd', 'g']) assert.ok(!CONTINUOUS.has(id), id);
});
test('v2 V4b/c: u and e are not adjacent (u in set 4, e in set 5); v and w are >= 3 apart and never in one letter round', async () => {
  assert.ok(GPC.e.order - GPC.u.order >= 2 && GPC.u.set === 4 && GPC.e.set === 5);
  assert.ok(GPC.w.order - GPC.v.order >= 3);
  const { roundLetters } = await import('../js/letter-logic.js');
  for (let k = 0; k < 30; k++) { const r = roundLetters('v', ['j', 'v', 'x', 'y', 'w', 'z'], { n: 4, rand: Math.random }); assert.ok(!(r.includes('v') && r.includes('w')), r.join()); }
});
