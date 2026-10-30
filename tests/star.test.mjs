// Review R6: star words list, prerequisites, heart graphemes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAR_WORDS, MAX_NEW_STAR_PER_LEVEL } from '../js/content.js';
import { GPC, PROTOTYPE_SIZE } from '../js/sequence.js';
import { buildManifest } from '../js/manifest.js';

const grapheme = p => (typeof p === 'string' ? GPC[p].grapheme : p.g);
test('list, in order: I, the, is, to, no, into, then (v2 V5) a, he, go, of, she, you, we, was', () => assert.deepEqual(STAR_WORDS.map(s => s.w), ['I', 'the', 'is', 'to', 'no', 'into', 'a', 'he', 'go', 'of', 'she', 'you', 'we', 'was']));
test('parse spells the word; exactly the expected irregular graphemes are marked', () => {
  const expect = { I: ['I'], the: ['th', 'e'], is: ['s'], to: ['o'], no: ['o'], into: ['o'], a: ['a'], he: ['e'], go: ['o'], of: ['o', 'f'], she: ['e'], you: ['ou'], we: ['e'], was: ['a'] };
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
    for (const id of s.introAfter.gpcs) assert.ok(GPC[id], `${s.w}: ${id} not in the sequence`); // regular parts validated against the full sequence
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
test("v2 V4e: 'is' graduates — a star word until s = /z/ is known, then served with the slider (decodable 'i s_z')", async () => {
  const { resolveSentence } = await import('../js/sentences.js');
  const before = resolveSentence({ text: 'the pig is in the mud' }, new Set(['p', 'i', 'g', 'n', 'm', 'u', 'd']));
  const after = resolveSentence({ text: 'the pig is in the mud' }, new Set(['p', 'i', 'g', 'n', 'm', 'u', 'd', 's_z']));
  assert.equal(before.tokens[2].kind, 'star'); assert.equal(after.tokens[2].kind, 'word'); assert.equal(after.tokens[2].entry.parse, 'i s_z');
  assert.ok(after.stars.includes('the') && !after.stars.includes('is'));
});
test("v2 V4g: 'and' (VCC) validates at L5; -s words (L7) are a stem + s", async () => {
  const { validateWord } = await import('../js/validate.js'); const { WORDS } = await import('../js/content.js');
  assert.deepEqual(validateWord({ text: 'and', parse: 'a n d', level: 5 }), []);
  const all = new Set(Object.values(WORDS).flat().map(e => e.w));
  for (const e of WORDS[7]) { assert.ok(all.has(e.stem), `${e.w}: stem ${e.stem}`); assert.equal(e.w, e.stem + 's'); }
});
