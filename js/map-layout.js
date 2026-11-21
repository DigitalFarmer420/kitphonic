// Learning-map geometry (pure, unit-tested). The path holds every stop, winding bottom->top
// in portrait and left->right in landscape, with the same spacing as the old 6-stop window.
// The visible board is a clipped scroller (clear of the top bar and the big ▶ button).
// Coordinates are CSS pixels of the fluid board. STOP_R / GO are the design sizes; mapMetrics scales them by u
// and floors stop diameters at 64px (the current stop at 72px) so the touch floor matches the CSS clamps.
import { MIN_TOUCH } from './stage.js';
export const STOP_R = 38, NOW_R = 52, WINDOW = 6, TEASERS = []; // the stories teaser became the real story stops
export const ZIGZAG_P = [0.5, 0.27, 0.66, 0.3, 0.68, 0.4], ZIGZAG_L = [1, 0, 1, 0, 1, 0]; // landscape zigzag uses the full height (room for Kit beside a stop)
export const GO = { w: 200, h: 72, bottom: 22 };

export function mapMetrics(stage) {
  const u = stage.u ?? 1, w = stage.w, h = stage.h, mode = stage.mode;
  const goH = Math.max(MIN_TOUCH, GO.h * u), goW = GO.w * u;
  const nowR = Math.max(36, NOW_R * u), stopR = Math.max(MIN_TOUCH / 2, STOP_R * u);
  let top = 92 * u + nowR;
  let bottom = h - GO.bottom * u - goH - 18 * u - nowR - (mode === 'portrait' ? 0 : 28 * u);
  if (bottom < top + stopR) { // a very short board: pull both rows into the band between the top bar and ▶
    top = MIN_TOUCH + 8 + nowR;
    bottom = Math.max(top + stopR, h - goH - 8 - nowR);
  }
  return { u, w, h, mode, goH, goW, nowR, stopR, top, bottom, goTop: h - GO.bottom * u - goH, goBottom: GO.bottom * u };
}
export const groupOf = s => s.group ?? (s.kind === 'words' ? (s.level === 6 ? 'sh · ch · th' : s.level === 5 ? 'end blends' : s.level >= 4 ? 'blends' : 'blend words') : s.kind === 'sound' ? 'sounds' : '');

// Chrome of the map screen: top bar (⌂, stars, ⚙) and the ▶ button. The scroller sits between them.
// 5.375rem = .top offset 0.875rem + 4.5rem button. Root rem is 16×u.
export const BOARD_GAP = 8; // keep a clipped path stroke off the rounded ▶ and the top bar
export function boardInsets(stage, measured) {
  const m = mapMetrics(stage), u = m.u;
  if (measured && Number.isFinite(measured.boardTop) && Number.isFinite(measured.boardBottom)) {
    return { boardTop: measured.boardTop, boardBottom: measured.boardBottom, boardH: m.h - measured.boardTop - measured.boardBottom, boardW: m.w };
  }
  const boardTop = 5.375 * 16 * u, boardBottom = m.h - m.goTop + BOARD_GAP;
  return { boardTop, boardBottom, boardH: m.h - boardTop - boardBottom, boardW: m.w };
}

export function mapStep(stage, size = WINDOW) {
  const { top, bottom, w, mode, u, nowR, stopR } = mapMetrics(stage);
  const denom = Math.max(1, size - 1);
  let step = mode === 'portrait' ? (bottom - top) / denom : (w - 180 * u) / denom;
  // The trail repeats ZIGZAG_P, so the wrap (0.4 → 0.5) is tighter than any pair inside a 6-stop window.
  // On a short board that pair would overlap; stretch the step just enough to keep a clear gap.
  const minD = nowR + stopR + 8;
  if (mode === 'portrait') {
    const wrap = Math.min(...ZIGZAG_P.map((p, i) => Math.abs(p - ZIGZAG_P[(i + 1) % ZIGZAG_P.length])));
    const need = Math.sqrt(Math.max(0, minD * minD - (wrap * w) ** 2));
    if (step < need) step = need;
  }
  return { axis: mode === 'portrait' ? 'y' : 'x', step };
}

// All stops, with idx / now flags. Teasers (none today) still append at the end.
export function mapStops(stops, index) {
  const all = [...stops, ...TEASERS];
  return all.map((s, k) => ({ ...s, idx: k, now: k === index && index < stops.length }));
}

