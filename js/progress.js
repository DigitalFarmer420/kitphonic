// Learning-map progress (pure). A child's journey is a path of stops derived from the GPC sequence: one stop per new
// sound, plus a words stop when a blend level opens. Stop pass rules read the mastery log (js/mastery.js):
//   sound stop  -> sound:<gpc> secure or better
//   words stop  -> blend:L<n> secure or better (and blending unlocked: >= 4 secure sounds incl. a vowel)
// Untaught-sound check: words / star words are only served when every GPC is known (validate.servable).
import { GPCS, GPC, VOWEL_IDS } from './sequence.js';
import { WORDS, STAR_WORDS, MAX_NEW_STAR_PER_LEVEL, LETTER_INFO } from './content.js';
import { skillState, atLeast, knownGpcs, blendingUnlocked } from './mastery.js';
import { servable, parseIds } from './validate.js';

// Word levels open after these GPCs (and only once the level has >= MIN_WORDS servable words).
export const WORD_STOPS = [
  { level: 1, after: 't', label: 'at' },   // after set 1 m s a t: VC (at, am)
  { level: 2, after: 'p', label: 'mat' },  // CVC
  { level: 3, after: 'n', label: 'pin' },  // CVC, second vowel
  { level: 4, after: 'o', label: 'stop' }, // CCVC
  { level: 5, after: 'f', label: 'sand' }, // CVCC: final blends (set 3 done: sand, pond, fast, soft)
  { level: 6, after: 'sh', label: 'ship' }, // digraphs: two letters, one sound (set 8)
];
export const MIN_WORDS = 2; // L1 opens with at, am
export const MAX_STOPS_GPCS = GPCS.length; // the whole sequence (sets 1–8, 38 sounds); every set has words to read

export function buildStops(gpcLimit = MAX_STOPS_GPCS) {
  const stops = [];
  // graphemes with two sounds on the map (s = /s/ and /z/, th in thin / that) carry their example as the group label
  const shared = g => GPCS.some(o => o.id !== g.id && o.grapheme === g.grapheme);
  for (const g of GPCS.slice(0, gpcLimit)) {
    const ex = shared(g) && /\((.+)\)/.exec(LETTER_INFO[g.id]?.sound ?? '')?.[1];
    stops.push({ id: `sound:${g.id}`, kind: 'sound', gpc: g.id, label: g.grapheme, skill: `sound:${g.id}`, ...(ex ? { group: `${g.grapheme} as in ${ex}` } : {}) });
    for (const w of WORD_STOPS.filter(w => w.after === g.id))
      stops.push({ id: `words:L${w.level}`, kind: 'words', level: w.level, label: w.label, skill: `blend:L${w.level}` });
  }
  return stops;
}
export const STOPS = buildStops();

export function stopPassed(responses, stop, now = Date.now()) {
  const ok = atLeast(skillState(responses, stop.skill, now), 'secure');
  return stop.kind === 'words' ? ok && blendingUnlocked(responses, now) : ok;
}
// Map: passed (sage + star) / current (one, glowing) / upcoming (sand). Stops are passed strictly in order.
export function mapState(responses, now = Date.now(), stops = STOPS) {
  let cur = -1;
  const out = stops.map((s, i) => {
    const passed = cur < 0 && stopPassed(responses, s, now);
    if (!passed && cur < 0) cur = i;
    return { ...s, status: passed ? 'passed' : cur === i ? 'current' : 'upcoming' };
  });
  return { stops: out, current: cur < 0 ? null : out[cur], index: cur < 0 ? stops.length : cur, done: cur < 0 };
}
export const starCount = (responses, now) => mapState(responses, now).stops.filter(s => s.status === 'passed').length;

// Sounds introduced so far = every sound stop up to and including the current one.
export function activeSounds(responses, now = Date.now(), stops = STOPS) {
  const m = mapState(responses, now, stops), upto = m.done ? stops.length : m.index + 1;
  return stops.slice(0, upto).filter(s => s.kind === 'sound').map(s => s.gpc);
}
export const activeNames = activeSounds; // Phase 1 letter names follow the same order
export function nextNewSound(responses, now = Date.now()) {
  const c = mapState(responses, now).current; return c?.kind === 'sound' ? c.gpc : null;
}
// Highest blend level whose words stop has been reached (current or passed).
export function currentBlendLevel(responses, now = Date.now()) {
  const m = mapState(responses, now); let lv = 0;
  m.stops.forEach((s, i) => { if (s.kind === 'words' && i <= m.index) lv = s.level; });
  return lv;
}
export const wordsUnlocked = (responses, now) => blendingUnlocked(responses, now);
// Untaught-sound check (R5 rule 3): only words whose every GPC is known (secure+) or currently being introduced.
export function servableWords(level, known) {
  return (WORDS[level] ?? []).filter(e => servable(e, known));
}
export function knownForServing(responses, now = Date.now()) {
  const k = knownGpcs(responses, now); return k;
}
// Star words: introAfter GPCs known (+ prerequisite star), level reached, <= MAX_NEW_STAR_PER_LEVEL per level.
export function availableStars(responses, now = Date.now()) {
  const known = knownGpcs(responses, now), lv = currentBlendLevel(responses, now), out = [];
  const perLevel = {};
  for (const s of STAR_WORDS) {
    if (s.level > Math.max(lv, 0) || !lv) continue;
    if (!s.introAfter.gpcs.every(g => known.has(g))) continue;
    if (s.introAfter.star && !atLeast(skillState(responses, `star:${s.introAfter.star}`, now), 'practicing')) continue;
    if (!s.parse.filter(p => typeof p === 'string').every(g => known.has(g))) continue;
    perLevel[s.level] = (perLevel[s.level] ?? 0) + 1; if (perLevel[s.level] > MAX_NEW_STAR_PER_LEVEL) continue;
    out.push(s);
  }
  return out;
}
export const hasVowel = gpcs => gpcs.some(g => VOWEL_IDS.has(g));
export { GPC, parseIds };
