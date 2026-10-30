// Session runner: progress map + planner (5–10 min, new + spaced review, words unlock after >= 4 sounds incl. a vowel,
// untaught-sound check on every served item).
import test from 'node:test';
import assert from 'node:assert/strict';
import { STOPS, mapState, activeSounds, wordsUnlocked, availableStars } from '../js/progress.js';
import { planSession, planCost, letterPool } from '../js/session.js';
import { seedProgress } from '../js/dev-seed.js';
import { knownGpcs, blendingUnlocked, DAY } from '../js/mastery.js';
import { wordCards, rng } from '../js/word-logic.js';
import { parseIds } from '../js/validate.js';

const now = Date.UTC(2026, 9, 30, 17);
test('map stops follow the sound sequence with word levels in between', () => {
  assert.equal(STOPS.map(s => s.label).join(' '), 'm s a t at p mat i n pin o stop');
  assert.equal(STOPS.filter(s => s.kind === 'words').length, 4);
});
test('seeded progress N lands on stop N; passed / current / upcoming', () => {
  for (let n = 0; n <= STOPS.length; n++) {
    const m = mapState(seedProgress(n, { now }), now);
    assert.equal(m.index, n);
    assert.equal(m.stops.filter(s => s.status === 'passed').length, n);
    assert.equal(m.stops.filter(s => s.status === 'current').length, n < STOPS.length ? 1 : 0);
  }
});
test('words unlock only after >= 4 secure sounds including a vowel', () => {
  const cons = ['m', 's', 't', 'p'].flatMap((g, k) => Array.from({ length: 6 }, (_, i) => ({ skill: `sound:${g}`, correct: true, firstAttempt: true, timestamp: now - 1e6 + k * 100 + i, sessionId: 'a' })));
  assert.equal(blendingUnlocked(cons, now), false); // 4 consonants, no vowel
  assert.equal(wordsUnlocked(seedProgress(3, { now }), now), false); // m s a
  assert.equal(wordsUnlocked(seedProgress(4, { now }), now), true);  // m s a t
  assert.ok(!planSession(seedProgress(3, { now }), { now, rand: rng(1) }).items.some(i => i.type === 'words'));
  assert.ok(planSession(seedProgress(4, { now }), { now, rand: rng(1) }).items.some(i => i.type === 'words' && i.level === 1 && i.why === 'new'));
});
test('every plan: 5–10 minutes, untaught-sound check, targets on offer, review first when due', () => {
  for (let n = 0; n <= STOPS.length; n++) for (const due of [false, true]) for (const minutes of [5, 7, 10]) for (const seed of [1, 2]) {
    const r = seedProgress(n, { now, due }), p = planSession(r, { now, minutes, rand: rng(seed) }), known = knownGpcs(r, now), active = activeSounds(r, now);
    const tag = `n=${n} due=${due} min=${minutes}`;
    assert.ok(p.cost >= 5 * 60 && p.cost <= Math.max(5, minutes) * 60 + 35, `${tag}: cost ${p.cost}`);
    assert.equal(planCost(p.items), p.cost);
    for (const it of p.items) {
      if (it.type === 'sentence') for (const t of it.sentence.tokens) if (t.kind === 'word') for (const g of parseIds(t.entry)) assert.ok(known.has(g), `${tag}: sentence ${it.sentence.id} uses untaught ${g}`);
      if (it.type === 'words') for (const w of it.words) for (const g of parseIds(w)) assert.ok(known.has(g), `${tag}: ${w.w} uses untaught ${g}`);
      if (it.type === 'letters') {
        assert.ok(it.pool.length >= 3 && it.pool.length <= 6, `${tag}: pool ${it.pool}`);
        for (const t of it.targets ?? []) { assert.ok(it.pool.includes(t), `${tag}: target ${t} not in pool`); assert.ok(active.includes(t), `${tag}: target ${t} not introduced`); }
      }
    }
    if (due && n > 0) assert.equal(p.items[0].why, 'review', `${tag}: review first`);
    if (n < STOPS.length) assert.ok(p.items.some(i => i.why === 'new' || (STOPS[n].kind === 'words' && i.why === 'practice')), `${tag}: current stop served`);
  }
});
test('new sound: letter intro first, then explore, find, trace — the new sound is the main hunt target', () => {
  const p = planSession(seedProgress(5, { now }), { now, rand: rng(3) }); // current = p
  assert.deepEqual(p.items.slice(0, 4).map(i => i.activity), ['intro', 'soundTap', 'hunt', 'trace']);
  assert.equal(p.items[0].gpc, 'p'); assert.deepEqual(p.items[2].targets.slice(0, 2), ['p', 'p']);
});
test('first-ever session is varied (not only hunts): intro, float, find, trace, sound tap', () => {
  const p = planSession([], { now, rand: rng(1) }), acts = p.items.map(i => i.activity);
  for (const a of ['intro', 'float', 'hunt', 'trace', 'soundTap']) assert.ok(acts.includes(a), `${a} in ${acts}`);
  assert.ok(new Set(acts).size >= 5);
  assert.ok(acts.filter(a => a === 'hunt').length <= acts.length / 2, acts.join(' '));
});
test('letter pool: newest introduced sounds; untaught letters only pad below 3', () => {
  assert.deepEqual(letterPool(['m']), ['m', 's', 'a']);
  assert.deepEqual(letterPool(['m', 's', 'a', 't', 'p']), ['m', 's', 'a', 't', 'p']);
  assert.equal(letterPool(['m', 's', 'a', 't', 'p', 'i', 'n', 'o']).length, 6);
});
test('star words: only after their GPCs are known and words are open, <= 2 per level', () => {
  assert.deepEqual(availableStars(seedProgress(3, { now }), now), []);
  const s = availableStars(seedProgress(STOPS.length, { now }), now);
  for (const lv of [2, 3, 4]) assert.ok(s.filter(x => x.level === lv).length <= 2);
  assert.ok(s.some(x => x.w === 'the'));
});
test('word cards: printed minimal pairs (one letter different), taught GPCs only', () => {
  const c = wordCards('at', { rand: rng(1) });
  assert.ok(c.cards && c.length >= 2 && c.some(x => x.w === 'at'));
  for (const x of c) assert.equal([...x.w].filter((ch, i) => ch !== 'at'[i]).length, x.w === 'at' ? 0 : 1);
  const k = new Set(['m', 's', 'a', 't']), ck = wordCards('at', { rand: rng(2), known: k });
  for (const x of ck) assert.ok([...x.w].every(ch => k.has(ch)), x.w);
  assert.equal(wordCards('zzz'), null);
});

test('star words are introduced (scored finds) before they appear in sentences', () => {
  const r = seedProgress(STOPS.length, { now }), p = planSession(r, { now, rand: rng(1), minutes: 10 });
  assert.ok(p.items.some(i => i.type === 'star'), 'a new star word is introduced');
  assert.ok(!p.items.some(i => i.type === 'sentence'), 'no sentence before any star word was met');
  const met = [...r, { skill: 'star:the', itemId: 'the', correct: true, firstAttempt: true, timestamp: now - 1000, sessionId: 'x' }];
  const p2 = planSession(met, { now, rand: rng(1), minutes: 10 });
  const sent = p2.items.find(i => i.type === 'sentence'); assert.ok(sent, 'sentence once "the" is introduced');
  assert.ok(sent.sentence.stars.every(w => w === 'the'));
});
