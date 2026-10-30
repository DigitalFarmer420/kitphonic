// Kitphonic core logic (spec §3). Pure functions, no DOM, so it's unit-testable.
import { PROTOTYPE_SET, CONTINUOUS } from './sequence.js';
export const LETTERS = PROTOTYPE_SET;   // §3.3.1 / review R1: m s a t p i n o, from js/sequence.js
export const STRETCHY = CONTINUOUS;     // continuous sounds (held); stop sounds clipped — from js/sequence.js

// Tap mode: 'sound' (early Phase 2: letter + dot both play sound) or 'nameDot' (after L1 mastery).
export function tapResult(mode, target, letter) {
  if (target === 'dot') return { play: 'sound', letter };
  return { play: mode === 'nameDot' ? 'name' : 'sound', letter };
}

// Mastery (§3.7.1): ~90% across 2 separate sessions.
export function sessionScore(s) { return s.total ? s.correct / s.total : 0; }
export function isMastered(sessions, thr = 0.9) {
  const recent = sessions.slice(-2);
  return recent.length === 2 && recent.every(s => sessionScore(s) >= thr);
}
export function pacing(sessions) {
  const last = sessions.at(-1); if (!last) return 'practice';
  const sc = sessionScore(last);
  if (isMastered(sessions)) return 'advance';
  const two = sessions.slice(-2);
  if (two.length === 2 && two.every(s => sessionScore(s) < 0.6)) return 'stepBack';
  return 'practice';
}
// Switch to name+dot once L1 blending mastered; returns {mode, showDemo}.
export function updateTapMode(state) {
  if (state.mode === 'sound' && isMastered(state.l1Sessions || []))
    return { mode: 'nameDot', showDemo: !state.demoSeen };
  return { mode: state.mode, showDemo: false };
}

// Slider markers (§3.5.3, §3.7). level: 1..5.
// opts.l1: 'dots' (default, review R2: one dot per phoneme) | 'bar' (one-bar 'at', kept as a config option).
// opts.l4: 'dots' (default, §3.5.3 each blend consonant its own dot) | 'blendBar' (early L4: dot + dot + bar).
// Each marker carries `stretchy` (can be held while sliding slowly; clipped sounds never stretch).
const VOWELS = new Set(['a','e','i','o','u']);
export function markers(word, level, opts = {}) {
  const w = [...word.toLowerCase()];
  const mk = (type, a, b) => ({ type, text: w.slice(a, b).join(''), start: a, end: b, stretchy: STRETCHY.has(w[a]) });
  const dots = () => w.map((_, i) => mk('dot', i, i + 1));
  const v = w.findIndex(c => VOWELS.has(c));
  const onsetRime = () => { // consonant dots + one rime bar; no vowel -> fall back to dots
    if (v < 0) return dots();
    const out = []; for (let i = 0; i < v; i++) out.push(mk('dot', i, i + 1));
    out.push(mk('bar', v, w.length)); return out;
  };
  if (level === 1) return opts.l1 === 'bar' ? [mk('bar', 0, w.length)] : dots();
  if (level === 2) return onsetRime();
  if (level === 4 && opts.l4 === 'blendBar') return onsetRime();
  return dots(); // L3, L4 (each blend consonant its own dot), L5
}

// Trigger point (0..1 along the track) for each marker. Track spans the word's letters evenly, so a
// marker fires at the centre of its first letter: a bar ("at" in sat) fires as the handle enters it.
export function markerPositions(ms) {
  if (typeof ms === 'number') return Array.from({ length: ms }, (_, i) => (i + 0.5) / ms);
  const len = Math.max(...ms.map(m => m.end));
  return ms.map(m => (m.start + 0.5) / len);
}

// Sweep tracking (§3.5.3). createSweep(n | markers[], opts) -> { move(x, tMs?), lift(), reset(), complete, ... }
//  - left-to-right only counts; each marker plays once per sweep when first passed.
//  - backward motion replays a marker only when the handle crosses back over it (no spam on jitter).
//  - connect: true on a continuous sound following a continuous one (slow/normal): play joined, no gap (R3).
//  - speed-aware: pass a timestamp; play events get `stretch` 'long'|'normal'|'short' (stretchy markers only)
//    and `delayMs` (omitted when 0) so several markers passed in one fast move are spaced out instead of overlapping.
//  - lift() pauses; the next move continues from the same place (handle keeps its position).
//  - closure state: safe to destructure or pass move() as a callback.
export function createSweep(ms, opts = {}) {
  const pos = markerPositions(ms);
  const stretchy = typeof ms === 'number' ? pos.map(() => false) : ms.map(m => !!m.stretchy);
  const n = pos.length;
  const { endAt = 0.98, slowSpeed = 0.25, fastSpeed = 1.2, gapMs = 180, connectMs = 60, jitter = 0.01 } = opts; // speeds: track/s
  let max = 0, last = 0, lastT = null, fired = new Set(), done = false;
  const speedClass = v => v == null ? 'normal' : v <= slowSpeed ? 'long' : v >= fastSpeed ? 'short' : 'normal';
  const api = {
    move(x, t) {
      x = Math.max(0, Math.min(1, Number(x) || 0));
      const v = (t != null && lastT != null && t > lastT) ? Math.abs(x - last) / ((t - lastT) / 1000) : null;
      const events = [];
      if (x > max) {
        let k = 0, t = 0; const cls = speedClass(v);
        for (let i = 0; i < n; i++) {
          if (pos[i] <= x && !fired.has(i)) {
            fired.add(i);
            // R3 continuous blending: continuous -> continuous at slow/normal speed plays connected (held into the
            // next sound, no silence). Stop sounds and fast flings keep the gap.
            const connect = i > 0 && stretchy[i] && stretchy[i - 1] && cls !== 'short';
            if (k) t += connect ? connectMs : gapMs;
            const e = { marker: i, kind: 'play' }; if (t) e.delayMs = t; if (connect) e.connect = true; k++;
            if (stretchy[i]) e.stretch = cls;
            events.push(e);
          }
        }
        max = x;
        if (max >= endAt && fired.size === n && !done) { done = true; const b = { kind: 'blend' }; if (k) b.delayMs = t + gapMs; events.push(b); }
      } else if (x < last - jitter) {
        for (let i = n - 1; i >= 0; i--) if (pos[i] < last && pos[i] >= x) events.push({ marker: i, kind: 'replay' });
      }
      if (x > last || x < last - jitter) last = x;
      lastT = t ?? lastT;
      return events;
    },
    lift() { lastT = null; },
    reset() { max = 0; last = 0; lastT = null; fired = new Set(); done = false; },
    get complete() { return done; },
    get progress() { return max; },
    get position() { return last; },
    get lit() { return [...fired].sort((a, b) => a - b); },
    positions: pos,
  };
  return api;
}
// Within ~60pt vertical drift the drag stays attached (§3.5.3).
export const attached = (dy, tol = 60) => Math.abs(dy) <= tol;

// Reveal check (§3.5.2): pick from 2-3 pictures; wrong -> replay + shuffle, never fail.
export function revealCheck(answer, picked) {
  return answer === picked ? { reveal: true, say: answer } : { reveal: false, say: "Let's slide it again", replay: true, shuffle: true };
}
