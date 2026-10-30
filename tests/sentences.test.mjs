import test from 'node:test';
import assert from 'node:assert/strict';
import { allSentences, servableSentences, tokenize, pictureChoices } from '../js/sentences.js';
import { buildManifest } from '../js/manifest.js';

test('every sentence token is a star word or a known decodable word; each has >= 1 star word', () => {
  for (const s of allSentences()) {
    for (const t of s.tokens) assert.notEqual(t.kind, 'unknown', `${s.id}: "${t.w}" is neither a star word nor in WORDS`);
    assert.ok(s.stars.length >= 1, s.id);
  }
});
test('untaught-sound check: sentences only once every word decodes and its star words were introduced', () => {
  const known = new Set(['m', 's', 'a', 't']);
  assert.deepEqual(servableSentences(known, new Set(['the'])).map(s => s.id), []); // 'man' needs n
  const k2 = new Set(['m', 's', 'a', 't', 'n']);
  assert.deepEqual(servableSentences(k2, new Set(['the'])).map(s => s.id), ['man-sat']);
  assert.deepEqual(servableSentences(k2, new Set()).map(s => s.id), []);
});
test('punctuation is kept for display, not for lookup; audio covers every token + sentence', () => {
  assert.deepEqual(tokenize('no, not').map(t => [t.w, t.punct]), [['no', ','], ['not', '']]);
  const ids = new Set(buildManifest().clips.map(c => c.id));
  for (const s of allSentences()) { assert.ok(ids.has(`sent-${s.id}`), s.id); for (const t of s.tokens) assert.ok(ids.has(t.clip), t.clip); }
});

test('scored read: 3 distinct pictures incl. the answer; distractors never share a decodable word with the sentence', () => {
  const all = allSentences();
  for (const s of all) for (let k = 0; k < 20; k++) {
    const pics = pictureChoices(s, all, Math.random);
    assert.ok(pics.includes(s.pic), s.id); assert.equal(new Set(pics).size, pics.length, s.id); assert.ok(pics.length >= 2, `${s.id}: ${pics.length} choices`);
    const mine = new Set(s.tokens.filter(t => t.kind === 'word').map(t => t.entry.w));
    for (const p of pics) if (p !== s.pic) for (const o of all.filter(o => o.pic === p)) assert.ok(o.id === s.id || o.pic !== s.pic, s.id);
    const bad = all.filter(o => o.pic !== s.pic && pics.includes(o.pic) && o.tokens.some(t => t.kind === 'word' && mine.has(t.entry.w)) && !all.some(x => x.pic === o.pic && !x.tokens.some(t => t.kind === 'word' && mine.has(t.entry.w))));
    assert.equal(bad.length, 0, `${s.id}: distractor shares a word`);
  }
});
