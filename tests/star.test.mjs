// Review R6: star words list, prerequisites, heart graphemes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAR_WORDS, MAX_NEW_STAR_PER_LEVEL } from '../js/content.js';
import { GPC, PROTOTYPE_SIZE } from '../js/sequence.js';
import { buildManifest } from '../js/manifest.js';

const grapheme = p => (typeof p === 'string' ? GPC[p].grapheme : p.g);
test('prototype list, in order: I, the, is, to, no, into', () => assert.deepEqual(STAR_WORDS.map(s => s.w), ['I', 'the', 'is', 'to', 'no', 'into']));
test('parse spells the word; exactly the expected irregular graphemes are marked', () => {
  const expect = { I: ['I'], the: ['th', 'e'], is: ['s'], to: ['o'], no: ['o'], into: ['o'] };
  for (const s of STAR_WORDS) {
    assert.equal(s.parse.map(grapheme).join(''), s.w, s.w);
    assert.deepEqual(s.parse.filter(p => p.irregular).map(p => p.g), expect[s.w], s.w);
    for (const p of s.parse) if (typeof p === 'string') assert.ok(GPC[p], `${s.w}: ${p}`);
  }
});
test('no star word before its regular GPCs (and prerequisites) are taught', () => {
  for (const s of STAR_WORDS) {
    const regular = s.parse.filter(p => typeof p === 'string');
    for (const id of regular) assert.ok(s.introAfter.gpcs.includes(id), `${s.w}: ${id} not listed as prerequisite`);
    for (const id of s.introAfter.gpcs) assert.ok(GPC[id].order <= PROTOTYPE_SIZE, `${s.w}: ${id} outside prototype set`);
    if (s.introAfter.star) {
      const pre = STAR_WORDS.find(x => x.w === s.introAfter.star);
      assert.ok(pre && STAR_WORDS.indexOf(pre) < STAR_WORDS.indexOf(s) && pre.level <= s.level, `${s.w} after ${s.introAfter.star}`);
    }
  }
});
test(`at most ${MAX_NEW_STAR_PER_LEVEL} new star words per level; capital only for "I"`, () => {
  const per = {}; for (const s of STAR_WORDS) per[s.level] = (per[s.level] || 0) + 1;
  for (const n of Object.values(per)) assert.ok(n <= MAX_NEW_STAR_PER_LEVEL);
  for (const s of STAR_WORDS) assert.equal(/[A-Z]/.test(s.w), s.w === 'I');
});
test('manifest has a word + sentence clip for each star word', () => {
  const ids = new Set(buildManifest().clips.map(c => c.id));
  for (const s of STAR_WORDS) { assert.ok(ids.has(`star-${s.w}`)); assert.ok(ids.has(`star-${s.w}-sentence`)); }
});
