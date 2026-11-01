// Grown-ups view data (spec §3.8.4): a plain summary of the local response log. Pure, so it is testable.
import { errorPatterns } from './patterns.js';
import { skillState, skills, DAY, blendL1Mastered } from './mastery.js';
import { mapState, servableWords, slippedStops } from './progress.js';
import { GPC } from './sequence.js';
import { STAR_WORDS, LETTER_PICS, WORDS } from './content.js';

const STATE_LABEL = { new: 'not yet', practicing: 'practicing', secure: 'secure', mastered: 'mastered', 'review-due': 'review due' };
export { STATE_LABEL };
export function parentSummary(responses, now = Date.now()) {
  const map = mapState(responses, now), all = skills(responses);
  // rc7: a passed sound that slipped below secure shows as "review due" here (never on the child's map)
  const slipped = new Set(slippedStops(responses, now).map(s => s.skill));
  const of = prefix => all.filter(s => s.startsWith(prefix)).map(s => { const st = { id: s.slice(prefix.length), ...skillState(responses, s, now) }; return slipped.has(s) && st.state !== 'review-due' ? { ...st, state: 'review-due', slipped: true, due: st.due ?? now } : st; });
  const sounds = of('sound:'), stars = of('star:'), blends = of('blend:');
  const sessions = new Map();
  for (const r of responses) { if (!r.sessionId) continue; const s = sessions.get(r.sessionId) ?? { a: r.timestamp, b: r.timestamp }; s.a = Math.min(s.a, r.timestamp); s.b = Math.max(s.b, r.timestamp); sessions.set(r.sessionId, s); }
  const week = [...sessions.values()].filter(s => s.b >= now - 7 * DAY);
  // v2 V1: words the child read on their own (scored, Kit did not say them first) vs words read with Kit's model
  const wordsOwn = new Set(responses.filter(r => r.skill?.startsWith('blend:') && r.correct && !r.modelled && r.scored !== false).map(r => r.itemId));
  const wordsRead = wordsOwn.size, wordsWithKit = new Set(responses.filter(r => r.skill?.startsWith('blend:') && r.correct && !wordsOwn.has(r.itemId)).map(r => r.itemId)).size;
  const cur = map.stops[map.index];
  return {
    stop: cur ? { label: cur.label, index: map.index + 1, of: map.stops.length } : { label: 'all done', index: map.stops.length, of: map.stops.length },
    sounds, stars, blends, wordsRead, wordsWithKit,
    sentences: new Set(responses.filter(r => r.skill?.startsWith('sentence:')).map(r => r.itemId)).size,
    sessionsThisWeek: week.length,
    minutesThisWeek: Math.round(week.reduce((t, s) => t + (s.b - s.a), 0) / 6e4),
    // design/parent-mockup: summary card + tiles
    current: cur ? describe(cur) : null, next: map.stops[map.index + 1] ? describe(map.stops[map.index + 1]) : null,
    soundTiles: map.stops.filter(x => x.kind === 'sound').map(x => ({ id: x.gpc, text: GPC[x.gpc].grapheme, ex: x.group?.split(' as in ')[1], state: slipped.has(`sound:${x.gpc}`) ? 'review-due' : tileState(responses, `sound:${x.gpc}`, now) })), // ex: 'is' / 'thin' / 'that' tells same-looking tiles apart
    starTiles: STAR_WORDS.slice(0, Math.max(3, stars.length)).map(x => ({ id: x.w, text: x.w, state: tileState(responses, `star:${x.w}`, now) })),
    tryAtHome: tryAtHome(sounds, cur),
    // spec §3.4.1: the parent view shows which tap mode the child is in; §3.8.4: trouble spots
    letterMode: blendL1Mastered(responses, now) ? 'names' : 'sounds',
    troubleSpots: troubleSpots(responses, now),
    needsPractice: [...sounds, ...stars, ...blends].filter(s => s.state === 'review-due' || (s.state === 'practicing' && s.trials >= 3 && s.accuracy < 0.6)).map(s => s.skill),
  };
}

const tileState = (responses, skill, now) => { const st = skillState(responses, skill, now); return st.trials || st.state !== 'new' ? st.state : 'new'; };
const wordsLike = level => (WORDS[level] ?? []).slice(0, 2).map(e => `“${e.w}”`).join(', ');
export function describe(stop) {
  if (stop.kind === 'story') return { kind: 'story', label: stop.label, learning: `reading the story “${stop.title}”`, next: `the story “${stop.title}”` };
  if (stop.apply) return { kind: 'words', label: stop.label, learning: `reading words with the set ${stop.apply} sounds`, next: `new words with the set ${stop.apply} sounds` };
  if (stop.kind === 'words') return { kind: 'words', label: stop.label, learning: `reading words like ${wordsLike(stop.level)}`, next: `blending words like ${wordsLike(stop.level)}` };
  const g = GPC[stop.gpc]; return { kind: 'sound', label: g.grapheme, learning: `learning “${g.grapheme}”`, next: `the new sound “${g.grapheme}”` };
}
// One tip from the sound Kit works on next. Wording: 'review' only for a sound that is due for review; new or
// practicing sounds get 'practice' (Uiux copy fix) (review due first, then the weakest practicing one, then the current sound).
export function tryAtHome(sounds, cur) {
  const pick = sounds.filter(x => x.state === 'review-due').sort((a, b) => a.due - b.due)[0]
    ?? sounds.filter(x => x.state === 'practicing').sort((a, b) => a.accuracy - b.accuracy)[0]
    ?? (cur?.kind === 'sound' ? { id: cur.gpc } : null);
  if (!pick) return null;
  const g = GPC[pick.id], ex = (LETTER_PICS[pick.id] ?? []).slice(0, 2).map(([w]) => `“${w}”`);
  const where = g.grapheme.length > 1 || pick.id === 'x' || pick.id === 'ck' || pick.id === 'nk' || pick.id === 'ng' ? 'have' : 'start with';
  return { id: pick.id, grapheme: g.grapheme, text: `point to things that ${where} /${g.grapheme}/${ex.length ? `, like ${ex.join(' and ')}` : ''}. Kit will ${pick.state === 'review-due' ? 'review' : 'practice'} ${g.grapheme} next session.` };
}

// Spec §3.7.1 / §3.8.4 error patterns, last 14 days, first attempts only: letter mix-ups (b/d …) from letter games
// (>= 2 of the same pair), and word misses by contrast position (>= 3: short vowels, last sound, first sound).
const CONTRAST_TEXT = { vowel: 'short vowel sounds (like pin / pan)', final: 'the last sound in a word', onset: 'the first sound in a word' };
export function troubleSpots(responses, now = Date.now()) {
  const { pairs, contrasts } = errorPatterns(responses, now), gr = id => GPC[id]?.grapheme ?? id;
  return [...pairs.map(p => `mixes up ${[gr(p.a), gr(p.b)].sort().join(' and ')}`), ...contrasts.map(c => `practising ${CONTRAST_TEXT[c.pos] ?? c.pos}`)].slice(0, 3);
}
