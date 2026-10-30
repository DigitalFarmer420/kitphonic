// Word-screen logic (spec §3.5): clip routing, picture-check choices, session queue. Pure, unit-tested.
import { WORDS, PICTURE_POOL, LETTER_INFO, STAR_WORDS, MASCOT, SFX, SESSION_WORDS } from './content.js';
import { LETTERS, STRETCHY, markers, tapResult } from './core.js';
import { VOWEL_IDS } from './sequence.js';
// VC rimes buildable from the prototype set (vowel + consonant), from the R1 sequence table.
export const protoRimes = () => LETTERS.filter(l => VOWEL_IDS.has(l)).flatMap(v => LETTERS.filter(c => !VOWEL_IDS.has(c)).map(c => v + c));

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
export const rimeOf = w => { const v = [...w].findIndex(c => VOWELS.has(c)); return v < 0 ? w : w.slice(v); };
export const onsetOf = w => w.slice(0, w.length - rimeOf(w).length);

// Marker layout per level. L1 bar / L4 all-dots by default (opts forwarded to core.markers).
export const markersFor = (w, level, opts) => markers(w, level, opts);

// Which clip a slider marker plays. stretch: 'long'|'normal'|'short'|undefined.
export function clipForMarker(m, stretch) {
  if (m.type === 'bar') return { id: `rime-${m.text}`, rate: stretch === 'short' ? 1.25 : 1 };
  const id = m.id ?? m.text, held = stretch === 'long' && m.stretchy && STRETCHY.has(id);
  return { id: held ? `snd-${id}-held` : `snd-${id}`, rate: stretch === 'short' ? 1.25 : 1 };
}
export function clipForTap(mode, target, letter) {
  const r = tapResult(mode, target, letter), named = LETTER_INFO[letter] ? !LETTER_INFO[letter].digraph && !LETTER_INFO[letter].noName : true;
  return { id: r.play === 'name' && named ? `name-${letter}` : `snd-${letter}`, rate: 1 };
}
export const clipForBlend = w => ({ id: `word-${w}`, rate: 1 });
export const clipForReveal = w => ({ id: `reveal-${w}`, rate: 1 });
export const slideAgainClip = (voice = 'calm') => ({ id: voice === 'upbeat' ? 'm-slide-again-upbeat' : 'm-slide-again-calm', rate: 1 });

// Seeded RNG (mulberry32) so tests and ?seed= runs are reproducible.
export function rng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle(arr, rand = Math.random) {
  const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a;
}
// Reshuffle after a wrong pick: always a different order (so the child sees the choices move).
export function reshuffle(arr, rand = Math.random) {
  if (arr.length < 2) return arr.slice();
  for (let k = 0; k < 20; k++) { const a = shuffle(arr, rand); if (a.some((x, i) => x !== arr[i])) return a; }
  return [...arr.slice(1), arr[0]];
}

const allPics = () => {
  const m = new Map(PICTURE_POOL.map(p => [p.text, p.pic]));
  for (const [lv, list] of Object.entries(WORDS)) if (+lv >= 2) for (const e of list) if (e.pic) m.set(e.w, e.pic);
  return m;
};
const phonemeMap = () => {
  const m = new Map(PICTURE_POOL.map(p => [p.text, p.phonemes]));
  for (const e of Object.values(WORDS).flat()) if (e.pic) m.set(e.w, e.phonemes);
  return m;
};
const targetEntry = w => Object.values(WORDS).flat().find(e => e.w === w);
// R8: which position a one-phoneme difference sits in ('onset' | 'vowel' | 'final'), or null if not a minimal pair.
export function contrastPosition(target, other) {
  if (target.length !== other.length) return null;
  const diff = target.map((p, i) => (p !== other[i] ? i : -1)).filter(i => i >= 0);
  if (diff.length !== 1) return null;
  const v = target.findIndex(p => VOWEL_PHONEMES.has(p)), i = diff[0];
  return i < v ? 'onset' : i === v ? 'vowel' : 'final';
}
const VOWEL_PHONEMES = new Set(['æ', 'ɪ', 'ɒ', 'ɛ', 'ʌ']);
// Picturable minimal-pair distractors for a target word, tagged by contrast position.
export function minimalPairs(word) {
  const e = targetEntry(word); if (!e?.pic) return [];
  const pics = allPics(), phs = phonemeMap();
  const out = [...phs].filter(([w]) => w !== word && pics.get(w) && pics.get(w) !== e.pic)
    .map(([w, ph]) => ({ w, pic: pics.get(w), contrast: contrastPosition(e.phonemes, ph) })).filter(c => c.contrast);
  // L7 plural: the singular (one cat vs two cats) differs only by the final -s sound; never the other way round
  if (e.stem && pics.get(e.stem) && pics.get(e.stem) !== e.pic) out.push({ w: e.stem, pic: pics.get(e.stem), contrast: 'final' });
  return out;
}
export const CONTRASTS = ['onset', 'vowel', 'final'];
// Picture-check choices (§3.5.2). Default strategy 'minimal' (review R8): every distractor differs from the target by
// exactly one phoneme, and the contrast position rotates with `trial` (onset -> vowel -> final), so a vowel
// contrast leads at least 1 trial in 3 when the word has one. Legacy (config): 'rhyme' = onset contrasts only,
// 'vowel' = vowel contrasts first. Returns choices with .contrast = the leading contrast actually used.
export function makeChoices(word, { n = 3, rand = Math.random, strategy = 'minimal', trial = 0 } = {}) {
  const pics = allPics(), target = { w: word, pic: pics.get(word) };
  if (!target.pic) throw new Error(`no picture for "${word}"`);
  const pairs = minimalPairs(word);
  // rhyme = onset contrasts only, unless the word has none (then any minimal pair, so a check never has one card)
  // focus:<pos> (error-pattern practice): that contrast leads every check when the word has one
  const focus = strategy.startsWith?.('focus:') ? strategy.slice(6) : null;
  const order = strategy === 'rhyme' && pairs.some(c => c.contrast === 'onset') ? ['onset'] : strategy === 'vowel' ? ['vowel', 'onset', 'final']
    : focus && CONTRASTS.includes(focus) ? [focus, ...CONTRASTS.filter(p => p !== focus)]
    : CONTRASTS.map((_, i) => CONTRASTS[(i + trial) % 3]);
  const byPos = Object.fromEntries(order.map(p => [p, shuffle(pairs.filter(c => c.contrast === p), rand)]));
  const out = [target], used = new Set([target.pic]); let lead = null;
  for (let round = 0; out.length < n && round < n; round++)
    for (const p of order) {
      if (out.length >= n) break;
      const c = byPos[p].find(c => !used.has(c.pic)); if (!c) continue;
      used.add(c.pic); out.push(c); lead ??= p;
    }
  const res = shuffle(out, rand); res.contrast = lead; return res;
}
// Picture check only for picturable words with at least one minimal-pair picture; never at L1 unless
// config.checkAtL1 (review R8 / open question 1). Others get Kit's spoken sentence instead.
export const needsCheck = (entry, cfg = {}, level = entry.level) =>
  !!entry.pic && cfg.checkPictureWords !== false && (level > 1 || !!cfg.checkAtL1) && minimalPairs(entry.w).length > 0;
