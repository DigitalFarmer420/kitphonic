// Word-level step back (§3.7.1 thresholds unchanged; Education Researcher A + B + C, approved by Vinh 2026-11-21).
// Bug: two mat sessions under 60% sent the child to at/am, and since no new mat reads were ever logged the step
// back never ended. Misses on words Kit had modelled (S4) also pinned them at S4 all day, so few reads counted.
//  A  one easier session on the last passed level, then the level's own words again with extra help (S3 + hand demo,
//     never a full model); still < 60% on a valid re-entry sample -> at most one more short warm-up, then the level.
//  B  a step back needs >= 5 counted reads across the two sessions; fewer: stay on the level and keep trying.
//  C  a miss on a modelled word is not 'missed last time' and does not count toward '2 misses in a row'; the next
//     presentation is guided (hand demo), then independent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSession, wordStepBack, STEP_BACK_MIN_READS } from '../js/session.js';
import { mapState, progressMarkers } from '../js/progress.js';
import { createStore, pacingFor, counts, passedStopIds } from '../js/mastery.js';
import { supportFor, supportPattern, S } from '../js/support.js';
import { memoryStorage, seedProgress } from '../js/dev-seed.js';
import { servedSupport } from '../js/word-screen.js';

const KEY = 'kitphonic.v1.responses';
const T0 = new Date(2026, 10, 2, 10, 0, 0).getTime(), H = 3600e3, D = 864e5;

function child(log = []) {
  const storage = memoryStorage({ [KEY]: JSON.stringify(log) });
  const store = createStore(storage);
  let t = T0;
  const sync = () => { const add = progressMarkers(store.all(), { now: t }); if (add.length) store.logMany(add); };
  sync();
  return { store, sync, get t() { return t; }, set t(v) { t = v; }, map: () => mapState(store.all(), t) };
}
const rng = seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
// Plays every word item of a planned session like word-screen.js records it (first pick only).
function playSession(c, { correct = () => true, sessionId = `s${c.t}`, rand = () => 0.2 } = {}) {
  const plan = planSession(c.store.all(), { now: c.t, minutes: 7, rand });
  for (const it of plan.items.filter(i => i.type === 'words')) for (const e of it.words) {
    c.t += 4000;
    const lad = supportFor(c.store.all(), e, { sessionId, now: c.t });
    if (lad.briefModel) {
      c.store.log({ skill: `blend:L${it.level ?? e.level}`, itemId: e.w, gpcs: e.parse?.split(' ') ?? [...e.w], correct: true, firstAttempt: true,
        assisted: false, scored: false, modelled: true, briefModel: true, support: S.MODEL, pattern: supportPattern(e), hints: 0, dotTaps: 0, helpUsed: false, timestamp: c.t, sessionId,
        ...(it.assist ? { stepBack: true } : {}), ...(it.stepBackFor ? { stepBackFor: it.stepBackFor } : {}) });
      c.t += 2000;
    }
    const sup = lad.briefModel ? S.BLEND : servedSupport({ hasCheck: true, assist: !!it.assist, ladder: lad.level }), modelled = sup === S.MODEL;
    c.store.log({ skill: `blend:L${it.level ?? e.level}`, itemId: e.w, gpcs: e.parse?.split(' ') ?? [...e.w], correct: !!correct(e, sup), firstAttempt: true,
      assisted: false, scored: !modelled, ...(modelled ? { modelled: true } : {}), fast: false, sweepMs: 1800, latencyMs: 1500, support: sup,
      pattern: supportPattern(e), hints: 0, dotTaps: 0, helpUsed: false, timestamp: c.t, sessionId,
      ...(it.assist ? { stepBack: true } : {}), ...(it.stepBackFor ? { stepBackFor: it.stepBackFor } : {}) });
    c.sync();
  }
  return plan;
}
const wordItems = plan => plan.items.filter(i => i.type === 'words' && i.why !== 'review' && i.why !== 'mixed' && i.why !== 'pattern');
const L2 = (skill = 'blend:L2', sid, t, res) => res.map((ok, i) => ({ skill, itemId: 'sat', correct: ok, firstAttempt: true, assisted: false, scored: true,
  support: 3, pattern: 'CVC', timestamp: t + i * 1000, sessionId: sid }));
