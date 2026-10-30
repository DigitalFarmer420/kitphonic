// v2 V2: slider fade-out ladder — every transition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { patternSupport, supportFor, supportPattern, S, SUPPORT_RULES } from '../js/support.js';

const DAY = 864e5, T0 = Date.UTC(2026, 9, 1, 17); // 10:00 local-ish; days are calendar days in local time
let n = 0;
const r = (support, correct, extra = {}) => ({ skill: 'blend:L2', pattern: 'CVC', support, itemId: `w${n++}`, correct, firstAttempt: true, assisted: false,
  scored: support !== 4, ...(support === 4 ? { modelled: true } : {}), hints: 0, dotTaps: 0, helpUsed: false, latencyFromLastDotMs: 2000, sessionId: 'a', timestamp: T0 + n * 1000, ...extra });
const run = (k, support, correct, day = 0, extra = {}) => Array.from({ length: k }, () => r(support, correct, { timestamp: T0 + day * DAY + (n + 1) * 1000, sessionId: `d${day}`, ...extra }));
const base = (rs, p = 'CVC') => patternSupport(rs, p, T0 + 30 * DAY).level;
const cvc = { w: 'mat', level: 2, parse: 'm a t' };

test('patterns: L2/L3 share CVC; L4 CCVC, L5 CVCC, L6 digraph, L7 suffix; L1 VC', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(level => supportPattern({ level })), ['VC', 'CVC', 'CVC', 'CCVC', 'CVCC', 'digraph', 'suffix']);
});
test('start: first-ever blending at S4; a new pattern at S3 once the previous pattern reached S2', () => {
  assert.equal(base([], 'VC'), S.MODEL); assert.equal(base([], 'CVC'), S.MODEL);
  const vc = [...run(6, 4, true, 0), ...run(5, 3, true, 1), ...run(5, 3, true, 2)].map(x => ({ ...x, pattern: 'VC', skill: 'blend:L1' }));
  assert.equal(base(vc, 'VC'), S.DOTS); assert.equal(base(vc, 'CVC'), S.BLEND);
});
test('S4 -> S3 after 6 modelled sweeps (same session is fine); flings do not count', () => {
  assert.equal(base(run(5, 4, true)), S.MODEL);
  assert.equal(base(run(6, 4, true)), S.BLEND);
  assert.equal(base([...run(5, 4, true), ...run(3, 4, true, 0, { fling: true })]), S.MODEL);
});
test('S3 -> S2: >= 90% of the last 10 clean trials on 2 different days; same-day sessions do not advance', () => {
  const m = run(6, 4, true);
  assert.equal(base([...m, ...run(12, 3, true, 0), ...run(4, 3, true, 0, { sessionId: 'other-same-day' })]), S.BLEND); // one day only
  assert.equal(base([...m, ...run(5, 3, true, 1), ...run(5, 3, true, 2)]), S.DOTS);
  assert.equal(base([...m, ...run(5, 3, true, 1), ...run(3, 3, true, 2), ...run(2, 3, false, 2)]), S.BLEND); // 80%
});
test('S3 -> S2 needs rare hints (<= 1 replay per 10); assisted / dot-tapped / help items do not count as clean', () => {
  const m = run(6, 4, true);
  assert.equal(base([...m, ...run(5, 3, true, 1), ...run(3, 3, true, 2), ...run(2, 3, true, 2, { hints: 1 })]), S.BLEND);
  assert.equal(base([...m, ...run(5, 3, true, 1), ...run(4, 3, true, 2, { assisted: true }), ...run(1, 3, true, 2)]), S.BLEND);
  assert.equal(base([...m, ...run(5, 3, true, 1), ...run(4, 3, true, 2, { dotTaps: 1 }), ...run(1, 3, true, 2)]), S.BLEND);
});
const toS2 = () => [...run(6, 4, true), ...run(5, 3, true, 1), ...run(5, 3, true, 2)];
test('S2 -> S1: >= 90%, dot taps on <= 20% of items, median pick <= 4 s after the last dot, 2 days', () => {
  assert.equal(base(toS2()), S.DOTS);
  assert.equal(base([...toS2(), ...run(5, 2, true, 3), ...run(5, 2, true, 4)]), S.READ);
  assert.equal(base([...toS2(), ...run(5, 2, true, 3, { latencyFromLastDotMs: 4500 }), ...run(5, 2, true, 4, { latencyFromLastDotMs: 6000 })]), S.DOTS); // slow: stay
  assert.equal(base([...toS2(), ...run(10, 2, true, 3)]), S.DOTS); // one day
  assert.equal(base([...toS2(), ...run(5, 2, true, 3), ...run(5, 2, true, 4), ...run(3, 2, true, 4, { dotTaps: 1 })]), S.READ); // already S1
  assert.equal(base([...toS2(), ...run(4, 2, true, 3), ...run(3, 2, true, 3, { dotTaps: 2 }), ...run(6, 2, true, 4)]), S.DOTS); // 3/10 tapped
});
test('step back up: < 70% over the last 10 at the level; never because of speed', () => {
  assert.equal(base([...toS2(), ...run(4, 2, true, 3), ...run(4, 2, false, 3), ...run(2, 2, true, 3)]), S.BLEND); // 60%
  const s1 = [...toS2(), ...run(5, 2, true, 3), ...run(5, 2, true, 4)];
  assert.equal(base([...s1, ...run(10, 1, true, 5, { latencyFromOnsetMs: 9000, latencyFromLastDotMs: 9000 })]), S.READ); // slow but right
  assert.equal(base([...s1, ...run(3, 1, true, 5), ...run(4, 1, false, 5), ...run(3, 1, true, 5)]), S.DOTS);
});
test('S1 help overuse (> 30% of 10) returns the pattern to S2', () => {
  const s1 = [...toS2(), ...run(5, 2, true, 3), ...run(5, 2, true, 4)];
  assert.equal(base([...s1, ...run(6, 1, true, 5), ...run(4, 1, true, 5, { helpUsed: true })]), S.DOTS);
  assert.equal(base([...s1, ...run(7, 1, true, 5), ...run(3, 1, true, 5, { helpUsed: true })]), S.READ);
});
test('in session: 2 misses in a row -> one level more support; back after 2 correct in a row (temporary)', () => {
  const log = [...toS2(), ...run(2, 2, false, 3)], at = { sessionId: 'd3', now: T0 + 3 * DAY + 1e6 };
  assert.deepEqual([supportFor(log, cvc, at).level, supportFor(log, cvc, at).base], [S.BLEND, S.DOTS]);
  const back = [...log, ...run(2, 3, true, 3)];
  assert.equal(supportFor(back, cvc, at).level, S.DOTS);
  assert.equal(supportFor([...log, ...run(1, 3, true, 3)], cvc, at).level, S.BLEND);
});
test('a missed word comes back one level more supported until it is read right on a later day', () => {
  const log = [...toS2(), r(2, false, { itemId: 'mat', timestamp: T0 + 3 * DAY, sessionId: 'd3' })];
  assert.equal(supportFor(log, cvc, { sessionId: 'd4', now: T0 + 4 * DAY }).level, S.BLEND);
  const sameDay = [...log, r(3, true, { itemId: 'mat', timestamp: T0 + 3 * DAY + 5000, sessionId: 'd3' })];
  assert.equal(supportFor(sameDay, cvc, { sessionId: 'd4', now: T0 + 4 * DAY }).level, S.BLEND);
  const later = [...log, r(3, true, { itemId: 'mat', timestamp: T0 + 4 * DAY, sessionId: 'd4' })];
  assert.equal(supportFor(later, cvc, { sessionId: 'd5', now: T0 + 5 * DAY }).level, S.DOTS);
});
test('14+ day break: the first 3 items of the session get one level more support', () => {
  const log = toS2(), now = T0 + 2 * DAY + 15 * DAY;
  assert.equal(supportFor(log, cvc, { sessionId: 'back', now }).level, S.BLEND);
  const three = [...log, ...run(3, 3, true, 17, { sessionId: 'back' })];
  assert.equal(supportFor(three, cvc, { sessionId: 'back', now }).level, S.DOTS);
  assert.equal(supportFor(log, cvc, { sessionId: 'soon', now: T0 + 2 * DAY + 13 * DAY }).level, S.DOTS);
});
test('a word with a sound introduced this session or the last is served at S2 at most for its first 2 encounters', () => {
  const s1 = [...toS2(), ...run(5, 2, true, 3), ...run(5, 2, true, 4)];
  const intro = { skill: 'sound:g', itemId: 'g', correct: true, firstAttempt: true, timestamp: T0 + 5 * DAY, sessionId: 'd5' };
  const pig = { w: 'pig', level: 2, parse: 'p i g' }, at = { sessionId: 'd5', now: T0 + 5 * DAY + 1e5 };
  assert.equal(supportFor([...s1, intro], cvc, at).level, S.READ);
  assert.equal(supportFor([...s1, intro], pig, at).level, S.DOTS);
  const twice = [...s1, intro, r(2, true, { itemId: 'pig', timestamp: T0 + 5 * DAY + 10, sessionId: 'd5' }), r(2, true, { itemId: 'pig', timestamp: T0 + 5 * DAY + 20, sessionId: 'd5' })];
  assert.equal(supportFor(twice, pig, at).level, S.READ);
});
test('rules are the v2 thresholds', () => {
  assert.equal(SUPPORT_RULES.downAcc, 0.9); assert.equal(SUPPORT_RULES.upAcc, 0.7); assert.equal(SUPPORT_RULES.maxMedianPickMs, 4000); assert.equal(SUPPORT_RULES.breakDays, 14);
});
