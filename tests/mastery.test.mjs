// Review R7: per-skill mastery, spaced review, guess guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/mastery.js';

const T0 = new Date(2026, 9, 1, 9, 0).getTime(), H = 36e5, D = M.DAY;
// n responses for a skill in one session at time t
const sess = (skill, sessionId, t, results, extra = {}) =>
  results.map((correct, i) => ({ skill, itemId: 'x' + i, correct: !!correct, firstAttempt: true, assisted: false, timestamp: t + i * 1000, sessionId, ...extra }));
const ok = n => Array(n).fill(1);
const mostly = (n, wrong) => Array.from({ length: n }, (_, i) => (i < wrong ? 0 : 1));

test('1/1 correct does not master (nor secure)', () => {
  const s = M.skillState(sess('sound:m', 'a', T0, [1]), 'sound:m', T0 + D);
  assert.equal(s.state, 'practicing'); assert.equal(s.masteredAt, null);
});
test('>=90% on >=5 tries in 2 sessions on different days masters', () => {
  const log = [...sess('sound:m', 'a', T0, ok(5)), ...sess('sound:m', 'b', T0 + D, mostly(10, 1))];
  const s = M.skillState(log, 'sound:m', T0 + D + H);
  assert.equal(s.state, 'mastered'); assert.ok(s.masteredAt);
});
test('two qualifying sessions on the same day do not master', () => {
  const log = [...sess('sound:m', 'a', T0, ok(6)), ...sess('sound:m', 'b', T0 + 3 * H, ok(6))];
  assert.equal(M.skillState(log, 'sound:m', T0 + 4 * H).state, 'secure');
});
test('fewer than 5 tries per session do not qualify; blend skills need 10', () => {
  assert.notEqual(M.skillState([...sess('sound:s', 'a', T0, ok(4)), ...sess('sound:s', 'b', T0 + D, ok(4))], 'sound:s', T0 + 2 * D).state, 'mastered');
  const b5 = [...sess('blend:L1', 'a', T0, ok(5)), ...sess('blend:L1', 'b', T0 + D, ok(5))];
  assert.notEqual(M.skillState(b5, 'blend:L1', T0 + 2 * D).state, 'mastered');
  const b10 = [...sess('blend:L1', 'a', T0, ok(10)), ...sess('blend:L1', 'b', T0 + D, ok(10))];
  assert.equal(M.skillState(b10, 'blend:L1', T0 + D + H).state, 'mastered');
  assert.ok(M.blendL1Mastered(b10, T0 + D + H));
});
test('assisted, retry (not first attempt), fast and unscored answers do not count', () => {
  for (const extra of [{ assisted: true }, { firstAttempt: false }, { fast: true }, { scored: false }]) {
    const log = [...sess('sound:a', 'a', T0, ok(6), extra), ...sess('sound:a', 'b', T0 + D, ok(6), extra)];
    const s = M.skillState(log, 'sound:a', T0 + 2 * D);
    assert.equal(s.trials, 0, JSON.stringify(extra)); assert.equal(s.state, 'new');
  }
});
test('due dates step through 1 / 3 / 7 / 14 / 30 days on correct reviews', () => {
  let log = [...sess('sound:t', 'a', T0, ok(5)), ...sess('sound:t', 'b', T0 + D, ok(5))];
  let st = M.skillState(log, 'sound:t'); const mAt = st.masteredAt;
  assert.equal(st.due - mAt, 1 * D);
  let t = st.due;
  for (const [i, days] of [3, 7, 14, 30, 30].entries()) {
    log = [...log, ...sess('sound:t', 'r' + i, t + H, [1])];
    st = M.skillState(log, 'sound:t', t + H + 1);
    assert.equal(st.state, 'mastered'); assert.equal(Math.round((st.due - (t + H)) / D), days);
    t = st.due;
  }
  assert.equal(M.skillState(log, 'sound:t', t + 1).state, 'review-due');
  assert.equal(M.dueItems(log, t + 1)[0].skill, 'sound:t');
});
test('2 consecutive review misses -> lapsed -> practicing; one miss keeps it due', () => {
  const base = [...sess('sound:p', 'a', T0, ok(5)), ...sess('sound:p', 'b', T0 + D, ok(5))];
  const due = M.skillState(base, 'sound:p').due;
  const one = [...base, ...sess('sound:p', 'r1', due + H, [0])];
  assert.equal(M.skillState(one, 'sound:p', due + 2 * H).state, 'review-due');
  const two = [...one, ...sess('sound:p', 'r2', due + 2 * H, [0])];
  const s = M.skillState(two, 'sound:p', due + 3 * H);
  assert.equal(s.state, 'practicing'); assert.equal(s.lapses, 1);
});
test('guess guard rejects a 100 ms fling and fast picks', () => {
  assert.equal(M.guessGuard({ sweepMs: 100, phonemes: 3 }).scored, false);
  assert.equal(M.guessGuard({ sweepMs: 900, phonemes: 3 }).scored, true);
  assert.equal(M.guessGuard({ sweepMs: 900, phonemes: 3, pickLatencyMs: 300 }).fast, true);
  assert.equal(M.guessGuard({ sweepMs: 900, phonemes: 3, pickLatencyMs: 1200 }).fast, false);
});
test('per-skill pacing keeps the spec 90 / 60–89 / <60 thresholds', () => {
  assert.equal(M.pacingFor([...sess('blend:L2', 'a', T0, mostly(10, 5)), ...sess('blend:L2', 'b', T0 + D, mostly(10, 6))], 'blend:L2'), 'stepBack');
  assert.equal(M.pacingFor([...sess('blend:L2', 'a', T0, mostly(10, 2))], 'blend:L2'), 'practice');
  assert.equal(M.pacingFor([...sess('blend:L2', 'a', T0, ok(10)), ...sess('blend:L2', 'b', T0 + D, mostly(10, 1))], 'blend:L2'), 'advance');
  assert.equal(M.pacingFor([...sess('blend:L3', 'a', T0, ok(10))], 'blend:L2'), 'practice'); // other skills ignored
});
test('blending unlock: >=4 sound skills secure incl. a vowel; known GPCs', () => {
  const four = ['m', 's', 't', 'p'].flatMap(g => sess('sound:' + g, 'a', T0, ok(5)));
  assert.equal(M.blendingUnlocked(four, T0 + H), false);
  const withA = [...four, ...sess('sound:a', 'a', T0, ok(5))];
  assert.equal(M.blendingUnlocked(withA, T0 + H), true);
  assert.deepEqual([...M.knownGpcs(withA, T0 + H)].sort(), ['a', 'm', 'p', 's', 't']);
});
test('store: local-only log with cap', () => {
  const mem = new Map(), storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  const st = M.createStore(storage, 'k', 3);
  for (let i = 0; i < 5; i++) st.log({ skill: 'sound:m', correct: true, firstAttempt: true });
  assert.equal(st.all().length, 3); assert.ok(st.all()[0].timestamp); st.clear(); assert.equal(st.all().length, 0);
});