const atMat = () => { const c = child(seedProgress(6, { now: T0 })); assert.equal(c.map().current.id, 'words:L2'); return c; };

// --- B ---
test('B: a word step back needs >= 5 counted reads across the two sessions; sounds are unchanged', () => {
  const few = [...L2(undefined, 'a', T0, [false, true]), ...L2(undefined, 'b', T0 + D, [false, false])];
  assert.equal(pacingFor(few, 'blend:L2'), 'stepBack', 'the plain rule (letters use it) is unchanged');
  assert.equal(pacingFor(few, 'blend:L2', { minStepBackReads: STEP_BACK_MIN_READS }), 'practice');
  const enough = [...L2(undefined, 'a', T0, [false, true, false]), ...L2(undefined, 'b', T0 + D, [false, false])];
  assert.equal(pacingFor(enough, 'blend:L2', { minStepBackReads: STEP_BACK_MIN_READS }), 'stepBack');
  const good = [...L2(undefined, 'a', T0, [true, true, true]), ...L2(undefined, 'b', T0 + D, [true, true, false])];
  assert.equal(pacingFor(good, 'blend:L2', { minStepBackReads: 5 }), 'practice', '60–89%: more practice on the same level');
});

test('B: too few independent reads keep the child on mat to collect more tries', () => {
  const c = atMat();
  c.store.logMany([...L2(undefined, 'a', T0 + 1000, [false, true]), ...L2(undefined, 'b', T0 + 2 * H, [false, false])]); c.t = T0 + 3 * H;
  const w = wordItems(planSession(c.store.all(), { now: c.t, rand: () => 0.2 }));
  assert.equal(w[0].level, 2); assert.equal(w[0].why, 'new'); assert.ok(!w[0].assist);
});

// --- A ---
test('A: one easier at/am session, then mat again with extra help — never parked on at/am', () => {
  const c = atMat();
  const before = passedStopIds(c.store.all()).size;
  c.store.logMany([...L2(undefined, 'a', T0 + 1000, [false, true, false]), ...L2(undefined, 'b', T0 + 2 * H, [false, false, true])]); c.t = T0 + 3 * H;
  assert.equal(wordStepBack(c.store.all(), 2), 'warmup');
  let plan = playSession(c, { sessionId: 'warm' });
  let w = wordItems(plan);
  assert.ok(w.length && w.every(i => i.level === 1 && i.why === 'easier' && i.assist && i.stepBackFor === 2), JSON.stringify(w.map(i => [i.level, i.why])));
  assert.equal(c.map().current.id, 'words:L2', 'the map never moves backward');
  assert.ok(passedStopIds(c.store.all()).size >= before, 'earned markers stay');
  c.t += H;
  plan = playSession(c, { sessionId: 're', correct: () => true });
  w = wordItems(plan);
  assert.deepEqual(w.map(i => [i.level, i.why, i.assist]), [[2, 'new', true]], 're-entry: mat with extra help');
  const re = c.store.all().filter(r => r.sessionId === 're');
  assert.ok(re.length >= 5 && re.every(r => r.support === S.BLEND && !r.modelled && counts(r)), 're-entry is S3 and counted, never a full model');
});

test('A: still < 60% on the re-entry -> one short warm-up at the start of the same session, then never again', () => {
  const c = atMat();
  c.store.logMany([...L2(undefined, 'a', T0 + 1000, [false, true, false]), ...L2(undefined, 'b', T0 + 2 * H, [false, false, true])]); c.t = T0 + 3 * H;
  playSession(c, { sessionId: 'warm' }); c.t += H;
  const miss = (e, sup) => e.level === 1; // reads at/am, misses every mat word
  playSession(c, { sessionId: 're1', correct: miss }); c.t += H;
  assert.equal(wordStepBack(c.store.all(), 2), 'shortWarmup');
  let w = wordItems(playSession(c, { sessionId: 're2', correct: miss }));
  assert.deepEqual(w.map(i => [i.level, i.why]), [[1, 'easier'], [2, 'new']]);
  assert.ok(w[0].words.length <= 2 && w[1].assist);
  for (let k = 0; k < 6; k++) { // keeps missing: always mat with help, no more warm-ups
    c.t += H; w = wordItems(playSession(c, { sessionId: 'more' + k, correct: miss }));
    assert.ok(w.some(i => i.level === 2), `session ${k}: mat is served`);
    assert.ok(!w.some(i => i.stepBackFor), `session ${k}: no third warm-up`);
  }
  assert.equal(c.map().current.id, 'words:L2');
});

