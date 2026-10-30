// Word screen logic, content, layout, config, manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../js/word-logic.js';
import { WORDS, PICTURE_POOL, LETTER_INFO } from '../js/content.js';
import { LETTERS, STRETCHY, markers, markerPositions } from '../js/core.js';
import { GPC } from '../js/sequence.js';
import { wordLayout } from '../js/layout.js';
import { CONFIG, configFromUrl } from '../js/config.js';
import { buildManifest } from '../js/manifest.js';

const all = Object.values(WORDS).flat();
test('every target word decodes: its GPC parse spells the word; L2 uses only the prototype letters; L1, L3-L5 stay before set 8; L6 uses a set-8 digraph', () => {
  for (const e of all) { const ids = e.parse.split(' '); assert.equal(ids.map(id => GPC[id].grapheme).join(''), e.w);
    if (e.level === 2) assert.ok([...e.w].every(c => LETTERS.includes(c)), e.w);
    if (e.level !== 6) assert.ok(ids.every(id => GPC[id].set < 8), `${e.w}: set-8 sound below L6`);
    else assert.ok(ids.some(id => GPC[id].set === 8), `${e.w}: L6 word without a set-8 digraph`); }
});
test('digraph words (words-board 3): sh is one joined unit and ONE slider stop per sound', () => {
  assert.deepEqual(markers('ship', 6, { ids: ['sh', 'i', 'p'] }).map(m => m.text), ['sh', 'i', 'p']);
  assert.ok(markers('ship', 6, { ids: ['sh', 'i', 'p'] })[0].digraph);
  assert.deepEqual(markers('fish', 3, { ids: ['f', 'i', 'sh'] }).map(m => [m.start, m.end]), [[0, 1], [1, 2], [2, 4]]);
  assert.equal(L.clipForMarker(markers('ship', 6, { ids: ['sh', 'i', 'p'] })[0], 'long').id, 'snd-sh-held');
  const ch = L.makeChoices('ship', { rand: () => 0.3, trial: 0 }).map(c => c.w); assert.ok(ch.includes('chip') || ch.includes('shop'), ch.join());
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
  assert.deepEqual(CONFIG.choiceStrategy, { 1: 'minimal', 2: 'minimal', 3: 'minimal', 4: 'minimal', 5: 'minimal', 6: 'minimal' }); assert.equal(CONFIG.checkAtL1, false);
  const c = configFromUrl('?level=9&case=upper&voice=upbeat&choices=vowel&skipHello=1&seed=3&word=map');
  assert.equal(c.startLevel, 6); // clamped to the highest word level (6 = digraphs) assert.equal(c.tileCase, 'upper'); assert.equal(c.voice, 'upbeat');
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
  const info = Object.entries(LETTER_INFO); // every GPC in the sequence; digraphs (and s=/z/) have no letter-name clip
  assert.equal(k('letter-name'), info.filter(([, x]) => !x.digraph && !x.noName).length); assert.equal(k('letter-sound'), info.length);
  assert.equal(k('letter-sound-held'), info.filter(([id]) => STRETCHY.has(id)).length);
  assert.ok(m.clips.some(c => c.id === 'snd-sh-held') && !m.clips.some(c => c.id === 'name-sh'));
  assert.ok(L.protoRimes().every(r => m.clips.some(c => c.id === `rime-${r}`))); assert.ok(k('rime') >= 15); assert.ok(k('word') >= 28); assert.ok(k('star-word') >= 4 && k('star-word') <= 6);
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
// Usability pass: the stage fills the screen and every touch target is >= 64 screen px (knob >= 80) at all target sizes.
const VIEWPORTS = [[360, 780], [390, 844], [780, 360], [844, 390], [667, 375], [820, 1180], [1180, 820], [1024, 768], [1366, 1024], [1920, 1080]];
test('stage: modes, fills the screen, no empty band', async () => {
  const { stageFor } = await import('../js/stage.js');
  assert.equal(stageFor(360, 780).mode, 'portrait'); assert.equal(stageFor(820, 1180).mode, 'portrait');
  assert.equal(stageFor(780, 360).mode, 'short'); assert.equal(stageFor(1180, 820).mode, 'tall');
  for (const [vw, vh] of VIEWPORTS.slice(0, 7)) { // phones + iPad: stage covers >= 97% of both axes
    const s = stageFor(vw, vh);
    assert.ok(s.w * s.scale <= vw + .01 && s.h * s.scale <= vh + .01, `${vw}x${vh} overflows`);
    assert.ok(s.w * s.scale >= vw * .97 && s.h * s.scale >= vh * .97, `${vw}x${vh} band: ${s.w}x${s.h} @${s.scale.toFixed(2)}`);
  }
  assert.ok(Math.abs(stageFor(820, 1180).scale - 1.3) < .03, 'iPad portrait UI ~1.3x');
});
test('touch targets >= 64 screen px (knob >= 80) for 1-5 letter words at every viewport', async () => {
  const { stageFor, MIN_TOUCH, MIN_KNOB } = await import('../js/stage.js');
  const { layoutFor, MIN_TILE, KNOB } = await import('../js/layout.js');
  for (const [vw, vh] of VIEWPORTS) {
    const s = stageFor(vw, vh), L = layoutFor(s);
    assert.ok(72 * s.scale >= MIN_TOUCH, `${vw}x${vh}: dots/buttons ${72 * s.scale}`);
    assert.ok(KNOB * s.scale >= MIN_KNOB, `${vw}x${vh}: knob ${KNOB * s.scale}`);
    for (let n = 1; n <= 5; n++) {
      const lay = wordLayout(n, L);
      assert.ok(lay.tileW >= MIN_TILE && lay.tileW * s.scale >= MIN_TOUCH, `${vw}x${vh} n=${n}: tile ${lay.tileW}`);
      assert.ok(lay.rowLeft >= 0 && lay.rowLeft + lay.rowW <= s.w, `${vw}x${vh} n=${n}: row off stage`);
      assert.ok(lay.knobX(0) - KNOB / 2 >= 0 && lay.knobX(1) + KNOB / 2 <= s.w, `${vw}x${vh} n=${n}: knob off stage`);
    }
  }
});
test('phone portrait letter tiles grow to ~90 screen px; letter centres still match marker positions', async () => {
  const { stageFor } = await import('../js/stage.js'); const { layoutFor } = await import('../js/layout.js');
  const s = stageFor(360, 780), lay = wordLayout(3, layoutFor(s));
  assert.ok(lay.tileW * s.scale >= 88, `tile ${lay.tileW * s.scale}`);
  for (const w of ['map', 'stop']) {
    const l = wordLayout(w.length, layoutFor(s)), pos = markerPositions(markers(w, w.length === 4 ? 4 : 3));
    for (let i = 0; i < w.length; i++) assert.ok(Math.abs(l.fracFromX(l.tileLeft(i) + l.tileW / 2) - pos[i]) < 1e-9);
  }
  const sh = stageFor(780, 360), ls = wordLayout(4, layoutFor(sh)); // short landscape: row clears the left column
  assert.ok(ls.rowLeft >= 220);
});
