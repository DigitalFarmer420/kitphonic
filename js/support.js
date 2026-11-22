// Blend-slider fade-out (v2 V2): a four-step support ladder per child, per word pattern, plus per-word / in-session
// adjustments. Pure: replayed from the response log like skillState (js/mastery.js), so it is deterministic.
// D (Vinh + Education Researcher, 2026-11-21): once a pattern has finished its modelled phase, a miss raises
// standing support only to S3 (you blend) plus the hand demo — never back to the 6-sweep S4 model. After two
// S3 misses on the same word in a session, one brief in-trial re-model (unscored, does not change tomorrow's
// starting support), then the word again at S3 (that try counts). A further miss drops the word for later.
//   S4 model     — each sound while sweeping, then the whole word, then the check (modelled: not scored)
//   S3 you blend — each sound while sweeping, no whole word; check first, the word plays after the pick
//   S2 you sound — the dots light in turn with NO audio; tapping a dot plays its sound (a hint)
//   S1 read it   — no slider: the word appears and the check starts; 🔊 help brings the slider back at S2 (a hint)
// Speed is used only to step DOWN (S2 -> S1, median pick time); support is never added back because of speed.
import { counts, dayKey, DAY } from './mastery.js';

export const S = { MODEL: 4, BLEND: 3, DOTS: 2, READ: 1 };
export const SUPPORT_RULES = {
  modelSweeps: 6,          // S4 -> S3: >= 6 modelled sweeps of the pattern, none flagged as a fling
  window: 10, downAcc: 0.9, minScored: 10, minDays: 2,
  maxReplays: 1,           // S3 -> S2: <= 1 replay per 10 items
  maxDotTapRate: 0.2,      // S2 -> S1: dot taps on <= 20% of items
  maxMedianPickMs: 4000,   // S2 -> S1: median time from the last dot lighting to the pick
  upAcc: 0.7,              // < 70% over the last 10 at the current level -> one level more support
  helpOveruse: 0.3,        // S1: help on > 30% of the last 10 items -> back to S2
  breakDays: 14, breakItems: 3, // after a >= 14-day break the first 3 items get one level more support
  newSoundEncounters: 2,   // a word with a GPC introduced this session or the last is served at S2 at most, twice
};
// Word patterns (one ladder each). Level 2 and 3 share CVC. Map order: the "previous pattern" for the start rule.
const PATTERN_OF_LEVEL = { 1: 'VC', 2: 'CVC', 3: 'CVC', 4: 'CCVC', 5: 'CVCC', 7: 'suffix', 6: 'digraph' };
export const PATTERNS = ['VC', 'CVC', 'CCVC', 'CVCC', 'suffix', 'digraph'];
export const supportPattern = entry => PATTERN_OF_LEVEL[entry?.level] ?? 'CVC';

const byTime = rs => [...rs].sort((a, b) => a.timestamp - b.timestamp);
const median = xs => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : Infinity; };
// a clean decoding trial at this level: first attempt, unassisted, not modelled / fast / flung, no dot taps, no help
const clean = r => counts(r) && !r.helpUsed && !(r.dotTaps > 0);
const firstTry = r => r.firstAttempt === true && !r.modelled && r.scored !== false && !r.fast;
const supportRs = (responses, pattern) => byTime(responses.filter(r => r.pattern === pattern && r.support));

