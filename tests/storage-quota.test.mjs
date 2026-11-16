// KP-BUG-002 / PR #26: UI writes must not throw when localStorage is full.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeen } from '../js/seen.js';
import { createSettings } from '../js/settings.js';
import { createStore } from '../js/mastery.js';

const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');
function memStorage(seed = {}, { throwOn } = {}) {
  const mem = new Map(Object.entries(seed));
  const writes = [];
  return {
    mem, writes,
    getItem: k => mem.get(k) ?? null,
    setItem: (k, v) => {
      writes.push(k);
      if (!throwOn || throwOn(k, v)) throw quota();
      mem.set(k, v);
    },
    removeItem: k => { throw new Error(`must not clear storage key ${k}`); },
  };
}

test('seen.mark survives QuotaExceeded: no throw, in-memory count advances, storage kept', () => {
  const storage = memStorage({ 'kitphonic.v1.seen': '{"intro":1}', 'kitphonic.v1.settings': '{"speechRate":1}' });
  const seen = createSeen(storage);
  assert.equal(seen.count('intro'), 1);
  assert.doesNotThrow(() => seen.mark('intro')); // intro Next / trace Next / map Go all call mark()
  assert.equal(seen.count('intro'), 2, 'in-memory count kept so the UI can proceed');
  assert.doesNotThrow(() => seen.mark('go'));
  assert.doesNotThrow(() => seen.mark('trace'));
  assert.equal(seen.count('go'), 1);
  assert.equal(seen.count('trace'), 1);
  assert.equal(storage.mem.get('kitphonic.v1.seen'), '{"intro":1}', 'failed write is skipped');
  assert.equal(storage.mem.get('kitphonic.v1.settings'), '{"speechRate":1}');
});

test('settings.set survives QuotaExceeded: no throw, in-memory value and listeners update', () => {
  const storage = memStorage({ 'kitphonic.v1.settings': '{"audioSpeed":"normal"}', 'kitphonic.v1.seen': '{"intro":1}' });
  const st = createSettings(storage);
  const got = [];
  st.onChange((k, v) => got.push([k, v]));
  assert.doesNotThrow(() => st.set('audioSpeed', 'slow'));
  assert.equal(st.get('audioSpeed'), 'slow');
  assert.equal(st.audioRate(), 0.85);
  assert.deepEqual(got, [['audioSpeed', 'slow']]);
  assert.equal(storage.mem.get('kitphonic.v1.settings'), '{"audioSpeed":"normal"}', 'failed write is skipped');
  assert.equal(storage.mem.get('kitphonic.v1.seen'), '{"intro":1}');
});

test('intro Next flow proceeds when both seen.mark and store.log hit QuotaExceeded', () => {
  const storage = memStorage({
    'kitphonic.v1.seen': '{"intro":0}',
    'kitphonic.v1.responses': JSON.stringify([{ skill: 'stop:sound:m', marker: true, timestamp: 1 }]),
  });
  const seen = createSeen(storage);
  const store = createStore(storage);
  let finished = false;
  assert.doesNotThrow(() => {
    seen.mark('intro');
    store.log({ skill: 'intro:m', itemId: 'm', correct: true, firstAttempt: true, scored: false });
    finished = true; // lesson-screen ic-next: mark, record, finish
  });
  assert.equal(finished, true);
  assert.equal(seen.count('intro'), 1);
  assert.ok(store.all().some(r => r.skill === 'stop:sound:m'), 'existing progress kept');
});
