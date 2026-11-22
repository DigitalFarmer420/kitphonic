// Option D + Education Researcher brief in-session re-model (approved by Vinh 2026-11-21).
// Standing support never returns to the 6-sweep modelled phase once it is done. After two S3 misses on
// the same word in a session: one brief unscored re-model, then a counted S3 try. A further miss drops
// the word for later, still at S3 + the hand demo. Combined Spec §3.7.1 90/60 thresholds are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { patternSupport, supportFor, sessionCorrection, modelledPhaseDone, S, SUPPORT_RULES, supportPattern } from '../js/support.js';
import { planSession, wordStepBack, STEP_BACK_MIN_READS } from '../js/session.js';
import { mapState, progressMarkers, knownForServing } from '../js/progress.js';
import { createStore, pacingFor, counts, RULES } from '../js/mastery.js';
import { pacing } from '../js/core.js';
import { hasWordCheck, wordCards, needsCheck } from '../js/word-logic.js';
import { memoryStorage, seedProgress } from '../js/dev-seed.js';
import { servedSupport } from '../js/word-screen.js';

const DAY = 864e5, T0 = Date.UTC(2026, 9, 1, 17);
let n = 0;
const r = (support, correct, extra = {}) => ({ skill: 'blend:L2', pattern: 'CVC', support, itemId: extra.itemId ?? `w${n++}`, correct, firstAttempt: true, assisted: false,
  scored: support !== 4 && !extra.briefModel, ...(support === 4 || extra.briefModel ? { modelled: true } : {}), hints: 0, dotTaps: 0, helpUsed: false,
  latencyFromLastDotMs: 2000, sessionId: 'a', timestamp: T0 + n * 1000, ...extra });
const run = (k, support, correct, day = 0, extra = {}) => Array.from({ length: k }, () => r(support, correct, { timestamp: T0 + day * DAY + (n + 1) * 1000, sessionId: extra.sessionId ?? `d${day}`, ...extra }));
const base = (rs, p = 'CVC') => patternSupport(rs, p, T0 + 30 * DAY);
const outOfModel = () => run(6, 4, true);
const sat = { w: 'sat', level: 2, parse: 's a t' };

test('D: thresholds in §3.7.1 stay 90% / 60%; support <70% and 90% fade stay as they are', () => {
  assert.equal(SUPPORT_RULES.upAcc, 0.7);
  assert.equal(SUPPORT_RULES.downAcc, 0.9);
  const twoBad = [{ total: 5, correct: 2 }, { total: 5, correct: 2 }];
  const mid = [{ total: 5, correct: 4 }, { total: 5, correct: 3 }];
  const good = [{ total: 10, correct: 9 }, { total: 10, correct: 9 }];
  assert.equal(pacing(twoBad), 'stepBack');
  assert.equal(pacing(mid), 'practice');
  assert.equal(pacing(good), 'advance');
  assert.equal(RULES.masterAcc, 0.9);
});

test('D: after the modelled phase, a miss stays at you-blend plus the hand demo, never S4', () => {
  const log = [...outOfModel(), r(3, false, { itemId: 'sat', sessionId: 'd1', timestamp: T0 + DAY })];
  const s = supportFor(log, sat, { sessionId: 'd1', now: T0 + DAY + 1000 });
  assert.ok(modelledPhaseDone(base(log)));
  assert.equal(s.base, S.BLEND);
  assert.equal(s.level, S.BLEND);
  assert.ok(s.guided);
  assert.ok(!s.briefModel);
});

test('D: the whole-pattern <70% rule does not send a finished pattern back into 6 modelled sweeps', () => {
  const log = [...outOfModel(), ...run(4, 3, true, 1), ...run(6, 3, false, 1)];
  assert.equal(base(log).level, S.BLEND, '40% of the last 10 at S3 stays at S3, not S4');
  assert.ok(modelledPhaseDone(base(log)));
  assert.equal(base([...outOfModel(), ...run(5, 3, true, 1), ...run(5, 3, true, 2)]).level, S.DOTS, '90% over 2 days still fades');
});

test('D: a valid <60% sample still uses the one-session step-back (A), then re-enters at S3', () => {
  const KEY = 'kitphonic.v1.responses';
  const storage = memoryStorage({ [KEY]: JSON.stringify(seedProgress(6, { now: T0 })) });
  const store = createStore(storage);
  const now = T0 + DAY;
  store.logMany(['sat', 'mat', 'map', 'pat', 'tap'].map((w, i) => ({ skill: 'blend:L2', itemId: w, correct: i === 0, firstAttempt: true, assisted: false, scored: true, support: 3, pattern: 'CVC', timestamp: now + i * 1000, sessionId: 'a' })));
  store.logMany(['sat', 'mat', 'map', 'pat', 'tap'].map((w, i) => ({ skill: 'blend:L2', itemId: w, correct: false, firstAttempt: true, assisted: false, scored: true, support: 3, pattern: 'CVC', timestamp: now + DAY + i * 1000, sessionId: 'b' })));
  const add = progressMarkers(store.all(), { now: now + DAY + 1e5 }); if (add.length) store.logMany(add);
  assert.equal(pacingFor(store.all(), 'blend:L2', { minStepBackReads: STEP_BACK_MIN_READS }), 'stepBack');
  assert.equal(wordStepBack(store.all(), 2), 'warmup');
  assert.equal(mapState(store.all(), now + DAY + 1e5).current.id, 'words:L2', 'the map never moves backward');
});

