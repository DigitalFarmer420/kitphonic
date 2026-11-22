// Grown-ups lesson preview (Vinh, Nov 21): a parent or teacher opens any map stop, locked ones too, and plays it
// through. Read-only by construction: every storage the app writes (progress log, ghost-hand counts, settings) is
// wrapped by one preview gate. While a preview runs, reads see an in-memory overlay first and the device second;
// every setItem / removeItem / clear lands in the overlay only. Ending the preview drops the overlay, so nothing a
// preview did can reach localStorage, whatever code path wrote it. Pure (no DOM), so it is unit-testable.
import { STOPS, mapState } from './progress.js';
import { seedProgress } from './dev-seed.js';
import { planReplay, planSession } from './session.js';

export const RESPONSES_KEY = 'kitphonic.v1.responses', SEEN_KEY = 'kitphonic.v1.seen';
export const PREVIEW_HOLD_MS = 700; // long press on a lesson tile (the map gear's press-and-hold pattern, shorter)

export function createPreviewGate() {
  const wrapped = new Set();
  let active = false;
  const gate = {
    get active() { return active; },
    // Wrap a Storage-like object ({getItem, setItem, removeItem}). Outside a preview it passes straight through.
    wrap(base) {
      let over = null; // Map key -> string | null (null = removed in this preview)
      const w = {
        getItem(k) { if (over?.has(k)) return over.get(k); return base?.getItem(k) ?? null; },
        setItem(k, v) { if (over) { over.set(k, String(v)); return; } base?.setItem(k, v); },
        removeItem(k) { if (over) { over.set(k, null); return; } base?.removeItem(k); },
        clear() { if (over) { over = new Map(); return; } base?.clear?.(); },
        _begin(seed) { over = new Map(Object.entries(seed ?? {})); },
        _end() { over = null; },
        get previewing() { return !!over; },
      };
      wrapped.add(w); if (active) w._begin();
      return w;
    },
    // seed: keys every wrapped storage reads from its overlay first (e.g. a synthetic progress log for the stop).
    begin(seed = {}) { active = true; for (const w of wrapped) w._begin(seed); },
    end() { active = false; for (const w of wrapped) w._end(); },
  };
  return gate;
}

// The synthetic child a preview uses: every stop before `index` passed, so the chosen stop is the current one and
// its lesson uses exactly the sounds a child at that point knows. The real child's log is never read or written.
export function previewSeed(index, now = Date.now()) {
  return { [RESPONSES_KEY]: JSON.stringify(seedProgress(index, { now })), [SEEN_KEY]: '{}' };
}

// Plan the chosen stop's lesson for the synthetic child: the replay lesson (PR #66), else a session planned at it.
export function planPreview(responses, index, { now = Date.now(), rand = Math.random, minutes } = {}) {
  const stop = mapState(responses, now).stops[index] ?? STOPS[index];
  if (!stop) return { items: [], cost: 0, stop: null, practice: true, preview: true };
  let plan = planReplay(responses, stop, { now, rand });
  if (!plan.items.length) plan = { ...planSession(responses, { now, rand, minutes }), stop };
  return { ...plan, stop, practice: true, preview: true };
}

// One preview run over a gate. start() opens the overlay and returns the plan; end() discards it.
export function createPreview({ gate, getResponses, now = () => Date.now(), rand = Math.random }) {
  let cur = null;
  return {
    get active() { return !!cur; },
    get stop() { return cur?.stop ?? null; },
    start(index, opts = {}) {
      if (cur) this.end();
      if (!(index >= 0 && index < STOPS.length)) return null;
      gate.begin(previewSeed(index, now()));
      const plan = planPreview(getResponses(), index, { now: now(), rand, minutes: opts.minutes });
      cur = { index, stop: plan.stop };
      return plan;
    },
    end() { const was = !!cur; cur = null; gate.end(); return was; },
  };
}

