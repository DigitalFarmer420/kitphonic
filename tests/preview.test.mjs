// Grown-ups lesson preview: read-only by construction (js/preview.js). A full preview, with correct answers, misses,
// completion and exit, must leave the device storage byte-identical, for a fresh child, a mid-course child and a
// locked future stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewGate, createPreview, planPreview, previewSeed, pressHold, PREVIEW_HOLD_MS, RESPONSES_KEY } from '../js/preview.js';
import { createStore } from '../js/mastery.js';
import { createSeen } from '../js/seen.js';
import { createSettings } from '../js/settings.js';
import { seedProgress } from '../js/dev-seed.js';
import { STOPS, mapState, progressMarkers } from '../js/progress.js';
import { lessonTiles } from '../js/parent-screen.js';

const now = Date.UTC(2026, 10, 21, 18);
// localStorage stand-in: every key, as stored strings
function fakeLocalStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(),
    snapshot: () => Object.fromEntries([...m.entries()].sort()) };
}
// The app's wiring (js/app.js): settings, progress log and ghost-hand counts all sit on gate-wrapped storage.
function appLike(ls) {
  const gate = createPreviewGate();
  const settings = createSettings(gate.wrap(ls), undefined, () => ({ matches: false }));
  const storage = gate.wrap(ls), store = createStore(storage), seen = createSeen(storage);
  const preview = createPreview({ gate, getResponses: () => store.all(), now: () => now, rand: () => 0.42 });
  return { gate, settings, store, seen, preview };
}
// Play a whole plan the way the screens record it: per item a correct first read, a miss, a retry, demo counts,
// the progress markers syncProgress would add, and every other write a screen could attempt.
function playThrough(app, plan) {
  let t = now;
  for (const it of plan.items) {
    const skill = it.type === 'words' ? `blend:L${it.level ?? 3}` : it.type === 'letters' || it.type === 'lesson' ? `sound:${it.newSound ?? it.gpc ?? 'm'}` : `story:${it.story?.id ?? 'x'}`;
    for (const [correct, firstAttempt] of [[true, true], [false, true], [true, false]]) app.store.log({ skill, itemId: 'x', correct, firstAttempt, scored: true, timestamp: t += 1000 });
    app.seen.mark(it.type);
  }
  app.store.logMany(progressMarkers(app.store.all(), { now: t }));
  app.settings.set('audioSpeed', 'fast'); app.settings.set('sessionMinutes', 10);
  app.seen.reset(); app.store.clear(); app.store.log({ skill: 'sound:m', itemId: 'm', correct: true, firstAttempt: true, timestamp: t + 1 });
}
const children = {
  fresh: () => ({}),
  'mid-course': () => ({ [RESPONSES_KEY]: JSON.stringify(seedProgress(12, { now })), 'kitphonic.v1.seen': JSON.stringify({ go: 3, words: 2 }),
    'kitphonic.v1.settings': JSON.stringify({ sessionMinutes: 5, audioSpeed: 'slow' }), 'other.app.key': 'keep' }),
};
for (const [who, init] of Object.entries(children)) {
  for (const [what, pick] of [['current stop', m => m.index], ['a passed stop', m => Math.max(0, m.index - 3)], ['a locked future stop', () => 40], ['the last stop', () => STOPS.length - 1]]) {
    if (who === 'fresh' && what === 'a passed stop') continue; // a fresh child has no passed stop
    test(`preview (${who} child, ${what}): a full run leaves storage, map, demos and settings unchanged`, () => {
      const ls = fakeLocalStorage(init()), app = appLike(ls);
      const before = structuredClone(ls.snapshot()), map0 = mapState(app.store.all(), now), set0 = app.settings.all(), seen0 = app.seen.count('words');
      const index = pick(map0);
      const plan = app.preview.start(index);
      assert.ok(plan.items.length, 'the stop plans a lesson');
      assert.equal(plan.preview, true); assert.equal(plan.stop.id, STOPS[index].id);
      assert.equal(mapState(app.store.all(), now).index, index, 'the preview child is at the chosen stop');
      playThrough(app, plan);
      assert.deepEqual(ls.snapshot(), before, 'nothing reached the device during the preview');
      assert.equal(app.preview.end(), true);
      app.settings.reload();
      assert.deepEqual(ls.snapshot(), before, 'device storage is byte-identical after exit');
      assert.deepEqual(app.settings.all(), set0, 'settings in memory match the device again');
      assert.equal(app.seen.count('words'), seen0, 'ghost-hand counts are the child\'s again');
      assert.deepEqual(mapState(app.store.all(), now).index, map0.index, 'the map is on the same stop');
      assert.deepEqual(app.store.all(), JSON.parse(before[RESPONSES_KEY] ?? '[]'));
    });
  }
}

