// Picture-only "turn your phone" gate. The child floors (64px targets, 80px knobs) need a
// minimum stack of screen pixels. Below that the board pauses in place and shows the card.
export const MIN_TOUCH = 64, MIN_KNOB = 80, MIN_ADULT = 48;
// Short-landscape column once the floors bind: header 64, tile row 88 (6.875rem at that scale),
// marker 64, knob 80, and the gaps those rows already keep. A shorter safe rect shows the card.
export const MIN_STACK = 64 + 8 + 88 + 10 + 64 + 10 + 80 + 8;

export function needsTurn(safeH) {
  return safeH < MIN_STACK;
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
    update(safeH) {
      const want = needsTurn(safeH);
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
