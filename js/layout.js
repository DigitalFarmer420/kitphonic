// Word-screen geometry (pure, unit-tested). Each letter owns a cell (tile + gap), so the slider fraction for a
// letter's centre is exactly (i + .5) / n, matching core.markerPositions(). Landscape: 120-wide tiles, 18 gaps on a
// 960 stage; portrait: 96 / 14 on a 540 stage.
export const STAGE_W = 960, TILE_W = 120, GAP = 18, CELL = TILE_W + GAP;
export const PORTRAIT_TILES = { stageW: 540, tileW: 96, gap: 14 };
export function wordLayout(n, opts = {}) {
  const { stageW = STAGE_W, tileW = TILE_W, gap = GAP } = typeof opts === 'number' ? { stageW: opts } : opts;
  const cell = tileW + gap, rowW = n * cell - gap, rowLeft = (stageW - rowW) / 2, x0 = rowLeft - gap / 2, span = n * cell;
  return {
    rowLeft, rowW, tileW, cell,
    tileLeft: i => rowLeft + i * cell,
    markerBox: m => ({ left: rowLeft + m.start * cell, width: (m.end - m.start) * cell - gap }),
    fracFromX: x => Math.max(0, Math.min(1, (x - x0) / span)),
    xFromFrac: f => x0 + f * span,
    track: { left: x0, width: span },
  };
}
