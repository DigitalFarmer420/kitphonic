// Learning-map progress (pure). A child's journey is a path of stops derived from the GPC sequence: one stop per new
// sound, plus a words stop when a blend level opens. Stop pass rules read the mastery log (js/mastery.js):
//   sound stop  -> sound:<gpc> secure or better
//   words stop  -> blend:L<n> secure or better (and blending unlocked: >= 4 secure sounds incl. a vowel)
// Untaught-sound check: words / star words are only served when every GPC is known (validate.servable).
import { GPCS, GPC, VOWEL_IDS } from './sequence.js';
import { WORDS, STAR_WORDS, MAX_NEW_STAR_PER_LEVEL, LETTER_INFO, STORIES } from './content.js';
import { skillState, atLeast, knownGpcs, blendingUnlocked, passedStopIds, isMarker, MARKER } from './mastery.js';
import { servable, parseIds } from './validate.js';

// Word levels open after these GPCs (and only once the level has >= MIN_WORDS servable words).
export const WORD_STOPS = [
  { level: 1, after: 't', label: 'at' },   // after set 1 m s a t: VC (at, am)
  { level: 2, after: 'p', label: 'mat' },  // CVC
  { level: 3, after: 'n', label: 'pin' },  // CVC, second vowel
  // v2 V4a: adjacent consonants wait until sets 1–5 are done (Phase 4 placement): CCVC, then CVCC, right after l
  { level: 4, after: 'l', label: 'stop' }, // CCVC
  { level: 5, after: 'l', label: 'sand' }, // CVCC / VCC: final blends (sand, hand, and)
  { level: 6, after: 'sh', label: 'ship' }, // digraphs: two letters, one sound (set 8)
  { level: 7, after: 's_z', label: 'cats' }, // v2 V4f: -s suffix (cats /s/, dogs /z/) right after s = /z/
];
// "New words" stops (sets 4–8): right after a letter set, words that use its new sounds (any level the child can
// already read), so new sounds are applied in words promptly. Responses carry `apply: <set>`; the stop passes when
// those reads are secure.
export const APPLY_STOPS = [
  { set: 3, after: 'f', label: 'dog' }, // v2 V4a: set 3 gets its own words stop (dog, fan, sad, dip)
  { set: 4, after: 'u', label: 'cup' }, { set: 5, after: 'l', label: 'bed' }, { set: 6, after: 's_z', label: 'duck' },
  { set: 7, after: 'qu', label: 'fox' }, { set: 8, after: 'nk', label: 'ring' },
];
export const MIN_WORDS = 2; // L1 opens with at, am
export const MAX_STOPS_GPCS = GPCS.length; // the whole sequence (sets 1–8, 38 sounds); every set has words to read

export const CUES = { s: '☀️', s_z: '👃', th: '👍', th_v: '👉' }; // sun, nose, thumb, that
export function buildStops(gpcLimit = MAX_STOPS_GPCS) {
  const stops = [];
  // graphemes with two sounds on the map (s = /s/ and /z/, th in thin / that) carry their example as the group label
  const shared = g => GPCS.some(o => o.id !== g.id && o.grapheme === g.grapheme);
  // Uiux r7: same-looking stops also get a cue picture a child can tell apart (sun / nose; thumb / that)
  for (const g of GPCS.slice(0, gpcLimit)) {
    const ex = shared(g) && /\((.+)\)/.exec(LETTER_INFO[g.id]?.sound ?? '')?.[1];
    stops.push({ id: `sound:${g.id}`, kind: 'sound', gpc: g.id, label: g.grapheme, skill: `sound:${g.id}`, ...(ex ? { group: `${g.grapheme} as in ${ex}` } : {}),
      ...(shared(g) && CUES[g.id] ? { cue: CUES[g.id] } : {}) });
    // new-words stop first (CVC with the set's sounds), then any level that opens here
    for (const a of APPLY_STOPS.filter(a => a.after === g.id))
      stops.push({ id: `words:set${a.set}`, kind: 'words', apply: a.set, label: a.label, skill: `apply:${a.set}`, group: 'new words' });
    for (const w of WORD_STOPS.filter(w => w.after === g.id))
      stops.push({ id: `words:L${w.level}`, kind: 'words', level: w.level, label: w.label, skill: `blend:L${w.level}` });
  }
  // v2 V9: a story follows its `after` stop (from the first new-words stops on); stories without one end the map
  const storyStop = s => ({ id: `story:${s.id}`, kind: 'story', story: s.id, label: s.cover, title: s.title, skill: `story:${s.id}`, group: 'little stories' });
  for (const s of STORIES.filter(s => s.after)) {
    const i = stops.findIndex(x => x.id === s.after); if (i < 0) continue;
    let j = i + 1; while (stops[j]?.kind === 'story') j++; stops.splice(j, 0, storyStop(s));
  }
  if (gpcLimit >= GPCS.length) for (const s of STORIES.filter(s => !s.after)) stops.push(storyStop(s));
  return stops;
}
export const STOPS = buildStops();

