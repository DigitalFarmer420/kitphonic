// Learning-map geometry (pure, unit-tested). A window of up to 6 stops around the current one, winding bottom->top
// in portrait and left->right in landscape, clear of the top bar and the big ▶ button (thumb zone, bottom centre).
export const STOP_R = 38, NOW_R = 52, WINDOW = 6, TEASERS = [
  { id: 'future:stories', kind: 'future', label: '📖', group: 'little stories', status: 'upcoming' },
];
export const GO = { w: 200, h: 72, bottom: 22 };
export const groupOf = s => s.group ?? (s.kind === 'words' ? (s.level === 6 ? 'sh · ch · th' : s.level === 5 ? 'end blends' : s.level >= 4 ? 'blends' : 'blend words') : s.kind === 'sound' ? 'sounds' : '');

// stops: mapState().stops; index: current index. Returns the visible window (with teasers appended near the end).
export function mapWindow(stops, index, size = WINDOW) {
  const all = [...stops, ...TEASERS], cur = Math.min(index, stops.length - 1);
  let start = Math.max(0, cur - 2); start = Math.min(start, Math.max(0, all.length - size));
  return all.slice(start, start + size).map((s, k) => ({ ...s, idx: start + k, now: start + k === index && index < stops.length }));
}
export function mapLayout(win, { w, h, mode }) {
  const n = win.length, top = 92 + NOW_R, bottom = h - GO.bottom - GO.h - 18 - NOW_R - (mode === 'portrait' ? 0 : 28); // + label room
  const P = [0.5, 0.27, 0.66, 0.3, 0.68, 0.4], L = [1, 0, 1, 0, 1, 0]; // landscape zigzag uses the full height (room for Kit beside a stop)
  return win.map((s, i) => {
    const r = s.now ? NOW_R : STOP_R, t = n > 1 ? i / (n - 1) : 0;
    let x, y, side;
    if (mode === 'portrait') { y = bottom - t * (bottom - top); x = w * P[i % P.length]; side = x < w / 2 ? 'right' : 'left'; }
    else { x = 90 + t * (w - 180); y = top + L[i % L.length] * (bottom - top); side = 'below'; } // landscape: every label on the same side (below its stop)
    return { ...s, x, y, r, side, low: mode !== 'portrait' && y > (top + bottom) / 2 };
  });
}
// Smooth path through the stop centres (quadratic through midpoints).
export function pathD(pts) {
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    d += i === 1 ? ` L ${m.x} ${m.y}` : ` Q ${a.x} ${a.y} ${m.x} ${m.y}`;
    if (i === pts.length - 1) d += ` L ${b.x} ${b.y}`;
  }
  return d;
}
// Level-up chips (mockup note 6): up to 3 words the child read right at that level (or containing that sound),
// falling back to the sounds themselves before blending.
export function levelUpChips(stop, responses, stops) {
  const right = responses.filter(r => r.correct && r.skill?.startsWith('blend:')).sort((a, b) => b.timestamp - a.timestamp);
  const uniq = xs => [...new Set(xs)];
  let words = [];
  if (stop.kind === 'words') words = uniq(right.filter(r => r.skill === `blend:L${stop.level}`).map(r => r.itemId));
  else if (stop.gpc) words = uniq(right.filter(r => (r.gpcs ?? []).includes(stop.gpc)).map(r => r.itemId));
  if (words.length) return words.slice(0, 3).map(w => ({ text: w, clip: `word-${w}` }));
  const i = stops.findIndex(s => s.id === stop.id);
  return stops.slice(0, i + 1).filter(s => s.kind === 'sound').slice(-3).map(s => ({ text: s.label, clip: `snd-${s.gpc}` }));
}
