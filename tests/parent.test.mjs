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