test('A: generalised — the pin stop steps back to one mat warm-up, then pin again', () => {
  const c = child(seedProgress(9, { now: T0 })); assert.equal(c.map().current.id, 'words:L3');
  c.store.logMany([...L2('blend:L3', 'a', T0 + 1000, [false, true, false]), ...L2('blend:L3', 'b', T0 + 2 * H, [false, false, true])]); c.t = T0 + 3 * H;
  let w = wordItems(playSession(c, { sessionId: 'warm' }));
  assert.ok(w.every(i => i.level === 2 && i.stepBackFor === 3));
  c.t += H; w = wordItems(playSession(c, { sessionId: 're' }));
  assert.deepEqual(w.map(i => [i.level, !!i.assist]), [[3, true]]);
});

test('A: an older log (warm-up tagged stepBack only) still counts as the one warm-up', () => {
  const c = atMat();
  c.store.logMany([...L2(undefined, 'a', T0 + 1000, [false, true, false]), ...L2(undefined, 'b', T0 + 2 * H, [false, false, true]),
    ...[0, 1, 2, 3].map(i => ({ skill: 'blend:L1', itemId: i % 2 ? 'at' : 'am', correct: true, firstAttempt: true, scored: true, support: 3, pattern: 'VC', stepBack: true, timestamp: T0 + 3 * H + i * 1000, sessionId: 'old-warm' }))]);
  c.t = T0 + 4 * H;
  assert.equal(wordStepBack(c.store.all(), 2), 'reentry');
});

// --- C ---
const sat = { w: 'sat', level: 2, parse: 's a t' };
const rec = (o, t) => ({ skill: 'blend:L2', itemId: 'sat', firstAttempt: true, pattern: 'CVC', timestamp: t, sessionId: 'x', ...o });
test('C: a miss on a modelled word is not "missed last time"; the next presentation is guided, then independent', () => {
  // CVC out of the model (6 modelled sweeps), the last one a miss on sat
  const log = [...['mat', 'map', 'pat', 'tap', 'sap'].map((w, i) => rec({ itemId: w, correct: true, modelled: true, scored: false, support: 4 }, T0 + i * 1000)),
    rec({ correct: false, modelled: true, scored: false, support: 4 }, T0 + 9000)];
  let s = supportFor(log, sat, { sessionId: 'x', now: T0 + 10000 });
  assert.equal(s.base, S.BLEND); assert.equal(s.level, S.BLEND, 'no drop back to a full model'); assert.ok(s.guided);
  log.push(rec({ correct: true, scored: true, support: 3 }, T0 + 11000));
  s = supportFor(log, sat, { sessionId: 'x', now: T0 + 12000 });
  assert.equal(s.level, S.BLEND); assert.ok(!s.guided, 'then independent');
});

test('C: modelled misses do not make "2 misses in a row"; real misses still add support', () => {
  const log = [...['mat', 'map', 'pat', 'tap'].map((w, i) => rec({ itemId: w, correct: true, modelled: true, scored: false, support: 4 }, T0 + i * 1000)),
    rec({ itemId: 'tap', correct: false, modelled: true, scored: false, support: 4 }, T0 + 5000), rec({ itemId: 'map', correct: false, modelled: true, scored: false, support: 4 }, T0 + 6000)];
  assert.equal(supportFor(log, sat, { sessionId: 'x', now: T0 + 7000 }).level, S.BLEND);
  log.push(rec({ itemId: 'pat', correct: false, scored: true, support: 3 }, T0 + 8000));
  const after = supportFor(log, { w: 'pat', level: 2, parse: 'p a t' }, { sessionId: 'x', now: T0 + 9000 });
  assert.equal(after.level, S.BLEND, 'D: a real S3 miss stays at you-blend, never a full model');
  assert.ok(after.guided, 'D: the next try is the hand demo');
});

