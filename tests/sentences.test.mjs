import test from 'node:test';
import assert from 'node:assert/strict';
import { allSentences, servableSentences, tokenize, pictureChoices, sentenceDistractors } from '../js/sentences.js';
import { buildManifest } from '../js/manifest.js';

test('every sentence token is a star word or a known decodable word; each has >= 1 star word', () => {
  for (const s of allSentences()) {
    for (const t of s.tokens) assert.notEqual(t.kind, 'unknown', `${s.id}: "${t.w}" is neither a star word nor in WORDS`);
    assert.ok(s.stars.length >= 1, s.id);
  }
});
test('untaught-sound check: sentences only once every word decodes and its star words were introduced', () => {
  const known = new Set(['m', 's', 'a', 't']);
  assert.deepEqual(servableSentences(known, new Set(['the'])).map(s => s.id), []); // 'man' needs n, 'on' needs o
  const k2 = new Set(['m', 's', 'a', 't', 'n', 'o']);
  assert.deepEqual(servableSentences(k2, new Set(['the'])).map(s => s.id), ['man-mat']);
  assert.deepEqual(servableSentences(k2, new Set()).map(s => s.id), []);
  assert.deepEqual(servableSentences(new Set([...k2, 'p', 'i']), new Set(['the', 'is', 'a'])).map(s => s.id), ['man-mat', 'map-mat', 'pin-pot', 'pot-map']);
});
test('punctuation is kept for display, not for lookup; audio covers every token + sentence', () => {
  assert.deepEqual(tokenize('no, not').map(t => [t.w, t.punct]), [['no', ','], ['not', '']]);
  const ids = new Set(buildManifest().clips.map(c => c.id));
  for (const s of allSentences()) { assert.ok(ids.has(`sent-${s.id}`), s.id); for (const t of s.tokens) assert.ok(ids.has(t.clip), t.clip); }
});

test('v2 V7 scored read: 3 distinct scene pictures incl. the answer; each distractor differs from the sentence by exactly one content word', () => {
  for (const s of allSentences()) {
    const ds = sentenceDistractors(s); assert.ok(ds.length >= 2, s.id);
    assert.equal(Object.keys(s.scene).length, 2, `${s.id}: two scene words`);
    const words = tokenize(s.text).map(t => t.w);
    for (const k of Object.keys(s.scene)) assert.ok(words.includes(k), `${s.id}: scene word ${k} is in the sentence`);
    for (const d of ds) {
      const dw = tokenize(d.text).map(t => t.w);
      assert.equal(dw.length, words.length); assert.equal(dw.filter((w, i) => w !== words[i]).length, 1, `${s.id} vs "${d.text}"`);
      assert.notEqual(d.pic, s.pic); assert.ok(!words.includes(d.word), `${s.id}: ${d.word} is already in the sentence`);
    }
    for (let k = 0; k < 10; k++) { const pics = pictureChoices(s, Math.random); assert.equal(pics.length, 3); assert.ok(pics.includes(s.pic)); assert.equal(new Set(pics).size, 3, s.id); }
  }
});
test('v2 V7: full stops; no negation in picture-checked sentences', () => {
  for (const s of allSentences()) { assert.match(s.text, /[.!?]$/, s.id); assert.doesNotMatch(s.text, /\b(no|not)\b/, s.id); }
});

test('v2 V9 stories: 3–5 pages of 3–7 words, decodable pages AND titles, servable at their map stop; ask = 3 distinct pics', async () => {
  const { allStories, servableStory } = await import('../js/sentences.js'); const { STOPS } = await import('../js/progress.js');
  const { GPCS } = await import('../js/sequence.js'); const { STAR_WORDS } = await import('../js/content.js'); const { parseIds } = await import('../js/validate.js');
  const ss = allStories(); assert.ok(ss.length >= 5);
  for (const s of ss) {
    assert.ok(s.pages.length >= 3 && s.pages.length <= 5, s.id);
    for (const p of s.pages) { for (const t of p.tokens) assert.notEqual(t.kind, 'unknown', `${s.id}: "${t.raw}"`); assert.ok(p.tokens.length >= 3 && p.tokens.length <= 7, `${s.id}: "${p.text}"`); }
    assert.equal(new Set([s.ask.answer, ...s.ask.others]).size, 3, s.id);
    // known at the story's stop: every GPC whose sound stop comes before it; star words: every one introducible by then
    const at = STOPS.findIndex(x => x.id === `story:${s.id}`); assert.ok(at > 0, s.id);
    const known = new Set(STOPS.slice(0, at).filter(x => x.kind === 'sound').map(x => x.gpc));
    const stars = new Set(STAR_WORDS.filter(w => w.introAfter.gpcs.every(g => known.has(g))).map(w => w.w));
    for (const t of s.titleTokens) assert.ok(t.kind === 'star' ? stars.has(t.star.w) : t.kind === 'word' && parseIds(t.entry).every(g => known.has(g)), `${s.id}: title word "${t.w}"`);
    assert.ok(servableStory(s.id, known, stars), `${s.id}: not decodable at its stop`);
  }
  const first = STOPS.findIndex(x => x.kind === 'story'); assert.ok(first <= 20, `first story at stop ${first + 1}`); // v2 V9: from ~stop 15
});
test('new sentences use only star words and decodable words', () => {
  for (const s of allSentences()) for (const t of s.tokens) assert.notEqual(t.kind, 'unknown', `${s.id}: "${t.raw}"`);
});
