// Letter tracing (design/letters-board 1c), pure + unit-tested. Letters live in a 100 x 180 box (ascender 10,
// x-height 60, baseline 130, descender 170). Each letter = ordered strokes; each stroke = polyline (formation order).
// The tracer follows the finger along the current stroke: progress only moves forward, within a window ahead, while
// the finger stays within `tol` of the path (a wide, forgiving lane). Off the path, ink pauses (never erases).
const arc = (cx, cy, r, a0, a1, step = 12) => { // degrees, screen coords (y down); a0 -> a1 in either direction
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step)), out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
};
const line = (...pts) => pts;
const join = (...parts) => parts.flat();
export const STROKES = {
  o: [arc(50, 95, 34, -60, -420)],                                     // start ~1 o'clock, anticlockwise all round
  a: [join(arc(48, 95, 33, -40, -400), line([80, 62], [80, 130]))],     // around, up, down
  c: [arc(52, 95, 34, -45, -315)],
  s: [join(arc(50, 78, 18, -20, -270), arc(50, 113, 18, -90, 150))],    // top curve left, swing right, back left
  t: [line([45, 28], [45, 118], [52, 128], [66, 128]), line([24, 62], [70, 62])],
  i: [line([50, 62], [50, 130]), line([50, 34], [50, 40])],             // down, then the dot
  p: [line([28, 60], [28, 170]), line([28, 72], [46, 62], [64, 66], [76, 84], [76, 106], [64, 124], [46, 128], [28, 120])],
  n: [line([28, 60], [28, 130], [28, 84], [38, 68], [52, 62], [66, 68], [74, 82], [74, 130])],
  m: [line([14, 60], [14, 130], [14, 82], [22, 67], [34, 62], [46, 70], [50, 84], [50, 130], [50, 84], [58, 67], [70, 62], [82, 70], [86, 84], [86, 130])],
  d: [join(arc(46, 95, 32, -30, -390), line([78, 10], [78, 130]))],
};
export const hasStrokes = l => !!STROKES[l];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function resample(poly, step = 2) {
  const out = [poly[0]];
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], d = dist(a, b), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}
export const pathD = poly => poly.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

// opts: tol (letter units; lane is ~2*tol wide), ahead (how far ahead progress may jump, units), startTol.
export function createTracer(letter, { tol = 16, ahead = 24, startTol = 20 } = {}) {
  const strokes = (STROKES[letter] ?? []).map(s => resample(s));
  let si = 0, k = 0, active = false, onPath = true;
  const step = 2, win = Math.ceil(ahead / step);
  const state = () => ({ stroke: si, strokes: strokes.length, k, n: strokes[si]?.length ?? 0, onPath, active,
    progress: strokes[si] ? k / (strokes[si].length - 1) : 1, done: si >= strokes.length, letterDone: si >= strokes.length });
  return {
    strokes, state,
    down(x, y) {
      if (si >= strokes.length) return state();
      const P = strokes[si];
      // start at the green dot (or resume where the ink paused)
      active = dist([x, y], P[k]) <= (k === 0 ? startTol : tol); onPath = active; return state();
    },
    move(x, y) {
      if (!active || si >= strokes.length) return state();
      const P = strokes[si]; let best = -1, bd = Infinity;
      for (let j = k; j < Math.min(P.length, k + win + 1); j++) { const d = dist([x, y], P[j]); if (d <= tol && (d < bd || j > best && d <= tol * 0.75)) { best = j; bd = d; } }
      if (best >= 0) { onPath = true; k = Math.max(k, best); } else onPath = dist([x, y], P[k]) <= tol;
      const ev = state();
      if (k >= P.length - 2) { si++; k = 0; active = false; return { ...state(), strokeDone: true, letterDone: si >= strokes.length }; }
      return ev;
    },
    up() { active = false; return state(); },
    undo() { if (k > 0) k = 0; else if (si > 0) { si--; k = 0; } active = false; return state(); },
    reset() { si = 0; k = 0; active = false; onPath = true; return state(); },
  };
}

// Bounding box of a letter's strokes (+ pad for the lane), for a viewBox that fills the trace card.
export function letterBox(letter, pad = 16) {
  const pts = (STROKES[letter] ?? []).flat(); if (!pts.length) return { x: 0, y: 0, w: 100, h: 180 };
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad, w = Math.max(...xs) + pad - x, h = Math.max(...ys) + pad - y;
  const minW = h * 0.6, cx = x + w / 2; // never narrower than 0.6:1 (keeps i / t comfortable)
  return w < minW ? { x: cx - minW / 2, y, w: minW, h } : { x, y, w, h };
}