test('assist rounds are S3 exactly; a word without a check is still modelled', () => {
  assert.equal(servedSupport({ hasCheck: true, assist: true, ladder: 4 }), S.BLEND);
  assert.equal(servedSupport({ hasCheck: true, assist: true, ladder: 1 }), S.BLEND);
  assert.equal(servedSupport({ hasCheck: true, assist: false, ladder: 4 }), S.MODEL);
  assert.equal(servedSupport({ hasCheck: true, assist: false, ladder: 2 }), S.DOTS);
  assert.equal(servedSupport({ hasCheck: false, assist: true, ladder: 1 }), S.MODEL);
});

// --- bounded: realistic children pass mat; a perfect child still takes 2 sessions ---
function sessionsToPassMat(pWrong, seed) {
  const c = child(seedProgress(6, { now: T0 })), r = rng(seed);
  for (let s = 1; s <= 40; s++) {
    c.t += 5 * H;
    playSession(c, { sessionId: 'm' + s, correct: () => r() >= pWrong, rand: r });
    if (c.map().index > 6) return s;
  }
  return Infinity;
}
test('a perfect child still opens i on the second mat session', () => assert.equal(sessionsToPassMat(0, 1), 2));
// Before: 2 of 12 seeded 20%-wrong children and 6 of 12 35%-wrong ones never left mat (the step back never ended).
// A 65% reader is in the 60–89% "more practice" band and secure needs 80%, so 35% takes longer by design.
for (const [p, max] of [[0.2, 12], [0.35, 30]]) test(`a child wrong ${p * 100}% of the time passes mat within ${max} sessions`, () => {
  const n = Array.from({ length: 12 }, (_, i) => sessionsToPassMat(p, i + 1));
  assert.ok(n.every(x => x <= max), n.join(','));
});

// --- B for sounds (the same valid-sample rule; the sound step back already practises the same sound, so never parks) ---
test('B (sounds): two tiny < 60% samples do not step back; a valid sample still does', () => {
  const base = seedProgress(10, { now: T0 }); assert.equal(mapState(base, T0).current.gpc, 'o');
  const tr = (sid, t, res) => res.map((ok, i) => ({ skill: 'sound:o', itemId: 'o', correct: ok, firstAttempt: true, assisted: false, scored: true, timestamp: t + i * 1000, sessionId: sid }));
  const easier = log => planSession(log, { now: T0 + 3 * D, rand: () => 0.2 }).items.some(i => i.why === 'easier');
  assert.ok(!easier([...base, ...tr('a', T0 + D, [false, true]), ...tr('b', T0 + 2 * D, [false, false])]));
  assert.ok(easier([...base, ...tr('a', T0 + D, [false, true, false]), ...tr('b', T0 + 2 * D, [false, false])]));
});

// --- the whole map (tools/sim-map.mjs, planner level): every stop is reachable ---
test('whole map: a perfect child passes every one of the 56 stops in at most 2 sessions', async () => {
  const { simulate } = await import('../tools/sim-map.mjs');
  const r = await simulate({ wrong: 0, seed: 1, root: new URL('..', import.meta.url).pathname });
  assert.ok(r.done); assert.equal(r.per.length, 56);
  assert.ok(r.per.every(s => s.sessions >= 1 && s.sessions <= 2), r.per.filter(s => s.sessions > 2).map(s => `${s.label}:${s.sessions}`).join(' '));
});
test('whole map: a child wrong 20% of the time finishes the map with no stuck stop (seed 4 never left stop before this fix)', async () => {
  const { simulate } = await import('../tools/sim-map.mjs');
  const r = await simulate({ wrong: 0.2, seed: 4, root: new URL('..', import.meta.url).pathname, perStop: 20 });
  assert.ok(r.done, `stopped at ${r.at}`); assert.ok(!r.per.some(s => s.stuck));
});