// Visible 6-stop neighborhood around the current one (used to place the scroller's opening slot).
export function mapWindow(stops, index, size = WINDOW) {
  const all = [...stops, ...TEASERS], cur = Math.min(index, stops.length - 1);
  let start = Math.max(0, cur - 2); start = Math.min(start, Math.max(0, all.length - size));
  return all.slice(start, start + size).map((s, k) => ({ ...s, idx: start + k, now: start + k === index && index < stops.length }));
}

function windowStart(index, count, size = WINDOW) {
  const cur = Math.min(Math.max(0, index), Math.max(0, count - 1));
  let start = Math.max(0, cur - 2);
  return Math.min(start, Math.max(0, count - size));
}

// Lay out every stop on a long trail with the 6-window spacing. Portrait grows downward in content
// (later stops toward the top); landscape grows to the right. pts also carry contentW / contentH.
export function mapLayout(win, stage, insets) {
  const m = mapMetrics(stage), { w, h, mode, u, top, bottom, nowR, stopR } = m;
  const band = boardInsets(stage, insets), { step } = mapStep(stage);
  const n = win.length, P = ZIGZAG_P, L = ZIGZAG_L;
  const padTop = top - band.boardTop;
  // Only the path axis grows; the other axis matches the scroller so the trail cannot drift under the chrome.
  let contentW = band.boardW, contentH = band.boardH;
  if (mode === 'portrait') contentH = padTop + Math.max(0, n - 1) * step + (h - band.boardBottom - bottom);
  else contentW = 90 * u + Math.max(0, n - 1) * step + 90 * u;
  return win.map((s, i) => {
    const r = s.now ? nowR : stopR;
    let x, y, side;
    if (mode === 'portrait') {
      y = padTop + Math.max(0, n - 1 - i) * step;
      x = w * P[i % P.length];
      side = x < w / 2 ? 'right' : 'left';
    } else {
      x = 90 * u + i * step;
      y = top - band.boardTop + L[i % L.length] * (bottom - top);
      side = 'below';
    }
    return { ...s, x, y, r, side, low: mode !== 'portrait' && y > (top - band.boardTop + bottom - band.boardTop) / 2, contentW, contentH };
  });
}

// Scroll offsets that put the current stop in the same viewport slot the 6-stop window used.
export function mapScroll(win, stage, index, insets) {
  const pts = win[0] && Number.isFinite(win[0].x) ? win : mapLayout(win, stage, insets);
  const m = mapMetrics(stage), band = boardInsets(stage, insets), { step, axis } = mapStep(stage);
  const n = pts.length, contentW = pts[0]?.contentW ?? m.w, contentH = pts[0]?.contentH ?? m.h;
  if (!n) return { left: 0, top: 0, contentW, contentH };
  const cur = Math.min(Math.max(0, index), n - 1), k = cur - windowStart(cur, n);
  const p = pts[cur];
  const maxLeft = Math.max(0, contentW - band.boardW), maxTop = Math.max(0, contentH - band.boardH);
  // Keep the focused stop fully in the board (a stretched step on a short board can push the
  // 6-window slot up under the top bar or down under ▶).
  if (axis === 'y') {
    let target = (m.bottom - k * step) - band.boardTop;
    target = Math.max(m.nowR, Math.min(band.boardH - m.nowR, target));
    return { left: 0, top: Math.max(0, Math.min(maxTop, p.y - target)), contentW, contentH };
  }
  let target = 90 * m.u + k * step;
  target = Math.max(m.nowR, Math.min(band.boardW - m.nowR, target));
  return { left: Math.max(0, Math.min(maxLeft, p.x - target)), top: 0, contentW, contentH };
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
  if (stop.apply) words = uniq(right.filter(r => r.apply === stop.apply).map(r => r.itemId));
  else if (stop.kind === 'words') words = uniq(right.filter(r => r.skill === `blend:L${stop.level}`).map(r => r.itemId));
  else if (stop.gpc) words = uniq(right.filter(r => (r.gpcs ?? []).includes(stop.gpc)).map(r => r.itemId));
  if (words.length) return words.slice(0, 3).map(w => ({ text: w, clip: `word-${w}` }));
  const i = stops.findIndex(s => s.id === stop.id);
  return stops.slice(0, i + 1).filter(s => s.kind === 'sound').slice(-3).map(s => ({ text: s.label, clip: `snd-${s.gpc}` }));
}
