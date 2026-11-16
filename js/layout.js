// Word-screen geometry in CSS pixels of the fluid board. `u` is the root rem scale (1rem = 16×u px),
// so a design size of N stage-px is N×u on screen. Tiles and the knob never drop below the touch floor.
import { MIN_TOUCH, MIN_KNOB, knobPx } from './stage.js';

export const STAGE_W = 960, TILE_W = 120, GAP = 18, CELL = TILE_W + GAP;
export const MIN_TILE = 72, KNOB = 90; // design px; screen size is design × u, floored at 64 / 80
export const LAYOUTS = {
  tall: { maxTile: 120, gap: 18, side: 40 },
  short: { maxTile: 100, gap: 14, side: 24, areaLeft: 220 }, // left column: mascot, card, next
  portrait: { maxTile: 100, gap: 12, side: 16 },
  portraitTablet: { maxTile: 120, gap: 16, side: 24 },
};
export const PORTRAIT_TILES = { stageW: 400, ...LAYOUTS.portrait };
export function layoutFor(info) {
  const u = info.u ?? 1;
  const designW = info.designW ?? info.w;
  const key = info.mode === 'portrait' ? (designW >= 600 ? 'portraitTablet' : 'portrait') : info.mode || 'tall';
  const L = LAYOUTS[key];
  return {
    stageW: info.w, u,
    maxTile: L.maxTile * u,
    gap: L.gap * u,
    side: L.side * u,
    minTile: Math.max(MIN_TOUCH, MIN_TILE * u),
    areaLeft: (L.areaLeft || 0) * u,
  };
}
export function tileFit(n, { stageW = STAGE_W, areaLeft = 0, maxTile = TILE_W, gap = GAP, side = 40, minTile = MIN_TILE } = {}) {
  const fit = (s, g) => (stageW - areaLeft - 2 * s - Math.max(0, n - 1) * g) / n;
  let tileW = fit(side, gap);
  if (tileW < minTile) { gap = Math.min(gap, 4); side = Math.min(side, 2); tileW = fit(side, gap); }
  if (tileW < minTile) { gap = 0; side = 0; tileW = fit(side, gap); }
  // The design cap (maxTile) can fall under the touch floor on a small board. Use the floor
  // when the row still has room; only a row that cannot fit the floor stays under it.
  const floor = Math.min(minTile, Math.max(0, tileW));
  const width = Math.min(Math.max(0, tileW), Math.max(maxTile, floor));
  return { tileW: width, gap, side };
}
export function wordLayout(n, opts = {}) {
  const o = typeof opts === 'number' ? { stageW: opts } : opts, stageW = o.stageW ?? STAGE_W, areaLeft = o.areaLeft ?? 0;
  const u = o.u ?? 1;
  const knob = o.knob ?? (o.u == null && o.stageW === STAGE_W ? KNOB : knobPx(u));
  const { tileW, gap } = o.tileW ? { tileW: o.tileW, gap: o.gap ?? GAP * u }
    : o.maxTile ? tileFit(n, o) : { tileW: TILE_W * u, gap: (o.gap ?? GAP) * u };
  const cell = tileW + gap, rowW = n * cell - gap, rowLeft = areaLeft + (stageW - areaLeft - rowW) / 2, x0 = rowLeft - gap / 2, span = n * cell;
  const edge = 4 * u;
  return {
    rowLeft, rowW, tileW, gap, cell, stageW, u, knob,
    tileLeft: i => rowLeft + i * cell,
    markerBox: m => ({ left: rowLeft + m.start * cell, width: (m.end - m.start) * cell - gap }),
    fracFromX: x => Math.max(0, Math.min(1, (x - x0) / span)),
    xFromFrac: f => x0 + f * span,
    knobX: f => Math.max(knob / 2 + edge, Math.min(stageW - knob / 2 - edge, x0 + f * span)),
    track: { left: x0, width: span },
  };
}
// The groove ends where the knob sits at fraction 1. That point is on screen (knobX clamps the
// centre), so value 100 is the drawn end of the track and the 90px knob still fits on the stage.
export function sliderTrack(layout) {
  const left = Math.max(8, layout.track.left - 20), right = layout.knobX(1);
  return { left, width: Math.max(1, right - left) };
}
// A finger at the on-screen end of the knob, or past the sweep's end (0.98), is at fraction 1.
// Otherwise a finished drag can leave the knob a hair short of the track while the value is not 100.
export function fractionAt(layout, x) {
  const f = layout.fracFromX(x);
  if (f >= 0.98 || x >= layout.knobX(1) - 0.5) return 1;
  return f;
}
