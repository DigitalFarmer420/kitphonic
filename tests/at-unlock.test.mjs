// rc8: finishing "at" (words:L1) must open the next stop, sound:p.
// A perfect slow read of the planned lesson used to stay on "at" for six sessions: only at/am are
// servable (2 trials), the first 6 sweeps are modelled and unscored, and secure needs 5 counted reads.
// A fast slide still finished the word, was stored as a fling, and never counted — so "several"
// completions never moved the map. Standards stay: flings and fast picks do not pass the stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSession, fillWordList, sessionOutcome } from '../js/session.js';
import { mapState, progressMarkers, starCount, slippedStops } from '../js/progress.js';
import { createStore, skillState, guessGuard, RULES, counts } from '../js/mastery.js';
import { supportFor, patternSupport, supportPattern, S } from '../js/support.js';
import { memoryStorage } from '../js/dev-seed.js';
import { wordCards } from '../js/word-logic.js';
import { sweepOutcome, checkDelayMs } from '../js/word-screen.js';

const KEY = 'kitphonic.v1.responses';
const T0 = new Date(2026, 10, 2, 10, 0, 0).getTime();

function child(log = []) {
  const storage = memoryStorage({ [KEY]: JSON.stringify(log) });
  const store = createStore(storage);
  let scanned = -Infinity, t = T0;
  const sync = (now = t) => {
    const all = store.all(), add = progressMarkers(all, { since: scanned, now });
    scanned = Math.max(scanned, ...all.map(r => r.timestamp ?? 0), 0);
    if (add.length) store.logMany(add);
    return add;
  };
  sync(t);
  return {
    storage, store, sync,
    get t() { return t; }, set t(v) { t = v; },
    map: () => mapState(store.all(), t),
  };
}

function passSounds(c) {
  for (const g of ['m', 's', 'a', 't']) for (let i = 0; i < 5; i++) {
    c.t += 1000;
    c.store.log({ skill: `sound:${g}`, itemId: g, correct: true, firstAttempt: true, assisted: false, scored: true, timestamp: c.t, sessionId: 'letters' });
  }
  c.sync();
}

// The object word-screen.js records when the child finishes a word (sweep, then a first pick).
function finishWord(c, entry, { sessionId, sweepMs, pickLatencyMs, correct = true }) {
  c.t += 4000;
  const sup = supportFor(c.store.all(), entry, { sessionId, now: c.t }).level;
  const phonemes = entry.parse.split(' ').length;
  const sweepOk = guessGuard({ sweepMs, phonemes }).scored;
  const modelled = sup === S.MODEL;
  const scored = sweepOk && !modelled;
  c.store.log({
    skill: `blend:L${entry.level}`, itemId: entry.w, gpcs: entry.parse.split(' '),
    correct, firstAttempt: true, assisted: false,
    scored, ...(modelled ? { modelled: true } : {}),
    fast: guessGuard({ pickLatencyMs }).fast,
    sweepMs, latencyMs: pickLatencyMs, support: sup, pattern: supportPattern(entry),
    hints: 0, dotTaps: 0, helpUsed: false, timestamp: c.t, sessionId,
    ...(sweepOk ? {} : { fling: true }),
  });
  c.sync();
}

function playSession(c, { sweepMs = 1800, pickLatencyMs = 1500, correct = true, sessionId } = {}) {
  const sid = sessionId ?? `s${c.t}`;
  const plan = planSession(c.store.all(), { now: c.t, minutes: 7, rand: () => 0.2 });
  const words = plan.items.find(i => i.type === 'words' && i.why === 'new');
  assert.ok(words, 'the at lesson is in the plan');
  for (const w of words.words) finishWord(c, w, { sessionId: sid, sweepMs, pickLatencyMs, correct });
  return { plan, words };
}

test('at is stop 5; the next stop is the letter p', () => {
  const c = child(); passSounds(c);
  const m = c.map();
  assert.equal(m.current.id, 'words:L1');
  assert.equal(m.current.label, 'at');
  assert.equal(m.index, 4);
  assert.equal(m.stops[5].id, 'sound:p');
  assert.equal(m.stops[5].label, 'p');
  assert.equal(starCount(c.store.all(), c.t), 4);
});

