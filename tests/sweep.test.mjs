// Blend Slider engine (§3.5.3, §3.7): marker layout + sweep behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../js/core.js';
const sig = ms => ms.map(m => m.type + ':' + m.text);

test('L1 default is sound-by-sound (R2); opts.l1=bar keeps the one-bar option', () => {
  assert.deepEqual(sig(c.markers('at', 1)), ['dot:a', 'dot:t']);
  assert.deepEqual(sig(c.markers('at', 1, { l1: 'bar' })), ['bar:at']);
});
test('R2: no word defaults to a bar at L1, L3, L4, L5 (L2 onset+rime is on hold pending user decision)', () => {
  for (const [w, lv] of [['at', 1], ['sit', 3], ['stop', 4], ['mast', 5]]) assert.ok(c.markers(w, lv).every(m => m.type === 'dot'), w);
});
test('R3: continuous -> continuous plays connected; continuous -> stop keeps the gap', () => {
  const s = c.createSweep(c.markers('mat', 3)); s.move(0, 0);
  const e = s.move(0.55, 2000); // slow: fires m then a in one move
  assert.deepEqual(e.map(x => [x.marker, !!x.connect, x.delayMs ?? 0]), [[0, false, 0], [1, true, 60]]);
  const e2 = s.move(0.9, 4000);
  assert.equal(e2[0].marker, 2); assert.ok(!e2[0].connect); assert.equal(e2[0].stretch, undefined); // t: stop, never stretched
  const f = c.createSweep(c.markers('man', 3)); f.move(0, 0);
  assert.ok(f.move(1, 200).every(x => !x.connect)); // fast fling: gaps everywhere
});
test('R3: e, u, l, r are stretchy (from sequence continuous flags); stops are not', () => {
  assert.deepEqual(c.markers('red', 3).map(m => m.stretchy), [true, true, false]);
  assert.deepEqual(c.markers('lump', 5).map(m => m.stretchy), [true, true, true, false]);
  assert.deepEqual(c.markers('big', 3).map(m => m.stretchy), [false, true, false]);
});
test('L2 vowel-initial word is a single rime bar', () => assert.deepEqual(sig(c.markers('in', 2)), ['bar:in']));
test('L2 string with no vowel falls back to dots (no negative indices)', () => {
  const m = c.markers('pst', 2); // not 'sh': that is one phoneme (review R10)
  assert.deepEqual(sig(m), ['dot:p', 'dot:s', 'dot:t']);
  assert.ok(m.every(x => x.start >= 0 && x.end > x.start));
});
test('L4 early stage: dot + dot + bar; default all dots', () => {
  assert.deepEqual(sig(c.markers('stop', 4, { l4: 'blendBar' })), ['dot:s', 'dot:t', 'bar:op']);
  assert.deepEqual(sig(c.markers('stop', 4)), ['dot:s', 'dot:t', 'dot:o', 'dot:p']);
});
test('L5 ending blend: all dots', () => assert.deepEqual(sig(c.markers('mast', 5)), ['dot:m', 'dot:a', 'dot:s', 'dot:t']));
test('markers flag stretchy vs clipped sounds', () => {
  assert.deepEqual(c.markers('map', 3).map(m => m.stretchy), [true, true, false]);
  assert.equal(c.markers('sat', 2)[1].stretchy, true); // rime "at" starts on stretchy a
});

test('positions follow letter layout: L2 "sat" bar fires as handle enters "a"', () => {
  const p = c.markerPositions(c.markers('sat', 2));
  assert.deepEqual(p.map(x => +x.toFixed(3)), [0.167, 0.5]);
  assert.deepEqual(c.markerPositions(2), [0.25, 0.75]); // numeric form unchanged
});
test('marker-aware sweep: bar does not fire before its letters', () => {
  const s = c.createSweep(c.markers('sat', 2));
  assert.deepEqual(s.move(0.4).map(e => e.marker), [0]);
  assert.deepEqual(s.move(0.55).map(e => e.marker), [1]);
});

test('move() works destructured / as a callback', () => {
  const { move } = c.createSweep(2);
  assert.doesNotThrow(() => move(1));
});
test('holding still or jittering at the handle emits nothing', () => {
  const s = c.createSweep(3); s.move(0.6);
  assert.deepEqual(s.move(0.6), []);
  assert.deepEqual(s.move(0.595), []);
});
test('backward replays each crossed marker once, nearest first', () => {
  const s = c.createSweep(3); s.move(0.9); // pos .167 .5 .833
  assert.deepEqual(s.move(0.4), [{ marker: 2, kind: 'replay' }, { marker: 1, kind: 'replay' }]);
  assert.deepEqual(s.move(0.35), []);
  assert.deepEqual(s.move(0.0).map(e => e.marker), [0]);
  assert.ok(!s.complete);
});
test('going back then forward again does not re-play or double-fire', () => {
  const s = c.createSweep(3); s.move(0.6); s.move(0.2);
  assert.deepEqual(s.move(0.55), []); // below previous max: nothing new
  assert.deepEqual(s.move(0.9).map(e => e.marker), [2]);
});
test('fling 0->1 staggers plays and blend instead of overlapping', () => {
  const e = c.createSweep(3).move(1);
  assert.deepEqual(e.map(x => x.delayMs ?? 0), [0, 180, 360, 540]);
  assert.equal(e.at(-1).kind, 'blend');
});
test('blend fires exactly once', () => {
  const s = c.createSweep(2); s.move(1); s.move(0); assert.deepEqual(s.move(1), []); assert.ok(s.complete);
});
test('speed-aware: slow slide stretches stretchy sounds, fast clips them; clipped never stretch', () => {
  const ms = c.markers('map', 3); // m a p ; positions .167 .5 .833
  let s = c.createSweep(ms); s.move(0, 0);
  const slow = s.move(0.2, 2000); // 0.1 track/s
  assert.equal(slow[0].stretch, 'long');
  s = c.createSweep(ms); s.move(0, 0);
  const fast = s.move(0.9, 300); // 3 track/s
  assert.deepEqual(fast.map(e => e.stretch), ['short', 'short', undefined]);
});
test('lift pauses; next touch continues from the same place', () => {
  const s = c.createSweep(3); s.move(0.4, 0); s.move(0.45, 100); s.lift();
  assert.equal(s.position, 0.45);
  const e = s.move(0.6, 99999); // resuming after a long pause is not treated as "slow"
  assert.deepEqual(e.map(x => x.marker), [1]);
  assert.equal(e[0].stretch, undefined); // numeric sweep: no stretchy info
});
test('reset starts a fresh sweep', () => {
  const s = c.createSweep(2); s.move(1); s.reset();
  assert.ok(!s.complete); assert.equal(s.progress, 0); assert.deepEqual(s.lit, []);
  assert.equal(s.move(1).at(-1).kind, 'blend');
});
