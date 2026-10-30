// Review R5: decodability validator over all content (CI-blocking via npm test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORDS, PICTURE_POOL } from '../js/content.js';
import { validateWord, validateContent, formatErrors, expand, servable, earliestLegalK } from '../js/validate.js';
import { PROTOTYPE_SET, GPC } from '../js/sequence.js';
import { buildManifest } from '../js/manifest.js';

const src = readFileSync(new URL('../js/content.js', import.meta.url), 'utf8').split('\n');
const where = e => { const i = src.findIndex(l => l.includes(`W('${e.text}'`)); return `js/content.js:${i + 1}`; };
const all = Object.values(WORDS).flat();

test('all content words pass the validator (parse, taught GPCs only, level pattern)', () => {
  const errs = validateContent(all, { where });
  assert.equal(errs.length, 0, '\n' + formatErrors(errs));
});
test('rejects "is" as an L1 decodable (s=/z/ untaught) and "sand" (d untaught), naming the GPC', () => {
  const is = validateWord({ text: 'is', parse: 'i s_z', level: 1 }, { k: 8 }); // prototype reach (m s a t p i n o)
  assert.deepEqual(is.map(e => [e.rule, e.gpc]), [['untaught', 's_z']]);
  const sand = validateWord({ text: 'sand', parse: 's a n d', level: 5 }, { k: 8 });
  assert.deepEqual(sand.map(e => [e.rule, e.gpc]), [['untaught', 'd']]);
});
test('rejects bad parses and wrong level patterns', () => {
  assert.equal(validateWord({ text: 'mat', parse: 'm a', level: 2 })[0].rule, 'parse');
  assert.equal(validateWord({ text: 'mat', parse: 'm a zz', level: 2 })[0].rule, 'parse');
  assert.equal(validateWord({ text: 'stop', parse: 's t o p', level: 2 })[0].rule, 'pattern');
  assert.equal(validateWord({ text: 'Sam', parse: 's a m', level: 2 }).some(e => e.rule === 'parse' || e.rule === 'capital'), true);
});
test('accepts the review seed words for m s a t p i n o', () => {
  const seed = { 1: 'at am an in it on', 2: 'sat mat pat map tap nap pan man tan sap sit pit tip sip pin tin nip top pot mop not pop', 4: 'snap spin spot stop snip spit spat' };
  for (const [lv, ws] of Object.entries(seed)) for (const w of ws.split(' '))
    assert.deepEqual(validateWord({ text: w, parse: [...w].join(' '), level: +lv }), [], w);
});
test('expand gives [grapheme, phoneme] pairs; earliest legal position', () => {
  assert.deepEqual(expand({ parse: 'm a t' }), [['m', 'm'], ['a', 'æ'], ['t', 't']]);
  assert.equal(earliestLegalK({ parse: 'p o t' }), GPC.o.order);
});
test('runtime legality: serve only words whose GPCs the child knows', () => {
  assert.ok(servable({ parse: 'm a t' }, new Set(['m', 'a', 't'])));
  assert.ok(!servable({ parse: 'm a p' }, new Set(['m', 'a', 't'])));
});
test('no proper names / no "mom" in decodable content; "is" is parsed with s = /z/; old unit fixtures removed', () => {
  for (const w of ['mom', 'mum', 'sam', 'pam']) assert.ok(!all.some(e => e.text === w), w);
  assert.equal(all.find(e => e.text === 'is')?.parse, 'i s_z'); assert.equal(all.find(e => e.text === 'has')?.parse, 'h a s_z');
  const coreTests = readFileSync(new URL('./core.test.mjs', import.meta.url), 'utf8');
  assert.ok(!/'sun'|'cat'/.test(coreTests));
});
test('audio coverage: every prototype GPC has a sound clip and every word a word + reveal clip', () => {
  const ids = new Set(buildManifest().clips.map(c => c.id));
  for (const g of PROTOTYPE_SET) assert.ok(ids.has(`snd-${g}`), g);
  for (const e of all) { assert.ok(ids.has(`word-${e.text}`)); assert.ok(ids.has(`reveal-${e.text}`)); }
});
test('picture pool entries carry phonemes', () => {
  for (const p of PICTURE_POOL) assert.ok(p.phonemes.every(Boolean), p.text);
});
test('v2 V10: a printed letter-intro label never contains an untaught GPC; every intro shows a picture or a decodable word', async () => {
  const { LETTER_PICS } = await import('../js/content.js'); const { introLabel } = await import('../js/lesson-screen.js'); const { GPC } = await import('../js/sequence.js');
  const { WORDS } = await import('../js/content.js'); const parse = new Map(Object.values(WORDS).flat().map(e => [e.w, e.parse.split(' ')]));
  for (const [g, pics] of Object.entries(LETTER_PICS)) for (const [word, pic] of pics) {
    if (introLabel(word, g)) for (const id of parse.get(word)) assert.ok(GPC[id].order <= GPC[g].order, `${g}: "${word}" prints untaught ${id}`);
    assert.ok(pic || introLabel(word, g), `${g}: "${word}" has neither a picture nor a decodable label`);
  }
  assert.equal(introLabel('moon', 'm'), false); assert.equal(introLabel('map', 'm'), false); assert.equal(introLabel('map', 'p'), true); assert.equal(introLabel('it', 'i'), true);
  for (const bad of ['insect', 'ink', 'ox', 'teddy', 'yak', 'cliff', 'feather']) assert.ok(!Object.values(LETTER_PICS).flat().some(([w]) => w === bad), bad);
});
