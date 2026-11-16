// Shared pointer ownership and slider keyboard / ARIA for the blend sliders and the family tray.
// One finger owns a gesture until that pointer lifts, is cancelled, or loses capture.

export function pointerOwner() {
  let id = null;
  return {
    get id() { return id; },
    begin(pid) {
      if (pid == null || (id !== null && id !== pid)) return false;
      id = pid;
      return true;
    },
    owns(pid) { return id !== null && id === pid; },
    end(pid) {
      if (id === null || id !== pid) return false;
      id = null;
      return true;
    },
  };
}

// setPointerCapture is missing on some WebViews and throws if the pointer already ended.
// A failure must not abort the handler and leave the owner stuck.
export function tryCapture(el, pointerId) {
  try { el?.setPointerCapture?.(pointerId); }
  catch { /* pointerup / pointercancel on window still releases the owner */ }
}

// lostpointercapture is specified to fire before pointerup and pointercancel. Wait one turn so a
// normal lift can still commit (a family drop). If neither follows, capture was stolen: abort.
export function scheduleLostCapture(event, stillOwns, abort, schedule = setTimeout) {
  const pid = event?.pointerId;
  schedule(() => { if (stillOwns(pid)) abort(event); }, 0);
}

const SLIDER_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

// Next track fraction (0..1) for a slider key. Arrows step to the next or previous sound, then the
// ends of the track. Home and End are those ends — the same places a drag can reach.
export function sliderKeyTarget(position, stops, key) {
  if (!SLIDER_KEYS.has(key)) return null;
  const p = Math.max(0, Math.min(1, Number(position) || 0));
  if (key === 'Home') return 0;
  if (key === 'End') return 1;
  const marks = [...(stops ?? [])].map(Number).filter(x => x > 0 && x < 1).sort((a, b) => a - b);
  const eps = 1e-4;
  if (key === 'ArrowRight' || key === 'ArrowUp') {
    const next = marks.find(m => m > p + eps);
    return next == null ? 1 : next;
  }
  let prev = null;
  for (const m of marks) if (m < p - eps) prev = m;
  return prev == null ? 0 : prev;
}

// Sounds the knob is on right now. Marker stops are the real positions (a bar is not one letter).
// Without stops, dots sit on letter centres, (i + .5) / n. The sweep's lit set only grows, so it
// must not be used here: Home and a slide back would keep announcing sounds the knob has left.
export function soundsAtKnob(fraction, total = 0, stops) {
  const raw = Number(fraction);
  const f = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0));
  const marks = [...(stops ?? [])].map(Number).filter(x => Number.isFinite(x) && x >= 0 && x <= 1);
  const n = Math.max(0, Number(total) || marks.length || 0) | 0;
  if (!n) return 0;
  if (marks.length) return Math.min(n, marks.filter(m => m <= f + 1e-4).length);
  return Math.min(n, Math.max(0, Math.floor(f * n + 0.5 + 1e-9)));
}

export function sliderAriaState({ fraction = 0, total = 0, stops } = {}) {
  const raw = Number(fraction);
  const f = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0));
  const now = String(Math.round(f * 100));
  const n = Math.max(0, Number(total) || [...(stops ?? [])].length || 0) | 0;
  const k = soundsAtKnob(f, n, stops);
  const text = n === 0
    ? (f <= 0 ? 'start' : `${now} percent`)
    : (f >= 0.98 && k >= n ? `all ${n} sounds` : `${k} of ${n} sounds`);
  return {
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': now,
    'aria-valuetext': text,
    'aria-orientation': 'horizontal',
  };
}

export function applySliderAria(el, state) {
  if (!el?.setAttribute) return;
  for (const [k, v] of Object.entries(sliderAriaState(state))) el.setAttribute(k, v);
}