test('the at lesson repeats only at/am enough times to finish modelling, then to score', () => {
  const c = child(); passSounds(c);
  const known = new Set(['m', 's', 'a', 't']);
  for (const w of ['at', 'am']) {
    const cards = wordCards(w, { rand: () => 0.3, known });
    assert.ok(cards && cards.length >= 2, `${w} has a word-card check`);
    for (const card of cards) assert.ok([...card.w].every(ch => known.has(ch)), card.w);
  }
  const first = playSession(c);
  const ws = first.words.words.map(w => w.w);
  assert.ok(ws.length >= RULES.secureMin, `need at least ${RULES.secureMin} trials, got ${ws.length}`);
  assert.ok(ws.length >= 6, 'one session must be able to finish the 6 modelled sweeps');
  assert.ok(ws.every(w => w === 'at' || w === 'am'), ws.join(','));
  assert.ok(ws.every((w, i) => !i || w !== ws[i - 1]), ws.join(','));
  assert.equal(c.map().current.id, 'words:L1', 'modelled practice does not open the next stop');
  assert.equal(patternSupport(c.store.all(), 'VC', c.t).level, S.BLEND);
});

test('two legitimate at sessions open p; the pass survives home, reload and review', () => {
  const c = child(); passSounds(c);
  const stars0 = starCount(c.store.all(), c.t);
  playSession(c, { sessionId: 'model' }); // Kit models; not scored
  assert.equal(c.map().current.id, 'words:L1');
  assert.equal(skillState(c.store.all(), 'blend:L1', c.t).trials, 0);
  c.t += 3600e3;
  playSession(c, { sessionId: 'read' }); // independent reads
  const m = c.map();
  assert.equal(m.current.id, 'sound:p', 'the next stop after at is p');
  assert.equal(starCount(c.store.all(), c.t), stars0 + 1);
  assert.ok(c.store.all().some(r => r.skill === 'stop:words:L1' && r.marker));
  // Home mid-session: no further answers. Reload: a new store replays the same log.
  const kept = c.map().index;
  const again = createStore(c.storage);
  again.logMany(progressMarkers(again.all(), { now: c.t }));
  again.logMany(progressMarkers(again.all(), { now: c.t })); // idempotent
  assert.equal(mapState(again.all(), c.t).index, kept);
  assert.equal(starCount(again.all(), c.t), stars0 + 1);
  // A later slip on t is review inside forward progress, not a walk back to at.
  c.t += 2000; c.store.log({ skill: 'sound:t', itemId: 't', correct: false, firstAttempt: true, scored: true, timestamp: c.t, sessionId: 'slip' });
  c.t += 2000; c.store.log({ skill: 'sound:t', itemId: 't', correct: false, firstAttempt: true, scored: true, timestamp: c.t, sessionId: 'slip' });
  c.sync();
  assert.equal(c.map().current.id, 'sound:p');
  assert.ok(starCount(c.store.all(), c.t) >= stars0 + 1);
  const plan = planSession(c.store.all(), { now: c.t, minutes: 7, rand: () => 0.2 });
  assert.equal(plan.stop.id, 'sound:p');
  assert.ok(plan.items.some(i => i.why === 'review' && i.targets?.includes('t')));
  assert.ok(!slippedStops(c.store.all(), c.t).some(s => s.id === 'words:L1'));
});

test('fast slides and fast picks never open the next stop; a later real session still can', () => {
  const c = child(); passSounds(c);
  for (let i = 0; i < 8; i++) {
    c.t += 3600e3;
    playSession(c, { sweepMs: 400, pickLatencyMs: 200, sessionId: 'fling' + i }); // under 250 ms/sound, pick under 600 ms
    assert.equal(c.map().current.id, 'words:L1');
  }
  assert.equal(skillState(c.store.all(), 'blend:L1', c.t).trials, 0);
  assert.equal(patternSupport(c.store.all(), 'VC', c.t).level, S.MODEL, 'flings do not finish the model');
  c.t += 3600e3; playSession(c, { sessionId: 'model-after' });
  assert.equal(c.map().current.id, 'words:L1');
  c.t += 3600e3; playSession(c, { sessionId: 'read-after' });
  assert.equal(c.map().current.id, 'sound:p');
});

