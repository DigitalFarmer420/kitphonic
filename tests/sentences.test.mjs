import test from 'node:test';
import assert from 'node:assert/strict';
import { allSentences, servableSentences, tokenize } from '../js/sentences.js';
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