test('preview gate: passes through outside a preview, overlays inside, drops the overlay on end', () => {
  const ls = fakeLocalStorage({ a: '1' }), gate = createPreviewGate(), w = gate.wrap(ls);
  w.setItem('b', '2'); assert.equal(ls.getItem('b'), '2');
  gate.begin({ a: 'seed' });
  assert.equal(w.getItem('a'), 'seed'); assert.equal(w.getItem('b'), '2', 'unseeded keys read through');
  w.setItem('b', 'x'); w.removeItem('a'); w.setItem('c', '3'); w.clear(); w.setItem('d', '4');
  assert.equal(w.getItem('b'), '2'); assert.equal(w.getItem('d'), '4');
  assert.deepEqual(ls.snapshot(), { a: '1', b: '2' });
  gate.end();
  assert.equal(w.getItem('a'), '1'); assert.equal(w.getItem('d'), null);
  const late = gate.wrap(ls); gate.begin(); late.setItem('z', '9'); gate.end(); assert.equal(ls.getItem('z'), null, 'storages wrapped later are covered too');
});

test('every one of the 56 stops plans a preview lesson, locked ones included', () => {
  assert.equal(STOPS.length, 56);
  for (let i = 0; i < STOPS.length; i++) {
    const rs = JSON.parse(previewSeed(i, now)[RESPONSES_KEY]);
    const p = planPreview(rs, i, { now, rand: () => 0.3 });
    assert.ok(p.items.length, `${STOPS[i].id} has items`); assert.equal(p.stop.id, STOPS[i].id);
  }
});

test('lessons grid lists every stop in course order, any status', () => {
  const tiles = lessonTiles(mapState(seedProgress(12, { now }), now));
  assert.equal(tiles.length, 56);
  assert.deepEqual(tiles.map(t => t.id), STOPS.map(s => s.id));
  assert.ok(tiles.some(t => t.status === 'upcoming') && tiles.some(t => t.status === 'passed') && tiles.filter(t => t.status === 'current').length === 1);
  assert.ok(tiles.every(t => t.cap && t.learning && t.cap.length <= 10));
});

// --- press and hold ---
class PEvent extends Event { constructor(type, o = {}) { super(type, { cancelable: true }); Object.assign(this, { button: 0, clientX: 0, clientY: 0, ...o }); } }
function fakeTimers() {
  let t = 0, id = 0; const q = new Map();
  return { setTimeout: (f, ms) => (q.set(++id, { f, at: t + ms }), id), clearTimeout: k => q.delete(k),
    tick(ms) { t += ms; for (const [k, v] of [...q]) if (v.at <= t) { q.delete(k); v.f(); } } };
}
function holdRig() {
  const el = new EventTarget(), timers = fakeTimers(), calls = { hold: 0, tap: 0 };
  pressHold(el, { timers, onHold: () => calls.hold++, onTap: () => calls.tap++ });
  return { el, timers, calls, fire: (type, o) => el.dispatchEvent(new PEvent(type, o)) };
}
test('press and hold: a long press opens the preview, no tap', () => {
  const r = holdRig();
  r.fire('pointerdown'); r.timers.tick(PREVIEW_HOLD_MS - 1); assert.equal(r.calls.hold, 0);
  r.timers.tick(1); assert.equal(r.calls.hold, 1);
  r.fire('pointerup'); const click = new PEvent('click'); r.el.dispatchEvent(click);
  assert.equal(r.calls.tap, 0); assert.equal(click.defaultPrevented, true, 'the click after a hold is swallowed');
});
test('press and hold: a short tap does not open the preview', () => {
  const r = holdRig();
  r.fire('pointerdown'); r.timers.tick(200); r.fire('pointerup'); r.timers.tick(2000);
  assert.deepEqual(r.calls, { hold: 0, tap: 1 });
});
test('press and hold: moving, leaving or cancelling stops the hold', () => {
  for (const end of [['pointermove', { clientX: 30 }], ['pointerleave'], ['pointercancel']]) {
    const r = holdRig();
    r.fire('pointerdown'); r.timers.tick(300); r.fire(...end); r.timers.tick(2000); r.fire('pointerup');
    assert.deepEqual(r.calls, { hold: 0, tap: 0 }, end[0]);
  }
  const r = holdRig(); r.fire('pointerdown'); r.fire('pointermove', { clientX: 4 }); r.timers.tick(PREVIEW_HOLD_MS);
  assert.equal(r.calls.hold, 1, 'a small wobble still holds');
  const b = holdRig(); b.fire('pointerdown', { button: 2 }); b.timers.tick(2000); assert.equal(b.calls.hold, 0, 'right button ignored');
});