// Responses that count for a stop: apply stops read the blend responses tagged with their set.
export const stopResponses = (responses, stop) => stop.apply
  ? responses.filter(r => r.apply === stop.apply || r.skill === stop.skill).map(r => ({ ...r, skill: stop.skill })) : responses;
export function stopPassed(responses, stop, now = Date.now(), marked = passedStopIds(responses)) {
  return marked.has(stop.id) || stopPassedLive(responses, stop, now);
}
// Live rule (the skill evidence right now), used to *earn* a stop. Once earned, a marker keeps it passed (rc7).
export function stopPassedLive(responses, stop, now = Date.now()) {
  if (stop.kind === 'story') return responses.some(r => r.skill === stop.skill && r.correct && r.firstAttempt); // read it and got the picture right first time
  const ok = atLeast(skillState(stopResponses(responses, stop), stop.skill, now), 'secure');
  return stop.kind === 'words' ? ok && blendingUnlocked(responses, now) : ok;
}
// Map: passed (sage + star) / current (one, glowing) / upcoming (sand). Stops are passed strictly in order.
// rc7: a stop with a marker is always passed (the map never moves the child backwards); stops after the first
// unpassed one are upcoming even if they have markers (cannot happen through play: markers are earned in order).
export function mapState(responses, now = Date.now(), stops = STOPS) {
  let cur = -1; const marked = passedStopIds(responses);
  const out = stops.map((s, i) => {
    const passed = cur < 0 && stopPassed(responses, s, now, marked);
    if (!passed && cur < 0) cur = i;
    return { ...s, status: passed ? 'passed' : cur === i ? 'current' : 'upcoming' };
  });
  return { stops: out, current: cur < 0 ? null : out[cur], index: cur < 0 ? stops.length : cur, done: cur < 0 };
}
export const starCount = (responses, now) => mapState(responses, now).stops.filter(s => s.status === 'passed').length;

// rc7 high-water marks. Replays the log in time order and returns marker records for every stop that was passed at
// ANY moment (in map order), not only right now — so a sound that slips after its stop was passed (two misses in a
// review hunt drop it below 80 %) can no longer walk the map back. Also the migration for saved progress from rc1–rc6
// (no markers yet): the furthest stop ever reached is rebuilt from the saved response history.
//   since: only responses after this timestamp are new (the caller keeps a cursor; markers resume the replay).
export function progressMarkers(responses, { now = Date.now(), stops = STOPS, since = -Infinity } = {}) {
  const marked = passedStopIds(responses), out = [];
  let k = 0; while (k < stops.length && marked.has(stops[k].id)) k++;
  if (k >= stops.length) return out;
  const rs = responses.filter(r => !isMarker(r)).sort((a, b) => a.timestamp - b.timestamp);
  const lastMark = Math.max(-Infinity, ...responses.filter(isMarker).map(r => r.timestamp)), from = Math.max(since, lastMark);
  const pre = [...responses.filter(isMarker)];
  const mark = (stop, t) => { const m = { skill: MARKER + stop.id, itemId: stop.id, marker: true, correct: true, firstAttempt: true, scored: false, timestamp: t }; out.push(m); pre.push(m); };
  const relevant = (r, st) => r.skill === st.skill || (st.apply && r.apply === st.apply); // (a sound that unlocks blending later is caught by advance(now))
  const advance = t => { while (k < stops.length && stopPassedLive(pre, stops[k], t)) { mark(stops[k], t); k++; } };
  for (const r of rs) {
    pre.push(r);
    if (r.timestamp <= from || k >= stops.length || !relevant(r, stops[k])) continue;
    advance(r.timestamp);
  }
  advance(now);
  return out;
}
// A passed stop whose skill is not secure right now: due a quick review (parent view + session planner), never relocked.
export function slippedStops(responses, now = Date.now(), stops = STOPS) {
  const marked = passedStopIds(responses);
  return stops.filter(s => marked.has(s.id) && s.kind !== 'story' && !stopPassedLive(responses, s, now));
}

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
  m.stops.forEach((s, i) => { if (s.kind === 'words' && s.level && i <= m.index) lv = Math.max(lv, s.level); });
  return lv;
}
export const wordsUnlocked = (responses, now) => blendingUnlocked(responses, now);
// Untaught-sound check (R5 rule 3): only words whose every GPC is known (secure+) or currently being introduced.
export function servableWords(level, known) {
  return (WORDS[level] ?? []).filter(e => servable(e, known));
}
// Words for a "new words" stop: readable now (every sound known, a level already reached) and using >= 1 sound from
// the set; one entry per word, pictured words first.
export function applyWords(set, known, maxLevel = 6) {
  const seen = new Set(), out = [];
  for (const [lv, list] of Object.entries(WORDS)) if (+lv <= maxLevel && +lv !== 2) for (const e of list)
    if (!seen.has(e.w) && servable(e, known) && parseIds(e).some(id => GPC[id]?.set === set)) { seen.add(e.w); out.push(e); }
  return out.sort((a, b) => !!b.pic - !!a.pic);
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
    if (s.graduates && known.has(s.graduates)) continue; // its tricky part is taught now: read it with the slider instead
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
