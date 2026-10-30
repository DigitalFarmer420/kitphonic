// Spec §3.7.1 adaptive pacing (step back) and error-pattern practice, wired into the session planner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSession } from '../js/session.js';
import { seedProgress } from '../js/dev-seed.js';
import { mapState } from '../js/progress.js';
import { errorPatterns } from '../js/patterns.js';
import { makeChoices, wordCards, rng, cardContrast } from '../js/word-logic.js';
import { troubleSpots } from '../js/parent.js';
import { DAY } from '../js/mastery.js';

const now = Date.UTC(2026, 9, 30, 17);
const trials = (skill, itemId, sid, t0, n, ok, extra = {}) => Array.from({ length: n }, (_, i) =>
  ({ skill, itemId, correct: i < ok, firstAttempt: true, assisted: false, scored: true, timestamp: t0 + i * 1000, sessionId: sid, ...extra }));
const plan = log => planSession(log, { now, rand: rng(3), minutes: 7 });

test('step back (words): < 60 % on blend:L3 two sessions running -> the easier passed level, assisted, no message', () => {
  const base = seedProgress(9, { now }); assert.equal(mapState(base, now).current.level, 3);
  const calm = plan(base).items.find(i => i.type === 'words');
  assert.equal(calm.level, 3); assert.ok(!calm.assist);
  const log = [...base, ...trials('blend:L3', 'pin', 'a', now - 2 * DAY, 10, 4), ...trials('blend:L3', 'pin', 'b', now - DAY, 10, 5)];
  const it = plan(log).items.find(i => i.type === 'words' && i.why === 'easier');
  assert.ok(it, 'a step-back words round'); assert.equal(it.level, 2); assert.equal(it.assist, true);
  // one bad session is not enough (60–89 % or a single dip = more practice on the same skill)
  const one = [...base, ...trials('blend:L3', 'pin', 'b', now - DAY, 10, 4)];
  assert.ok(!plan(one).items.some(i => i.why === 'easier'));
});

test('step back (sound): < 60 % on the current sound two sessions running -> explore + 3-tile hunt with early hints', () => {
  const base = seedProgress(10, { now }), g = mapState(base, now).current.gpc; assert.equal(g, 'o');
  const log = [...base, ...trials('sound:o', 'o', 'a', now - 2 * DAY, 5, 1), ...trials('sound:o', 'o', 'b', now - DAY, 5, 2)];
  const items = plan(log).items, easy = items.filter(i => i.why === 'easier');
  assert.ok(easy.some(i => i.activity === 'soundTap' && i.newSound === 'o'));
  const h = easy.find(i => i.activity === 'hunt'); assert.ok(h.assist && h.n === 3 && h.pool.length === 3 && h.pool.includes('o'));
  assert.ok(h.targets.every(t => t === 'o'));
});

test('error pattern: a letter mix-up (b picked for d twice) -> a hunt with both letters on screen, alternating', () => {
  const base = seedProgress(25, { now });
  const miss = (t, target, picked) => ({ skill: `sound:${target}`, itemId: target, picked, correct: false, firstAttempt: true, scored: true, timestamp: t, sessionId: 'x' });
  const log = [...base, miss(now - 3 * DAY, 'd', 'b'), miss(now - DAY, 'b', 'd')];
  assert.deepEqual(errorPatterns(log, now).pairs.map(p => [p.a, p.b, p.n]), [['b', 'd', 2]]);
  const it = plan(log).items.find(i => i.why === 'pattern' && i.type === 'letters');
  assert.ok(it); assert.ok(it.pool.includes('b') && it.pool.includes('d') && it.n === 3);
  assert.deepEqual([...new Set(it.targets)].sort(), ['b', 'd']);
  assert.deepEqual(troubleSpots(log, now), ['mixes up b and d']);
  // older than 14 days: no longer a pattern
  assert.equal(errorPatterns(log, now + 20 * DAY).pairs.length, 0);
});

test('error pattern: short-vowel misses (>= 3) -> a words round whose checks lead with a vowel contrast', () => {
  const base = seedProgress(9, { now });
  const log = [...base, ...[1, 2, 3].map(k => ({ skill: 'blend:L3', itemId: 'pin', correct: false, firstAttempt: true, scored: true, contrast: 'vowel', timestamp: now - k * 3600e3, sessionId: 'v' }))];
  const it = plan(log).items.find(i => i.why === 'pattern' && i.type === 'words');
  assert.ok(it); assert.equal(it.focus, 'vowel'); assert.ok(it.words.length >= 2);
  assert.ok(troubleSpots(log, now)[0].includes('short vowel'));
});

test('focus contrast leads the picture check; word cards are tagged by position', () => {
  for (const s of [1, 2, 3, 4, 5]) assert.equal(makeChoices('pin', { rand: rng(s), strategy: 'focus:vowel', trial: s }).contrast, 'vowel');
  assert.equal(cardContrast('sit', 'sat'), 'vowel'); assert.equal(cardContrast('sit', 'fit'), 'onset'); assert.equal(cardContrast('sit', 'sip'), 'final');
  const c = wordCards('sit', { rand: rng(1), focus: 'final' }); if (c) assert.equal(c.contrast, 'final');
});