// The pattern's base level (persisted across sessions). Returns { level, best, history: [{ level, at, why }] }.
export function patternSupport(responses, pattern, now = Date.now(), memo = new Map()) {
  if (memo.has(pattern)) return memo.get(pattern);
  const R = SUPPORT_RULES, i = PATTERNS.indexOf(pattern);
  // start: L1 (the first-ever blending) at S4; a new pattern at S3 if the previous pattern reached S2 or better
  const prev = i > 0 ? patternSupport(responses, PATTERNS[i - 1], now, memo) : null;
  let level = prev && prev.best <= S.DOTS ? S.BLEND : S.MODEL, best = level, since = [];
  const history = [{ level, at: null, why: 'start' }];
  const move = (to, at, why) => { level = Math.max(S.READ, Math.min(S.MODEL, to)); best = Math.min(best, level); since = []; history.push({ level, at, why }); };
  for (const r of supportRs(responses, pattern)) {
    if (r.briefModel) continue; // D: a brief in-trial re-model never moves standing support
    if (r.support !== level) continue; // items served at a temporary level (misses, breaks, new sounds) don't move the base
    since.push(r);
    const t = r.timestamp;
    if (level === S.MODEL) {
      const sweeps = since.filter(x => x.modelled && !x.fling && !x.briefModel);
      if (sweeps.length >= R.modelSweeps) move(S.BLEND, t, 'modelled sweeps');
      continue;
    }
    // stepping back up (accuracy / help only — never speed)
    // D: a finished pattern stays at S3 with guided help; never re-enter the 6 modelled sweeps (< 70% is
    // Combined Spec §3.7.1 "more practice". A valid < 60% sample still uses the one-session step-back A).
    const tries = since.filter(firstTry).slice(-R.window);
    if (tries.length >= R.window && tries.filter(x => x.correct).length / tries.length < R.upAcc) {
      const cap = best <= S.BLEND ? S.BLEND : S.MODEL;
      move(Math.min(level + 1, cap), t, 'accuracy < 70%'); continue;
    }
    if (level === S.READ) {
      const last = since.slice(-R.window);
      if (last.length >= R.window && last.filter(x => x.helpUsed).length / last.length > R.helpOveruse) move(S.DOTS, t, 'help overuse');
      continue;
    }
    // stepping down: >= 90% of the last 10 clean trials, >= 10 scored at this level, on >= 2 different days
    const ok = since.filter(clean), last = ok.slice(-R.window);
    if (ok.length < R.minScored || last.filter(x => x.correct).length / last.length < R.downAcc) continue;
    if (new Set(last.map(x => dayKey(x.timestamp))).size < R.minDays) continue; // two sessions on one day don't advance
    const recent = since.slice(-R.window);
    if (level === S.BLEND && recent.reduce((n, x) => n + (x.hints ?? 0), 0) <= R.maxReplays) move(S.DOTS, t, 'secure at S3');
    else if (level === S.DOTS && recent.filter(x => x.dotTaps > 0).length / recent.length <= R.maxDotTapRate
      && median(last.map(x => x.latencyFromLastDotMs ?? Infinity)) <= R.maxMedianPickMs) move(S.READ, t, 'secure at S2');
  }
  const out = { pattern, level, best, history };
  memo.set(pattern, out); return out;
}

// GPCs whose sound was first practised in this session or the previous one.
function newGpcs(responses, sessionId) {
  const order = [...new Map(byTime(responses).map(r => [r.sessionId, r.timestamp])).keys()];
  const cur = sessionId ?? order.at(-1), i = order.indexOf(cur), recent = new Set([cur, i > 0 ? order[i - 1] : cur]);
  const first = new Map(); for (const r of byTime(responses)) if (r.skill?.startsWith('sound:') && !first.has(r.skill)) first.set(r.skill, r.sessionId);
  return new Set([...first].filter(([, s]) => recent.has(s)).map(([k]) => k.slice(6)));
}

// A pattern has finished its modelled phase once it has ever left S4 (best <= S3).
export const modelledPhaseDone = state => state.best <= S.BLEND;