test('D: after two S3 misses on the same word in a session, one brief re-model, then a counted S3 try', () => {
  const log = [...outOfModel(),
    r(3, false, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY }),
    r(3, false, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY + 2000 })];
  let s = supportFor(log, sat, { sessionId: 's', now: T0 + DAY + 3000 });
  assert.ok(s.briefModel); assert.equal(s.level, S.BLEND, "standing support stays at you-blend");
  const corr = sessionCorrection(log, sat, 's');
  assert.deepEqual(corr, { briefModel: true, defer: false });
  // the brief model itself
  log.push(r(4, true, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY + 4000, briefModel: true, modelled: true, scored: false }));
  s = supportFor(log, sat, { sessionId: 's', now: T0 + DAY + 5000 });
  assert.ok(!s.briefModel); assert.ok(!s.defer); assert.equal(s.level, S.BLEND);
  assert.equal(base(log).level, S.BLEND, 'the brief model does not restart or extend the modelled phase');
  // the next S3 try counts
  const try3 = r(3, true, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY + 6000, scored: true });
  assert.ok(counts(try3));
  log.push(try3);
  assert.ok(counts(log.at(-1)));
});

test('D: a miss after the brief re-model drops the word; it comes back later still at S3 plus the demo', () => {
  const log = [...outOfModel(),
    r(3, false, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY }),
    r(3, false, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY + 1000 }),
    r(4, true, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY + 2000, briefModel: true, modelled: true, scored: false }),
    r(3, false, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY + 3000 })];
  const now = supportFor(log, sat, { sessionId: 's', now: T0 + DAY + 4000 });
  assert.ok(now.defer); assert.ok(!now.briefModel); assert.equal(now.level, S.BLEND); assert.ok(now.guided);
  // next day: standing support is still S3 (the brief model did not change the base), with the demo until a later-day hit
  const tomorrow = supportFor(log, sat, { sessionId: 't', now: T0 + 2 * DAY });
  assert.equal(tomorrow.level, S.BLEND); assert.equal(tomorrow.base, S.BLEND);
  assert.ok(tomorrow.guided); assert.ok(!tomorrow.briefModel);
});

test('D: only one brief re-model per word per session — a later pair of misses does not restart S4', () => {
  const log = [...outOfModel(),
    r(3, false, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY }),
    r(3, false, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY + 1000 }),
    r(4, true, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY + 2000, briefModel: true, modelled: true, scored: false }),
    r(3, false, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY + 3000 }),
    r(3, false, { itemId: 'sat', sessionId: 's', timestamp: T0 + DAY + 8000 })];
  const s = supportFor(log, sat, { sessionId: 's', now: T0 + DAY + 9000 });
  assert.ok(!s.briefModel, 'no second full re-model');
  assert.equal(s.level, S.BLEND);
});

test('D: assist / re-entry rounds stay S3 exactly', () => {
  assert.equal(servedSupport({ hasCheck: true, assist: true, ladder: 4 }), S.BLEND);
  assert.equal(servedSupport({ hasCheck: true, assist: false, ladder: 3 }), S.BLEND);
});

test('the L4 "stop" stop prefers words that have a check, so a perfect child can finish in one or two sessions', () => {
  const c = seedProgress(26, { now: T0 }); // 26 passed stops -> current is words:L4 "stop"
  const add = progressMarkers(c, { now: T0 });
  const log = [...c, ...add];
  assert.equal(mapState(log, T0).current?.id, 'words:L4');
  const known = knownForServing(log, T0);
  const plan = planSession(log, { now: T0, minutes: 5, rand: () => 0.2, stars: false });
  const words = plan.items.filter(i => i.type === 'words' && i.why === 'new');
  assert.ok(words.length, JSON.stringify(plan.items.map(i => i.type + ':' + i.why)));
  const list = words[0].words;
  assert.ok(list.length >= 5, 'enough words for a secure sample');
  for (const e of list) {
    assert.ok(hasWordCheck(e, { known, level: 4, cfg: { wordCardCheck: true, checkPictureWords: true } }), `${e.w} must have a check`);
  }
});

test('hasWordCheck: pictured L4 words without a minimal pair still count if word cards exist (stop, flag)', () => {
  const known = new Set('m s a t p i n o d f c k u g e r h b l'.split(' '));
  const cfg = { checkPictureWords: true, wordCardCheck: true, choicesPerCheck: 3 };
  const stop = { w: 'stop', level: 4, parse: 's t o p', pic: '🛑' };
  const flag = { w: 'flag', level: 4, parse: 'f l a g', pic: '🚩' };
  assert.equal(needsCheck(stop, cfg, 4), false, 'stop has no pictured minimal pair');
  assert.equal(needsCheck(flag, cfg, 4), false, 'flag has no pictured minimal pair');
  assert.ok(wordCards('stop', { known, n: 3, rand: () => 0.3 }));
  assert.ok(wordCards('flag', { known, n: 3, rand: () => 0.3 }), 'flag has printed word cards (flap / flat)');
  assert.ok(hasWordCheck(stop, { known, cfg, level: 4 }));
  assert.ok(hasWordCheck(flag, { known, cfg, level: 4 }));
});