// Press-and-hold on an element: onHold after `ms` held still; a short press is a tap (onTap). Moving more than
// `slop` px, leaving, or cancelling stops the hold. Same pattern as the map's grown-ups gear.
export function pressHold(el, { ms = PREVIEW_HOLD_MS, slop = 10, onHold, onTap = () => {}, onStart = () => {}, onCancel = () => {}, timers = globalThis } = {}) {
  let t = 0, start = null, fired = false;
  const clear = () => { if (t) timers.clearTimeout(t); t = 0; };
  const cancel = () => { if (start && !fired) onCancel(); clear(); start = null; };
  el.addEventListener('pointerdown', e => {
    if (e.button != null && e.button !== 0) return;
    clear(); fired = false; start = { x: e.clientX ?? 0, y: e.clientY ?? 0 }; onStart();
    t = timers.setTimeout(() => { t = 0; fired = true; start = null; onHold(); }, ms);
  });
  el.addEventListener('pointermove', e => {
    if (!start) return;
    if (Math.hypot((e.clientX ?? 0) - start.x, (e.clientY ?? 0) - start.y) > slop) cancel();
  });
  el.addEventListener('pointerup', () => { const tap = !!start && !fired; clear(); start = null; if (tap) { onCancel(); onTap(); } });
  for (const ev of ['pointerleave', 'pointercancel']) el.addEventListener(ev, cancel);
  el.addEventListener('contextmenu', e => e.preventDefault?.()); // a long touch must not open the callout menu
  el.addEventListener('click', e => { if (fired) { e.preventDefault?.(); fired = false; } });
  return { cancel };
}

// Preview badge placement (mockup-preview-badge.html). The approved spot is top-right under the top-bar buttons.
// On a board where that spot would cover something (a phone bubble, a landscape picture), the badge slides to the
// nearest clear spot, like the map's label unclash: down the right edge first, then down the left edge. It keeps a
// clear spot while it stays clear, so it does not jump around during a lesson. Runs only while previewing.
const CONTENT = 'button, [role="slider"], .bubble, .mascot > svg, .kitwrap > svg, .tcard, .icard, .ipic, #card, #sn-card, #fm-card, .tray, .peb, .tile, .wd, .ftile, .pc, .choice, canvas, img';
const SIDES4 = ['top', 'right', 'bottom', 'left'];
export function placeBadge(badge, screen, { step = 8 } = {}) {
  if (!badge || badge.hidden || !screen) return null;
  const hit = (a, b) => a.left < b.right + 2 && b.left < a.right + 2 && a.top < b.bottom + 2 && b.top < a.bottom + 2;
  const shown = e => { if (e.closest('[hidden]')) return false; const r = e.getBoundingClientRect(); return r.width >= 1 && r.height >= 1 && getComputedStyle(e).visibility !== 'hidden'; };
  const boxes = [...screen.querySelectorAll(CONTENT)].filter(shown).map(e => e.getBoundingClientRect());
  const st = badge.parentElement.getBoundingClientRect();
  const clear = () => { const r = badge.getBoundingClientRect(); return r.left >= st.left && r.top >= st.top && r.right <= st.right && r.bottom <= st.bottom && !boxes.some(b => hit(r, b)); };
  const set = sp => { for (const k of SIDES4) badge.style[k] = sp[k] ?? ''; };
  const was = badge.dataset.spot, keep = { top: badge.style.top, right: badge.style.right, left: badge.style.left };
  set({}); // the CSS (design) spot always wins when it is clear
  if (clear()) return (badge.dataset.spot = 'design');
  if (was && was !== 'design') { set(keep); if (clear()) return was; } // else stay put while clear (no jumping)
  const cs = getComputedStyle(badge), top0 = parseFloat(cs.top) || 0, right0 = cs.right, h = badge.offsetHeight;
  for (const side of ['right', 'left']) {
    for (let y = top0; y + h <= st.height; y += step) {
      set(side === 'right' ? { top: y + 'px', right: right0 } : { top: y + 'px', right: 'auto', left: right0 });
      if (clear()) return (badge.dataset.spot = `${side}:${Math.round(y)}`);
    }
  }
  set({}); delete badge.dataset.spot; return null; // nowhere clear: the design spot (the overlap check reports it)
}