// In-session correction (D + Education Researcher). After two S3 misses on this word in this session, one brief
// re-model (unscored). Then the word again at S3 (counts). A miss on that try means drop it for later. Only one
// brief re-model per word per session — it never restarts the 6-sweep modelled phase or changes tomorrow's base.
export function sessionCorrection(responses, entry, sessionId) {
  const mine = byTime(responses.filter(r => r.sessionId === sessionId && r.itemId === entry.w && r.support && r.firstAttempt));
  const s3miss = mine.filter(r => !r.correct && !r.modelled && !r.briefModel && r.support === S.BLEND);
  const brief = mine.filter(r => r.briefModel);
  if (s3miss.length >= 2 && !brief.length) return { briefModel: true, defer: false };
  const lastBrief = brief.at(-1);
  if (lastBrief) {
    const after = mine.filter(r => r.timestamp > lastBrief.timestamp && !r.modelled && !r.briefModel);
    if (after.some(r => !r.correct)) return { briefModel: false, defer: true };
  }
  return { briefModel: false, defer: false };
}

// The level to serve one word at, now. { level, base, pattern, why[], guided, briefModel, defer }
export function supportFor(responses, entry, { sessionId = null, now = Date.now() } = {}) {
  const R = SUPPORT_RULES, pattern = supportPattern(entry), ps = patternSupport(responses, pattern, now);
  const done = modelledPhaseDone(ps), cap = done ? S.BLEND : S.MODEL;
  let level = ps.level; const why = [];
  const bump = (to, reason) => { if (to > level) { level = Math.min(to, cap); why.push(reason); } };
  // 1. in-session: after 2 misses in a row at this pattern, one level more support until 2 correct in a row
  // C: reads Kit modelled (S4) are neither misses nor hits here — a miss on a modelled word never drops support back
  // D: a brief re-model is also ignored here (it is not a standing-support miss or hit)
  const sess = byTime(responses.filter(r => r.sessionId === sessionId && r.pattern === pattern && r.support && r.firstAttempt && !r.modelled && !r.briefModel));
  let miss = 0, hit = 0, up = false;
  for (const r of sess) { if (r.correct) { hit++; miss = 0; if (hit >= 2) up = false; } else { miss++; hit = 0; if (miss >= 2) up = true; } }
  if (up) bump(ps.level + 1, '2 misses in a row');
  // 2. a missed word: its next appearance is one level more supported, until it is read correctly on a later day
  const mine = byTime(responses.filter(r => r.itemId === entry.w && r.support && r.firstAttempt));
  const lastMiss = mine.filter(r => !r.correct && !r.modelled && !r.briefModel).at(-1); // C/D: modelled / brief-model misses are not 'missed last time'
  if (lastMiss && !mine.some(r => r.correct && !r.modelled && !r.briefModel && r.timestamp > lastMiss.timestamp && dayKey(r.timestamp) !== dayKey(lastMiss.timestamp)))
    bump(lastMiss.support + 1, 'missed last time');
  // 3. after a long break: the first 3 items of the session get one level more support
  const before = byTime(responses.filter(r => r.sessionId !== sessionId)).at(-1), inSession = responses.filter(r => r.sessionId === sessionId && r.support).length;
  if (before && now - before.timestamp >= R.breakDays * DAY && inSession < R.breakItems) bump(ps.level + 1, `${R.breakDays}+ day break`);
  // 4. a word with a just-introduced sound: at most S2 (silent dots) for its first 2 encounters
  const fresh = newGpcs(responses, sessionId), ids = entry.parse?.split(' ') ?? [];
  if (ids.some(g => fresh.has(g)) && mine.filter(r => !r.briefModel).length < R.newSoundEncounters) bump(S.DOTS, 'new sound');
  // C: after a modelled miss the next presentation is guided (the hand demo at once), then independent
  // D: once the modelled phase is done, a miss also raises only to S3 plus the hand demo (never a full model)
  const last = mine.at(-1);
  let guided = !!(last?.modelled && !last.correct && !last.briefModel);
  if (done && Math.min(cap, level) === S.BLEND && (why.includes('missed last time') || why.includes('2 misses in a row')))
    guided = true;
  const corr = sessionCorrection(responses, entry, sessionId);
  return { level: Math.min(cap, level), base: ps.level, pattern, why, guided, briefModel: corr.briefModel, defer: corr.defer };
}
