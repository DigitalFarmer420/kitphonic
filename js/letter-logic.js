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
  const out = [], distinct = new Set(items).size; let bag = [], guard = 0;
  while (out.length < rounds && items.length && guard++ < rounds * 20) {
    if (!bag.length) bag = shuffle(items, rand);
    const t = bag.pop(); if (t !== out.at(-1) || distinct === 1) out.push(t);
  }
  while (out.length < rounds && items.length) out.push(items[out.length % items.length]); // (unreachable in practice)
  return out;
}

// Balanced grid (Uiux): rows as even as possible, never a lone tile (4 -> 2x2, 5 -> 3+2, 6 -> 3+3).
export function gridRows(n, maxPerRow) {
  if (n <= maxPerRow) return [n];
  const rows = Math.ceil(n / maxPerRow), base = Math.floor(n / rows), extra = n % rows;
  return Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
}
// Static layout (R14): centred, balanced rows, up to `perRow` per row.
export function staticLayout(n, { w, top, perRow = w < 700 ? 3 : 6, cellW = 150, cellH = 210 }) {
  const rows = gridRows(n, perRow), out = [];
  rows.forEach((inRow, r) => { for (let c = 0; c < inRow; c++) out.push({ x: w / 2 + (c - (inRow - 1) / 2) * cellW, y: top + r * cellH + cellH / 2 }); });
  return out;
}

// Floating letters (§3.3.3): 20–40 pt/s, never off-screen, never overlapping, tapped letter pauses, 3–6 on screen.
// box: centre bounds; opts.half = [halfW, halfH] of a tile; tiles keep >= 2*half + pad apart (Uiux r2: no overlap).
export const FLOAT = { minSpeed: 20, maxSpeed: 40, hitRadius: 80, pauseMs: 1200, half: 60, pad: 8 };
export function floatInit(letters, { box, rand = Math.random, half = [FLOAT.half, FLOAT.half] }) {
  const w = box.right - box.left, h = box.bottom - box.top, cw = 2 * half[0] + FLOAT.pad, ch = 2 * half[1] + FLOAT.pad;
  const maxRows = Math.max(1, Math.floor((h - 2 * half[1]) / ch) + 1), maxPer = Math.max(1, Math.floor(w / cw));
  let perRow = Math.min(letters.length, maxPer);
  while (gridRows(letters.length, perRow).length > maxRows && perRow < letters.length) perRow++;
  const rows = gridRows(letters.length, perRow), cellW = w / perRow, cellH = rows.length > 1 ? Math.min(ch * 1.4, (h - 2 * half[1]) / (rows.length - 1)) : 0;
  const y0 = box.top + half[1] + Math.max(0, (h - 2 * half[1] - cellH * (rows.length - 1)) / 2);
  const out = []; let i = 0;
  rows.forEach((inRow, r) => { for (let c = 0; c < inRow; c++, i++) {
    const a = rand() * Math.PI * 2, sp = FLOAT.minSpeed + rand() * (FLOAT.maxSpeed - FLOAT.minSpeed);
    out.push({ l: letters[i], x: box.left + w / 2 + (c - (inRow - 1) / 2) * cellW, y: y0 + r * cellH, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, pausedUntil: 0, half });
  } });
  return out;
}
export function floatStep(items, dtMs, box, now = 0) {
  const dt = dtMs / 1000;
  for (const it of items) {
    const [hw, hh] = it.half ?? [FLOAT.half, FLOAT.half];
    if (now < it.pausedUntil) continue;
    it.x += it.vx * dt; it.y += it.vy * dt;
    if (it.x < box.left + hw) { it.x = box.left + hw; it.vx = Math.abs(it.vx); }
    if (it.x > box.right - hw) { it.x = box.right - hw; it.vx = -Math.abs(it.vx); }
    if (it.y < box.top + hh) { it.y = box.top + hh; it.vy = Math.abs(it.vy); }
    if (it.y > box.bottom - hh) { it.y = box.bottom - hh; it.vy = -Math.abs(it.vy); }
  }
  separate(items, box);
  return items;
}
// Push overlapping tiles apart along the axis of least overlap and bounce them (elastic swap on that axis).
export function separate(items, box) {
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j], [hw, hh] = a.half ?? [FLOAT.half, FLOAT.half];
    const dx = b.x - a.x, dy = b.y - a.y, ox = 2 * hw + FLOAT.pad - Math.abs(dx), oy = 2 * hh + FLOAT.pad - Math.abs(dy);
    if (ox <= 0 || oy <= 0) continue;
    const pa = a.pausedUntil > 0 ? 0 : 1, pb = 1; // (paused tiles still move a little if squeezed)
    if (ox < oy) { const s = Math.sign(dx) || 1; a.x -= s * ox / 2; b.x += s * ox / 2; if (s * (b.vx - a.vx) < 0) [a.vx, b.vx] = [b.vx, a.vx]; }
    else { const s = Math.sign(dy) || 1; a.y -= s * oy / 2; b.y += s * oy / 2; if (s * (b.vy - a.vy) < 0) [a.vy, b.vy] = [b.vy, a.vy]; }
    for (const it of [a, b]) { const [w2, h2] = it.half ?? [FLOAT.half, FLOAT.half];
      it.x = Math.max(box.left + w2, Math.min(box.right - w2, it.x)); it.y = Math.max(box.top + h2, Math.min(box.bottom - h2, it.y)); }
    void pa; void pb;
  }
}
export const overlapping = items => items.some((a, i) => items.slice(i + 1).some(b => {
  const [hw, hh] = a.half ?? [FLOAT.half, FLOAT.half]; return Math.abs(a.x - b.x) < 2 * hw && Math.abs(a.y - b.y) < 2 * hh; }));
// Nearest letter whose centre is within ~80 pt of the tap (§3.3.3).
export function hitTest(items, x, y, radius = FLOAT.hitRadius) {
  let best = null, bd = Infinity;
  for (const it of items) { const d = Math.hypot(it.x - x, it.y - y); if (d <= radius && d < bd) { best = it; bd = d; } }
  return best;
}
// Phase-appropriate tap mode for letter activities.
// Floating Letters defaults to sound-first (spec: early lessons tap = sound only); floatMode 'name' is a config option.
export function letterTapMode(activity, { blendL1Mastered = false, override, floatMode = 'sound' } = {}) {
  if (activity === 'float') return floatMode;
  if (ACTIVITIES[activity]?.phase === 1) return 'name';
  return override || (blendL1Mastered ? 'nameDot' : 'sound');
}
