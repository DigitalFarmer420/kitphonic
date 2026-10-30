// Word-screen geometry (pure, unit-tested). Each letter owns a cell (tile + gap), so the slider fraction for a
// letter's centre is exactly (i + .5) / n, matching core.markerPositions(). Tile width adapts to the stage width and
// word length, between minTile (72 stage px = 64 screen px at the smallest scale, 0.9) and maxTile.
export const STAGE_W = 960, TILE_W = 120, GAP = 18, CELL = TILE_W + GAP;
export const MIN_TILE = 72, KNOB = 90; // stage px; smallest scale is ~0.9 -> 64 / 81 screen px
export const LAYOUTS = {
  tall: { maxTile: 120, gap: 18, side: 40 },
  short: { maxTile: 100, gap: 14, side: 24, areaLeft: 220 }, // left column: mascot, card, next
  portrait: { maxTile: 100, gap: 12, side: 16 },
  portraitTablet: { maxTile: 120, gap: 16, side: 24 },
};
export const PORTRAIT_TILES = { stageW: 400, ...LAYOUTS.portrait };
export function layoutFor(info) {
  const key = info.mode === 'portrait' ? (info.w >= 600 ? 'portraitTablet' : 'portrait') : info.mode || 'tall';
  return { stageW: info.w, ...LAYOUTS[key] };
}
export function tileFit(n, { stageW = STAGE_W, areaLeft = 0, maxTile = TILE_W, gap = GAP, side = 40, minTile = MIN_TILE } = {}) {
  const fit = (s, g) => Math.floor((stageW - areaLeft - 2 * s - (n - 1) * g) / n);
  let tileW = fit(side, gap);
  if (tileW < minTile) { gap = Math.min(gap, 6); side = Math.min(side, 6); tileW = fit(side, gap); }
  return { tileW: Math.max(Math.min(tileW, maxTile), Math.min(minTile, tileW)), gap };
}
export function wordLayout(n, opts = {}) {
  const o = typeof opts === 'number' ? { stageW: opts } : opts, stageW = o.stageW ?? STAGE_W, areaLeft = o.areaLeft ?? 0;
  const { tileW, gap } = o.tileW ? { tileW: o.tileW, gap: o.gap ?? GAP } : o.maxTile ? tileFit(n, o) : { tileW: TILE_W, gap: o.gap ?? GAP };
  const cell = tileW + gap, rowW = n * cell - gap, rowLeft = areaLeft + (stageW - areaLeft - rowW) / 2, x0 = rowLeft - gap / 2, span = n * cell;
  return {
    rowLeft, rowW, tileW, gap, cell, stageW,
    tileLeft: i => rowLeft + i * cell,
    markerBox: m => ({ left: rowLeft + m.start * cell, width: (m.end - m.start) * cell - gap }),
    fracFromX: x => Math.max(0, Math.min(1, (x - x0) / span)),
    xFromFrac: f => x0 + f * span,
    // knob centre never leaves the stage (it may rest left of the first letter; fraction is clamped to 0 there)
    knobX: f => Math.max(KNOB / 2 + 4, Math.min(stageW - KNOB / 2 - 4, x0 + f * span)),
    track: { left: x0, width: span },
  };
}
