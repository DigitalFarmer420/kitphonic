import test from 'node:test';
import assert from 'node:assert/strict';
import { parentSummary, tryAtHome } from '../js/parent.js';
import { seedProgress } from '../js/dev-seed.js';
import { STOPS } from '../js/progress.js';
import { createSettings, DEFAULT_SETTINGS } from '../js/settings.js';
import { memoryStorage } from '../js/dev-seed.js';
const now = Date.UTC(2026, 9, 30, 17);

test('parent summary: empty log', () => {
  const s = parentSummary([], now);
  assert.equal(s.stop.index, 1); assert.equal(s.sounds.length, 0); assert.equal(s.sessionsThisWeek, 0);
});
test('parent summary: seeded progress shows map position, sounds and week totals', () => {
  const s = parentSummary(seedProgress(4, { now }), now);
  assert.equal(s.stop.index, 5); assert.equal(s.stop.label, STOPS[4].label);
  assert.ok(s.sounds.length >= 3 && s.sounds.every(x => ['secure', 'mastered', 'review-due'].includes(x.state)));
});
test('settings: defaults keep current behaviour (7 min, sound-first float, normal speed, motion like device)', () => {
  assert.equal(DEFAULT_SETTINGS.sessionMinutes, 7); assert.equal(DEFAULT_SETTINGS.floatMode, 'sound');
  const st = createSettings(memoryStorage()); assert.equal(st.sessionMs(), 7 * 60e3); assert.equal(st.audioRate(), 1);
  st.set('audioSpeed', 'slow'); assert.equal(st.audioRate(), 0.85);
  assert.throws(() => st.set('nope', 1));
});

test('parent mockup data: current + next stop, tiles for every map sound (not-yet = new), a try-at-home tip', () => {
  const s = parentSummary(seedProgress(2, { now, due: true }), now);
  assert.equal(s.current.kind, 'sound'); assert.ok(s.current.learning.includes(s.current.label));
  assert.ok(s.next); assert.equal(s.soundTiles.length, STOPS.filter(x => x.kind === 'sound').length);
  assert.ok(s.soundTiles.some(t => t.state === 'new')); assert.ok(s.starTiles.length >= 3);
  assert.ok(s.tryAtHome?.text.includes('Kit will review'), JSON.stringify(s.tryAtHome));
  assert.equal(s.tryAtHome.id, 'm'); // the due review sound comes first
});

test("try at home: 'review' only for a review-due sound; new and practicing sounds say 'practice'", () => {
  const due = tryAtHome([{ id: 'm', state: 'review-due', due: 1 }, { id: 's', state: 'practicing', accuracy: 0.4 }], null);
  assert.equal(due.id, 'm'); assert.match(due.text, /Kit will review m next session\./);
  const prac = tryAtHome([{ id: 's', state: 'practicing', accuracy: 0.4 }], null);
  assert.equal(prac.id, 's'); assert.match(prac.text, /Kit will practice s next session\./); assert.doesNotMatch(prac.text, /review/);
  const fresh = tryAtHome([{ id: 't', state: 'new' }], { kind: 'sound', gpc: 't' });
  assert.equal(fresh.id, 't'); assert.match(fresh.text, /Kit will practice t next session\./); assert.doesNotMatch(fresh.text, /review/);
});

test('parent summary describes "new words" and story stops', async () => {
  const { describe } = await import('../js/parent.js');
  const ap = STOPS.find(s => s.apply === 4), st = STOPS.find(s => s.kind === 'story');
  assert.match(describe(ap).learning, /set 4 sounds/); assert.match(describe(st).learning, /story “the cat and the pot”/);
});

test('v2 V1: words read alone are counted apart from words read with Kit (modelled); modelled reads never count for mastery', async () => {
  const { counts } = await import('../js/mastery.js');
  const r = (itemId, extra) => ({ skill: 'blend:L2', itemId, correct: true, firstAttempt: true, scored: true, timestamp: 1, sessionId: 'a', ...extra });
  const s = parentSummary([r('mat'), r('map', { modelled: true, scored: false }), r('pan')], 2);
  assert.equal(s.wordsRead, 2); assert.equal(s.wordsWithKit, 1);
  assert.equal(counts(r('map', { modelled: true })), false); assert.equal(counts(r('mat')), true);
});
test('spec §3.4.1 / §3.8.4: parent view shows the letter-tap mode and trouble spots (b/d mix-ups, vowel misses)', async () => {
  const { troubleSpots } = await import('../js/parent.js'); const now = Date.now();
  const m = (skill, itemId, extra) => ({ skill, itemId, correct: false, firstAttempt: true, timestamp: now - 1000, sessionId: 'a', ...extra });
  const log = [m('sound:b', 'b', { picked: 'd' }), m('sound:d', 'd', { picked: 'b' }), m('sound:m', 'm', { picked: 's' }),
    ...['pin', 'pan', 'pen'].map(w => m('blend:L3', w, { contrast: 'vowel' })), m('blend:L3', 'mat', { contrast: 'final' })];
  assert.deepEqual(troubleSpots(log, now), ['mixes up b and d', 'practising short vowel sounds (like pin / pan)']);
  assert.deepEqual(troubleSpots(log.map(r => ({ ...r, timestamp: now - 20 * 864e5 })), now), []); // old misses fade
  assert.equal(parentSummary([], 2).letterMode, 'sounds');
});
test('visible version: VERSION file = js/version.js = 1.0.0-rc5', async () => {
  const { readFileSync } = await import('node:fs'); const { VERSION } = await import('../js/version.js');
  assert.equal(readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim(), VERSION); assert.equal(VERSION, '1.0.0-rc5');
});
