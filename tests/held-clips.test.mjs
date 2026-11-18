// KP-QA-008: which letter sounds have a stretched "-held" clip is a teaching decision, not an accident.
// Continuous sounds (vowels, s, m, f, l, n, r, v, z, sh, th, ng) are held while the child traces.
// Stops and sounds that end in a stop (b c ck d g j k p t ch x qu nk) and h must never be stretched
// ("buh" / schwa errors). w and y are glides, kept short until the Phonics Educator decides otherwise.
// The player falls back to the short clip when no -held clip exists (soundClip in js/lesson-screen.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../audio/manifest.json', import.meta.url), 'utf8'));
const ids = new Set(manifest.clips.map(c => c.id));
const sounds = [...ids].filter(i => i.startsWith('snd-') && !i.endsWith('-held')).map(i => i.slice(4));
const held = [...ids].filter(i => i.startsWith('snd-') && i.endsWith('-held')).map(i => i.slice(4, -5));

export const NOT_HELD = ['b', 'c', 'ch', 'ck', 'd', 'g', 'h', 'j', 'k', 'nk', 'p', 'qu', 't', 'w', 'x', 'y'];

test('every continuous letter sound has a -held clip', () => {
  const missing = sounds.filter(s => !NOT_HELD.includes(s) && !held.includes(s));
  assert.deepEqual(missing, [], `continuous sounds missing a -held clip: ${missing.join(', ')}`);
});

test('stops, h and the glides w/y have no -held clip (they must not be stretched)', () => {
  const stretched = held.filter(s => NOT_HELD.includes(s));
  assert.deepEqual(stretched, [], `held clip exists for a sound that must stay short: ${stretched.join(', ')}`);
});

test('every -held clip has its short sound, and the no-held list names real sounds', () => {
  assert.deepEqual(held.filter(s => !sounds.includes(s)), []);
  assert.deepEqual(NOT_HELD.filter(s => !sounds.includes(s)), []);
});
