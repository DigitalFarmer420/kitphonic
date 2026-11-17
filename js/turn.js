// Picture-only "turn your phone" gate. Each screen has its own minimum safe height (Hmin).
// The card shows only when that screen's stack cannot fit, and the activity stays put underneath.
export const MIN_TOUCH = 64, MIN_KNOB = 80, MIN_ADULT = 48;

// Safe height (px) below which the screen cannot keep its floors. Landscape values sit just
// above the cell that fails and at or under the next cell that must stay open.
const HMIN = {
  star: { portrait: 344, landscape: 150 },
  trace: { portrait: 176, landscape: 176 },
  sentence: { portrait: 352, landscape: 236 },
  map: { portrait: 224, landscape: 224 },
  letters: { portrait: 224, landscape: 224 },
  intro: { portrait: 224, landscape: 224 },
  word: { portrait: 376, landscape: 224 },
  word5: { portrait: 376, landscape: 244 },
  family7: { portrait: 382, landscape: 244 },
};

export function screenHmin(screen, { portrait = false, letters = 0, family = 0, trace = false } = {}) {
  const side = portrait ? 'portrait' : 'landscape';
  let key = screen;
  if (key === 'lesson') key = trace ? 'trace' : 'intro';
  if (key === 'word' && letters >= 5) key = 'word5';
  if (key === 'family') key = family >= 7 ? 'family7' : '';
  return HMIN[key]?.[side] ?? 0;
}

export function needsTurn(safeH, hmin = 0) {
  return hmin > 0 && safeH < hmin;
}

// The visible viewport. iOS Safari's layout viewport (100vh / innerHeight) includes the
// address bar; visualViewport is the part the child can actually see.
export function viewportBox(view) {
  const vv = view?.visualViewport;
  const w = vv && vv.width > 0 ? vv.width : view.innerWidth;
  const h = vv && vv.height > 0 ? vv.height : view.innerHeight;
  return { w, h, x: vv?.offsetLeft || 0, y: vv?.offsetTop || 0 };
}

export function createTurnGate({ onPause, onResume } = {}) {
  let active = false;
  return {
    get active() { return active; },
    update(safeH, hmin = 0) {
      const want = needsTurn(safeH, hmin);
      if (want === active) return active;
      active = want;
      if (want) onPause?.();
      else onResume?.();
      return active;
    },
  };
}

// Shift a start timestamp by the time spent paused, so a demo resumes at the same frame.
export function resumeClock(clock, now, paused) {
  if (paused) {
    if (clock.pausedAt == null) clock.pausedAt = now;
    return clock;
  }
  if (clock.pausedAt != null) {
    clock.t0 += now - clock.pausedAt;
    clock.pausedAt = null;
  }
  return clock;
}
