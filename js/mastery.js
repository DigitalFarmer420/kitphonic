// Per-skill mastery, spaced review, anti-guessing scoring — literacy review R7. Pure functions over a response log
// (replayed chronologically, so state is deterministic), plus a tiny local-only store (spec §3.9: local saves only).
// Thresholds are conventions to tune in the playtest.
//
// Response: { skill, itemId, gpcs[], correct, firstAttempt, assisted, fast?, scored?, latencyMs, sweepMs, timestamp, sessionId }
// Skills:   sound:<gpc> | name:<letter> | blend:L1..L5 | star:<word> | spell:<pattern>
// States:   new -> practicing -> secure -> mastered -> review-due -> (lapsed -> practicing)
import { pacing as pacingFromSessions } from './core.js';
import { VOWEL_IDS } from './sequence.js';

export const DAY = 864e5;
export const REVIEW_DAYS = [1, 3, 7, 14, 30];
export const RULES = {
  secureAcc: 0.8, secureMin: 5, secureWindow: 10,
  masterAcc: 0.9, masterMinTrials: 5, masterMinTrialsBlend: 10, masterDays: 2,
  lapseMisses: 2, fastPickMs: 600, minSweepMsPerPhoneme: 250,
};
export const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }; // local calendar day
// Only first-attempt, unassisted, scored, non-fast responses count toward mastery.
export const counts = r => r.firstAttempt === true && !r.assisted && !r.fast && !r.modelled && r.scored !== false; // v2 V1: modelled reads never count
// Guess guards: a sweep faster than 250 ms per phoneme isn't scored; a pick < 600 ms after the blend is "fast".
export const guessGuard = ({ sweepMs, phonemes, pickLatencyMs }) => ({
  scored: sweepMs == null || sweepMs >= RULES.minSweepMsPerPhoneme * phonemes,
  fast: pickLatencyMs != null && pickLatencyMs < RULES.fastPickMs,
});
const minTrials = skill => (skill.startsWith('blend:') ? RULES.masterMinTrialsBlend : RULES.masterMinTrials);

export function skillState(responses, skill, now = Date.now()) {
  const rs = responses.filter(r => r.skill === skill).sort((a, b) => a.timestamp - b.timestamp);
  let phase = 'learning', sessions = new Map(), counted = [], masteredAt = null, step = 0, due = null, misses = 0, lapses = 0;
  for (const r of rs) {
    if (!counts(r)) continue;
    if (phase === 'learning') {
      counted.push(r);
      const s = sessions.get(r.sessionId) ?? { day: dayKey(r.timestamp), n: 0, ok: 0 }; s.n++; if (r.correct) s.ok++; sessions.set(r.sessionId, s);
      const qualDays = new Set([...sessions.values()].filter(s => s.n >= minTrials(skill) && s.ok / s.n >= RULES.masterAcc).map(s => s.day));
      if (qualDays.size >= RULES.masterDays) { phase = 'mastered'; masteredAt = r.timestamp; step = 0; due = masteredAt + REVIEW_DAYS[0] * DAY; misses = 0; }
    } else if (r.timestamp >= due) { // a review response
      if (r.correct) { misses = 0; step = Math.min(step + 1, REVIEW_DAYS.length - 1); due = r.timestamp + REVIEW_DAYS[step] * DAY; }
      else if (++misses >= RULES.lapseMisses) { phase = 'learning'; lapses++; sessions = new Map(); counted = []; masteredAt = null; due = null; misses = 0; }
    } // responses before the due date while mastered = extra practice, not scheduling
  }
  const recent = counted.slice(-RULES.secureWindow), acc = recent.length ? recent.filter(r => r.correct).length / recent.length : 0;
  const state = phase === 'mastered' ? (now >= due ? 'review-due' : 'mastered')
    : !counted.length ? (lapses ? 'practicing' : 'new')
    : recent.length >= RULES.secureMin && acc >= RULES.secureAcc ? 'secure' : 'practicing';
  return { skill, state, trials: counted.length, accuracy: acc, masteredAt, due, step, lapses };
}
const RANK = { new: 0, practicing: 1, secure: 2, mastered: 3, 'review-due': 3 };
export const atLeast = (st, level) => RANK[st.state] >= RANK[level];
export const skills = responses => [...new Set(responses.map(r => r.skill))];

// Blending unlock (spec §3.4.3): >= 4 sound:* skills secure or better, including >= 1 vowel.
export function blendingUnlocked(responses, now = Date.now()) {
  const ok = [...new Set([...skills(responses).filter(s => s.startsWith('sound:')).filter(s => atLeast(skillState(responses, s, now), 'secure')).map(s => s.slice(6)), ...markedSounds(responses)])];
  return ok.length >= 4 && ok.some(g => VOWEL_IDS.has(g));
}
// rc7: map progress high-water marks. When a map stop is passed, a marker record { skill: 'stop:<stop id>', marker: true }
// is logged (js/progress.js progressMarkers). A passed stop stays passed even if its skill later slips (spaced review
// handles the slip inside the next sessions); a passed sound stop also keeps its sound "taught".
export const MARKER = 'stop:';
export const isMarker = r => r?.marker === true || (typeof r?.skill === 'string' && r.skill.startsWith(MARKER));
export const passedStopIds = responses => new Set(responses.filter(isMarker).map(r => r.skill.slice(MARKER.length)));
const markedSounds = responses => [...passedStopIds(responses)].filter(id => id.startsWith('sound:')).map(id => id.slice(6));
// GPCs the child may be served (review R5 rule 3): sound:* at secure or better, or a sound stop already passed (rc7).
export const knownGpcs = (responses, now = Date.now()) =>
  new Set([...skills(responses).filter(s => s.startsWith('sound:') && atLeast(skillState(responses, s, now), 'secure')).map(s => s.slice(6)), ...markedSounds(responses)]);
// Tap-mode switch uses blend:L1 mastered.
export const blendL1Mastered = (responses, now = Date.now()) => atLeast(skillState(responses, 'blend:L1', now), 'mastered');
// Per-skill pacing: the spec's 90 / 60–89 / <60 rule over the last sessions of counted trials.
export function pacingFor(responses, skill) {
  const by = new Map();
  for (const r of responses.filter(r => r.skill === skill && counts(r)).sort((a, b) => a.timestamp - b.timestamp)) {
    const s = by.get(r.sessionId) ?? { correct: 0, total: 0 }; s.total++; if (r.correct) s.correct++; by.set(r.sessionId, s);
  }
  return pacingFromSessions([...by.values()]);
}
export const dueItems = (responses, now = Date.now()) =>
  skills(responses).map(s => skillState(responses, s, now)).filter(s => s.state === 'review-due').sort((a, b) => a.due - b.due);

// Local-only store (no network). storage: window.localStorage or any {getItem,setItem,removeItem}.
export function createStore(storage, key = 'kitphonic.v1.responses', cap = 5000) {
  const read = () => { try { return JSON.parse(storage?.getItem(key) || '[]'); } catch { return []; } };
  // the cap trims the oldest responses, never the map markers (progress must not roll back on a long-used device)
  const write = a => { if (a.length > cap) { let drop = a.length - cap; a = a.filter(r => isMarker(r) || drop-- <= 0); } storage?.setItem(key, JSON.stringify(a)); };
  return {
    all: read,
    log(r) { const a = read(); a.push({ timestamp: Date.now(), ...r }); write(a); return a.at(-1); },
    logMany(rs) { if (!rs.length) return; const a = read(); for (const r of rs) a.push({ timestamp: Date.now(), ...r }); write(a); },
    clear() { storage?.removeItem(key); },
  };
}