// Printed word-card check for words without a picture check (L1 VC words, sat, top…): the child picks the word they
// just read from minimal-pair printed words (one letter different). opts.known: only words with taught GPCs.
// Each card is tagged with the position it differs in (first letter = onset, last = final, a vowel letter = vowel),
// so word-card misses feed the error patterns too; focus puts cards differing at that position first.
export const cardContrast = (word, other) => { const i = [...word].findIndex((c, k) => c !== other[k]);
  return i < 0 ? null : i === 0 ? 'onset' : i === word.length - 1 ? 'final' : /[aeiou]/.test(word[i]) && /[aeiou]/.test(other[i]) ? 'vowel' : null; };
export function wordCards(word, { n = 3, rand = Math.random, known = null, focus = null } = {}) {
  const all = [...new Map(Object.values(WORDS).flat().map(e => [e.w, e])).values()];
  const ok = e => !known || e.parse.split(' ').every(g => known.has(g));
  const diff1 = w => w.length === word.length && [...w].filter((c, i) => c !== word[i]).length === 1;
  const pool = shuffle(all.filter(e => e.w !== word && diff1(e.w) && ok(e)), rand).map(e => ({ w: e.w, card: true, contrast: cardContrast(word, e.w) }));
  if (focus) pool.sort((a, b) => (b.contrast === focus) - (a.contrast === focus));
  const others = pool.slice(0, n - 1);
  if (!others.length) return null;
  const res = shuffle([{ w: word, card: true }, ...others], rand); res.cards = true; res.contrast = others[0].contrast; return res;
}
export const caseFor = (text, tileCase = 'lower') => tileCase === 'upper' ? text.toUpperCase() : text.toLowerCase();

// Session: SESSION_WORDS words from a level, shuffled, no immediate repeats across a wrap.
export function sessionWords(level, { rand = Math.random, count = SESSION_WORDS } = {}) {
  const list = WORDS[level]; if (!list) throw new Error(`unknown level ${level}`);
  const out = []; let bag = [];
  while (out.length < count) { if (!bag.length) bag = shuffle(list, rand); const e = bag.pop(); if (out.at(-1)?.w !== e.w || list.length === 1) out.push(e); }
  return out;
}

// Every clip the prototype can request. The manifest must cover all of these.
export function requiredClips() {
  const ids = new Set();
  for (const l of LETTERS) { ids.add(`name-${l}`); ids.add(`snd-${l}`); if (STRETCHY.has(l)) ids.add(`snd-${l}-held`); }
  for (const r of protoRimes()) ids.add(`rime-${r}`); // every VC rime in the prototype set (15)
  for (const [lv, list] of Object.entries(WORDS)) for (const { w, parse } of list) {
    ids.add(`word-${w}`); ids.add(`reveal-${w}`); const p = { ids: parse?.split(' ') };
    const variants = [markers(w, +lv, p), markers(w, +lv, { ...p, l1: 'dots' }), markers(w, +lv, { ...p, l4: 'blendBar' })];
    for (const ms of variants) for (const m of ms) for (const s of ['long', 'normal']) ids.add(clipForMarker(m, s).id);
  }
  for (const { w } of STAR_WORDS) { ids.add(`star-${w}`); ids.add(`star-${w}-sentence`); }
  for (const id of Object.keys(MASCOT)) ids.add(id);
  for (const id of Object.keys(SFX)) ids.add(id);
  return ids;
}
