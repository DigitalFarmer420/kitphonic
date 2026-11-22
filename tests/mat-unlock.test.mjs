// The mat stop (words:L2, the first CVC) "went on forever": CVC starts at S4 (modelled, never scored) because VC
// rarely reaches S2 by then, and the stop served 5 words while leaving the model needs 6 sweeps. A perfect child
// finished the first mat session one sweep short (5 of 6), read only 4 counted words the next session (secure needs 5)
// and opened i on the third. Like at (L1), the stop now serves 6 words while its pattern is still modelled.
// Standards stay: modelled reads never count, secure still needs 5 counted reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSession } from '../js/session.js';
import { mapState, progressMarkers } from '../js/progress.js';
import { createStore, skillState, guessGuard } from '../js/mastery.js';
import { supportFor, patternSupport, supportPattern, S, SUPPORT_RULES } from '../js/support.js';
import { memoryStorage } from '../js/dev-seed.js';

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

function passSound(c, g) {
  for (let i = 0; i < 5; i++) {
    c.t += 1000;
    c.store.log({ skill: `sound:${g}`, itemId: g, correct: true, firstAttempt: true, assisted: false, scored: true, timestamp: c.t, sessionId: `letters-${g}` });
  }
  c.sync();
}
function playStop(c, sessionId, { limit = Infinity } = {}) {
  const plan = planSession(c.store.all(), { now: c.t, minutes: 7, rand: () => 0.2 });
  const words = plan.items.find(i => i.type === 'words' && i.why === 'new');
  assert.ok(words, 'the word stop is in the plan');
  for (const w of words.words.slice(0, limit)) finishWord(c, w, { sessionId, sweepMs: 1800, pickLatencyMs: 1500 });
  return words;
}
// A fresh child through m s a t, at (two sessions, as tests/at-unlock.test.mjs), then p: the map is at mat.
function atMat() {
  const c = child();
  for (const g of ['m', 's', 'a', 't']) passSound(c, g);
  playStop(c, 'at-model'); c.t += 3600e3; playStop(c, 'at-read');
  assert.equal(c.map().current.id, 'sound:p');
  passSound(c, 'p');
  assert.equal(c.map().current.id, 'words:L2');
  assert.equal(c.map().current.label, 'mat');
  return c;
}

test('mat starts modelled: CVC is at S4 when the stop opens', () => {
  const c = atMat();
  assert.equal(patternSupport(c.store.all(), 'CVC', c.t).level, S.MODEL);
});

test('the first mat session serves enough words to finish the model', () => {
  const c = atMat();
  const ws = playStop(c, 'mat-1').words;
  assert.equal(ws[0].level, 2);
  assert.ok(ws.length >= SUPPORT_RULES.modelSweeps, `need ${SUPPORT_RULES.modelSweeps} words, got ${ws.length}`);
  assert.ok(ws.every((w, i) => !i || w.w !== ws[i - 1].w), ws.map(w => w.w).join(','));
  assert.equal(patternSupport(c.store.all(), 'CVC', c.t).level, S.BLEND, 'the model is finished in one session');
  assert.equal(skillState(c.store.all(), 'blend:L2', c.t).trials, 0, 'modelled reads never count');
  assert.equal(c.map().current.id, 'words:L2', 'modelled practice does not open the next stop');
});

test('a perfect child opens i on the second mat session (was the third)', () => {
  const c = atMat();
  playStop(c, 'mat-1'); c.t += 3600e3;
  playStop(c, 'mat-2');
  assert.equal(c.map().current.id, 'sound:i');
});

test('a child left one sweep short by the old 5-word session opens i on the next one', () => {
  const c = atMat();
  playStop(c, 'mat-old', { limit: 5 }); // what rc13 / 2026.11.21.1 served
  assert.equal(patternSupport(c.store.all(), 'CVC', c.t).level, S.MODEL);
  c.t += 3600e3;
  const ws = playStop(c, 'mat-next').words;
  assert.ok(ws.length >= SUPPORT_RULES.modelSweeps);
  assert.equal(c.map().current.id, 'sound:i');
});

test('once the pattern is out of the model, the stop asks for 5 reads again', () => {
  const c = atMat();
  playStop(c, 'mat-1'); c.t += 3600e3;
  const plan = planSession(c.store.all(), { now: c.t, minutes: 7, rand: () => 0.2 });
  assert.equal(plan.items.find(i => i.type === 'words' && i.why === 'new').words.length, 5);
});