test('fillWordList finishes on an empty pool and on a single word', () => {
  assert.deepEqual(fillWordList([], 6), []);
  assert.deepEqual(fillWordList(null, 4), []);
  assert.deepEqual(fillWordList([{ w: 'at' }], 0), []);
  const one = fillWordList([{ w: 'at' }], 6);
  assert.equal(one.length, 6); assert.ok(one.every(w => w.w === 'at'));
  const two = fillWordList([{ w: 'at' }, { w: 'am' }], 5, () => 0);
  assert.equal(two.length, 5);
  assert.ok(two.every((w, i) => !i || w.w !== two[i - 1].w));
});

test('a slow slide and a correct pick under 600 ms does not pass at', () => {
  const c = child(); passSounds(c);
  playSession(c, { sessionId: 'model' }); // six modelled sweeps; the stop stays put
  assert.equal(sessionOutcome(4, c.map().index), 'practice');
  c.t += 3600e3;
  // Cards used to open ~450 ms after the blend. A correct tap then is under the 600 ms guard.
  playSession(c, { sweepMs: 1800, pickLatencyMs: 450, sessionId: 'quick' });
  assert.equal(c.map().current.id, 'words:L1');
  const quick = c.store.all().filter(r => r.sessionId === 'quick');
  assert.ok(quick.length >= 5 && quick.every(r => r.correct && r.fast && !counts(r)));
  assert.equal(skillState(c.store.all(), 'blend:L1', c.t).trials, 0);
  assert.equal(sessionOutcome(4, c.map().index), 'practice');
  c.t += 3600e3;
  playSession(c, { sweepMs: 1800, pickLatencyMs: 1500, sessionId: 'counted' });
  assert.equal(c.map().current.id, 'sound:p');
  assert.equal(sessionOutcome(4, c.map().index), 'unlocked');
});

test('the check stays shut until the 600 ms guess window, so the first possible tap can count', () => {
  assert.equal(checkDelayMs(450), 600); // the old ~450 ms open is what made a quick correct tap unscored
  assert.equal(checkDelayMs(451), 600);
  assert.equal(checkDelayMs(800), 800); // a longer sound pause is not shortened
  assert.equal(guessGuard({ sweepMs: 1500, phonemes: 2, pickLatencyMs: 451 }).fast, true);
  assert.equal(guessGuard({ sweepMs: 1500, phonemes: 2, pickLatencyMs: checkDelayMs(451) }).fast, false);
});

test('a sweep under 250 ms per sound does not open the check; a real slide does', () => {
  assert.equal(sweepOutcome(400, 2), 'reslide');
  assert.equal(sweepOutcome(499, 2), 'reslide');
  assert.equal(sweepOutcome(500, 2), 'check');
  assert.equal(sweepOutcome(1800, 2), 'check');
  assert.equal(sweepOutcome(700, 3), 'reslide'); // 3 sounds still need 750 ms
  assert.equal(sweepOutcome(800, 3), 'check');
});

test('an older log of finished-but-unscored at trials is not marked passed, and is not wiped', () => {
  const c = child(); passSounds(c);
  const before = c.store.all().length;
  for (let i = 0; i < 10; i++) {
    c.t += 1000;
    // rc6 shape: the round completed, Kit had modelled or the slide was a fling, no marker
    c.store.log({ skill: 'blend:L1', itemId: i % 2 ? 'at' : 'am', correct: true, firstAttempt: true, assisted: false,
      scored: false, modelled: true, fling: true, support: 4, pattern: 'VC', timestamp: c.t, sessionId: 'old' });
  }
  c.sync();
  assert.equal(c.map().current.id, 'words:L1');
  assert.ok(c.store.all().length > before, 'history is kept');
  assert.equal(c.store.all().filter(r => r.skill === 'blend:L1').length, 10);
});
