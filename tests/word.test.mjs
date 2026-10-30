// Word screen logic, content, layout, config, manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../js/word-logic.js';
import { WORDS, PICTURE_POOL } from '../js/content.js';
import { LETTERS, markers, markerPositions } from '../js/core.js';
import { wordLayout } from '../js/layout.js';
import { CONFIG, configFromUrl } from '../js/config.js';
import { buildManifest } from '../js/manifest.js';

const all = Object.values(WORDS).flat();
test('every target word decodes from the prototype letter set', () => {
  for (const { w } of all) assert.ok([...w].every(c => LETTERS.includes(c)), w);
});
test('about 30 words across L1–L4', () => { const u = new Set(all.map(e => e.w)); assert.ok(u.size >= 28, `${u.size}`); });
test('pictures are unique per word (no two words share a picture)', () => {
  const m = new Map(); for (const [w, p] of [...all.filter(e => e.pic).map(e => [e.w, e.pic]), ...PICTURE_POOL.map(p => [p.text, p.pic])]) {
    if (m.has(p)) assert.equal(m.get(p), w, `${p} used by ${m.get(p)} and ${w}`); m.set(p, w);
  }
});
test('clip routing: dots, held stretchy sounds, bars, fast rate', () => {
  const [m, at] = markers('mat', 2);
  assert.deepEqual(L.clipForMarker(m, 'long'), { id: 'snd-m-held', rate: 1 });
  assert.deepEqual(L.clipForMarker(m, 'short'), { id: 'snd-m', rate: 1.25 });
  assert.equal(L.clipForMarker(at, 'long').id, 'rime-at');
  assert.equal(L.clipForMarker(markers('tap', 3)[0], 'long').id, 'snd-t'); // clipped never held
  assert.equal(L.clipForTap('nameDot', 'letter', 'm').id, 'name-m');
  assert.equal(L.clipForTap('nameDot', 'dot', 'm').id, 'snd-m');
  assert.equal(L.clipForTap('sound', 'letter', 'm').id, 'snd-m');
  assert.equal(L.slideAgainClip('upbeat').id, 'm-slide-again-upbeat');
  assert.equal(L.slideAgainClip().id, 'm-slide-again-calm');
});
test('R8: every distractor differs from its target by exactly one phoneme (all words, all strategies, many trials)', () => {
  for (const e of all.filter(e => L.needsCheck(e, {}, 2))) for (const strategy of ['minimal', 'rhyme', 'vowel']) for (let t = 0; t < 6; t++) {
    const c = L.makeChoices(e.w, { rand: L.rng(t), strategy, trial: t });
    assert.ok(c.length >= 2 && c.length <= 3, e.w); assert.equal(new Set(c.map(x => x.pic)).size, c.length);
    for (const x of c) if (x.w !== e.w) assert.ok(L.minimalPairs(e.w).some(p => p.w === x.w), `${e.w}/${x.w}`);
  }
});
test('R8: contrastPosition classifies onset / vowel / final, rejects non-minimal pairs', () => {
  const ph = s => s.split(' ');
  assert.equal(L.contrastPosition(ph('m æ t'), ph('h æ t')), 'onset');
  assert.equal(L.contrastPosition(ph('m æ t'), ph('m ɪ t')), 'vowel');
  assert.equal(L.contrastPosition(ph('m æ t'), ph('m æ p')), 'final');
  assert.equal(L.contrastPosition(ph('s t ɒ p'), ph('s t ɛ p')), 'vowel');
  assert.equal(L.contrastPosition(ph('m æ t'), ph('m ɒ p')), null);
  assert.equal(L.contrastPosition(ph('m æ t'), ph('æ t')), null);
});
test('R8: over 9 trials every contrast position leads at least twice (mat), vowel >= 1 in 3', () => {
  const lead = Array.from({ length: 9 }, (_, t) => L.makeChoices('mat', { rand: L.rng(t), trial: t }).contrast);
  for (const p of L.CONTRASTS) assert.ok(lead.filter(x => x === p).length >= 2, `${p}: ${lead}`);
  for (let i = 0; i + 3 <= 9; i += 3) assert.ok(lead.slice(i, i + 3).includes('vowel'));
});
test('R8: legacy rhyme strategy = onset contrasts only (hat/mat/cat style)', () => {
  const c = L.makeChoices('mat', { rand: L.rng(1), strategy: 'rhyme' });
  for (const x of c) assert.equal(L.rimeOf(x.w), 'at');
});
test('R8 / open question 1: L1 never gets a picture check unless checkAtL1; non-picturable words skip it', () => {
  const pic = { w: 'mat', pic: '#mat', level: 2 };
  assert.equal(L.needsCheck(pic, {}, 1), false);
  assert.equal(L.needsCheck(pic, { checkAtL1: true }, 1), true);
  assert.equal(L.needsCheck(pic, {}, 2), true);
  assert.equal(L.needsCheck({ w: 'sat', level: 2 }), false);
  assert.equal(L.needsCheck(pic, { checkPictureWords: false }, 2), false);
  for (const e of WORDS[1]) assert.equal(L.needsCheck(e, CONFIG, 1), false);
  assert.throws(() => L.makeChoices('sat'));
});
test('reshuffle always changes the order', () => {
  const r = L.rng(5), a = ['a', 'b', 'c'];
  for (let k = 0; k < 50; k++) { const b = L.reshuffle(a, r); assert.notDeepEqual(b, a); assert.deepEqual([...b].sort(), a); }
});
test('session: 5 words, no back-to-back repeats, seeded = reproducible', () => {
  const s1 = L.sessionWords(2, { rand: L.rng(9) }).map(e => e.w), s2 = L.sessionWords(2, { rand: L.rng(9) }).map(e => e.w);
  assert.equal(s1.length, 5); assert.deepEqual(s1, s2);
  for (let i = 1; i < s1.length; i++) assert.notEqual(s1[i], s1[i - 1]);
});
test('layout: letter centres map exactly to core marker trigger positions', () => {
  for (const w of ['at', 'mat', 'stop']) {
    const lay = wordLayout(w.length), pos = markerPositions(markers(w, 3));
    [...w].forEach((_, i) => assert.ok(Math.abs(lay.fracFromX(lay.tileLeft(i) + 60) - pos[i]) < 1e-9));
    assert.equal(lay.fracFromX(-50), 0); assert.equal(lay.fracFromX(5000), 1);
  }
  const b = wordLayout(3).markerBox(markers('mat', 2)[1]); assert.equal(b.width, 2 * 138 - 18);
});
test('config defaults + URL overrides', () => {
  assert.equal(CONFIG.tileCase, 'lower'); assert.equal(CONFIG.mascot.name, 'Kit');
  assert.deepEqual(CONFIG.choiceStrategy, { 1: 'minimal', 2: 'minimal', 3: 'minimal', 4: 'minimal' }); assert.equal(CONFIG.checkAtL1, false);
  const c = configFromUrl('?level=9&case=upper&voice=upbeat&choices=vowel&skipHello=1&seed=3&word=map');
  assert.equal(c.startLevel, 4); assert.equal(c.tileCase, 'upper'); assert.equal(c.voice, 'upbeat');
  assert.equal(c.choiceStrategy[1], 'vowel'); assert.equal(c.hello.show, false); assert.equal(c.seed, 3); assert.equal(c.word, 'map');
  assert.equal(CONFIG.tileCase, 'lower'); // defaults not mutated
});
test('manifest covers every required clip and is in sync with content', () => {
  const onDisk = JSON.parse(readFileSync(new URL('../audio/manifest.json', import.meta.url)));
  const ids = new Set(onDisk.clips.map(c => c.id));
  for (const id of L.requiredClips()) assert.ok(ids.has(id), `manifest missing ${id} (run npm run manifest)`);
  assert.deepEqual([...ids].sort(), buildManifest().clips.map(c => c.id).sort(), 'manifest stale: run npm run manifest');
  assert.equal(ids.size, onDisk.clips.length, 'duplicate ids');
  for (const c of onDisk.clips) assert.ok(c.text && (c.tts || c.placeholder !== 'tts'), c.id);
});
test('manifest contents: names, sounds + held, 15 rimes, words, star words, both slide-again takes, chime', () => {
  const m = buildManifest(), k = kind => m.clips.filter(c => c.kind === kind).length;
  assert.equal(k('letter-name'), 8); assert.equal(k('letter-sound'), 8); assert.equal(k('letter-sound-held'), 6);
  assert.equal(k('rime'), 15); assert.ok(k('word') >= 28); assert.ok(k('star-word') >= 4 && k('star-word') <= 6);
  assert.equal(k('star-sentence'), k('star-word'));
  const ids = m.clips.map(c => c.id);
  for (const id of ['m-slide-again-calm', 'm-slide-again-upbeat', 'sfx-chime', 'm-hello']) assert.ok(ids.includes(id), id);
});
test('manifest picks up recorded takes by filename', () => {
  const m = buildManifest(['snd-m.m4a', 'word-mat.wav', 'notes.txt']);
  assert.equal(m.clips.find(c => c.id === 'snd-m').take, 'takes/snd-m.m4a');
  assert.equal(m.clips.find(c => c.id === 'word-mat').take, 'takes/word-mat.wav');
  assert.equal(m.clips.find(c => c.id === 'snd-s').take, null);
});
test('portrait layout: 4-letter word fits a 540 stage and letter centres still match marker positions', async () => {
  const { PORTRAIT_TILES } = await import('../js/layout.js');
  const lay = wordLayout(4, PORTRAIT_TILES), pos = markerPositions(markers('stop', 4));
  assert.ok(lay.track.left - 36 >= 0 && lay.track.left + lay.track.width + 46 <= 540); // handle + end arrow on screen
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(lay.fracFromX(lay.tileLeft(i) + lay.tileW / 2) - pos[i]) < 1e-9);
});
test('stage: portrait for tall screens (phone 390x844, tablet 820x1180), landscape otherwise', async () => {
  const { stageFor } = await import('../js/stage.js');
  const phone = stageFor(390, 844), tab = stageFor(820, 1180), land = stageFor(1180, 820);
  assert.ok(phone.portrait && tab.portrait && !land.portrait);
  assert.equal(phone.w, 540); assert.ok(phone.h >= 880 && phone.h <= 1170);
  assert.ok(phone.w * phone.scale <= 390.01 && phone.h * phone.scale <= 844.01);
  assert.equal(land.w, 960); assert.ok(Math.abs(land.scale - Math.min(1180 / 960, 820 / 600)) < 1e-9);
});
