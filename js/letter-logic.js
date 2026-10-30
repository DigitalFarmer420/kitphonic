// Phase 1–2 letter activities (spec §3.3, §3.4): pure helpers for rounds, floating motion and hit testing.
import { CONFUSABLE_PAIRS } from './sequence.js';
import { clipForTap, shuffle } from './word-logic.js';

export const ACTIVITIES = {
  float:    { phase: 1, scored: false, drift: true,  dots: false, title: 'Floating Letters' }, // free exploration
  find:     { phase: 1, scored: 'name',  drift: false, dots: false, title: 'Find the Letter' },
  soundTap: { phase: 2, scored: false, drift: false, dots: true,  title: 'Sound Tap' },
  hunt:     { phase: 2, scored: 'sound', drift: false, dots: true,  title: 'Sound Hunt' },
}; // assessed tasks use a static layout (review R14); drift only in free exploration

// Letter-tap clip for an activity. Phase 1 activities always use 'name' mode (no dots).
export const letterClip = (mode, target, letter) => clipForTap(mode, target, letter);
const confusable = (a, b) => CONFUSABLE_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

// Letters on screen for one round: the target plus distractors from the pool, never two look-alikes together
// (spec §3.3.1), 3–6 letters total.
export function roundLetters(target, pool, { n = 4, rand = Math.random } = {}) {
  n = Math.max(3, Math.min(6, n));
  const out = [target];
  for (const l of shuffle(pool.filter(l => l !== target), rand)) {
    if (out.length >= Math.min(n, pool.length)) break;
    if (out.some(o => confusable(o, l))) continue;
    out.push(l);
  }
  return shuffle(out, rand);
}
// Targets for a run of rounds: cycles through the items, no immediate repeats.
export function roundTargets(items, rounds, rand = Math.random) {
  const out = []; let bag = [];
  while (out.length < rounds && items.length) {
    if (!bag.length) bag = shuffle(items, rand);
    const t = bag.pop(); if (t !== out.at(-1) || items.length === 1) out.push(t);
  }
  return out;
}

// Static layout (R14): centred rows, cell ~140 wide, up to `perRow` per row.
export function staticLayout(n, { w, top, perRow = w < 700 ? 3 : 6, cellW = 150, cellH = 210 }) {
  const rows = Math.ceil(n / perRow);
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / perRow), inRow = Math.min(perRow, n - r * perRow), c = i - r * perRow;
    return { x: w / 2 + (c - (inRow - 1) / 2) * cellW, y: top + r * cellH + cellH / 2 - (rows > 1 ? 0 : 0) };
  });
}

// Floating letters (§3.3.3): 20–40 pt/s, never off-screen, tapped letter pauses, 3–6 on screen.
export const FLOAT = { minSpeed: 20, maxSpeed: 40, hitRadius: 80, pauseMs: 1200, half: 60 };
export function floatInit(letters, { box, rand = Math.random }) {
  const pos = staticLayout(letters.length, { w: box.right - box.left, top: box.top, perRow: Math.min(3, letters.length) });
  return letters.map((l, i) => {
    const a = rand() * Math.PI * 2, sp = FLOAT.minSpeed + rand() * (FLOAT.maxSpeed - FLOAT.minSpeed);
    return { l, x: box.left + pos[i].x, y: pos[i].y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, pausedUntil: 0 };
  });
}
export function floatStep(items, dtMs, box, now = 0) {
  const dt = dtMs / 1000, h = FLOAT.half;
  for (const it of items) {
    if (now < it.pausedUntil) continue;
    it.x += it.vx * dt; it.y += it.vy * dt;
    if (it.x < box.left + h) { it.x = box.left + h; it.vx = Math.abs(it.vx); }
    if (it.x > box.right - h) { it.x = box.right - h; it.vx = -Math.abs(it.vx); }
    if (it.y < box.top + h) { it.y = box.top + h; it.vy = Math.abs(it.vy); }
    if (it.y > box.bottom - h) { it.y = box.bottom - h; it.vy = -Math.abs(it.vy); }
  }
  return items;
}
// Nearest letter whose centre is within ~80 pt of the tap (§3.3.3).
export function hitTest(items, x, y, radius = FLOAT.hitRadius) {
  let best = null, bd = Infinity;
  for (const it of items) { const d = Math.hypot(it.x - x, it.y - y); if (d <= radius && d < bd) { best = it; bd = d; } }
  return best;
}
// Phase-appropriate tap mode for letter activities.
export function letterTapMode(activity, { blendL1Mastered = false, override } = {}) {
  if (ACTIVITIES[activity]?.phase === 1) return 'name';
  return override || (blendL1Mastered ? 'nameDot' : 'sound');
}
