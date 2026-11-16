// Opt-in device log for a real iPad: ?sessionlog=1. Nothing here runs unless createSessionLog /
// observeAudioContexts / watchStorage are called, and app.js calls them only when the flag is on.
// The buffer stays in memory: no network, no storage.
import { cssVarsFromInline, envInsetsAllowed, resolveSafeInsets } from './safe-insets.js';

export const SESSION_LOG_CAP = 200;
export const SESSION_LOG_CHIP = 44;
export const SESSION_LOG_PRE_H = 96;
const VIEW_LINES = 8;
const PAD = 8;
const GAP = 6;
const PRE_W = 168;
const CONTROL_SEL = 'button, [role="slider"], a[href], input, select, textarea';
const TOOLBAR_SEL = '.top, .ibar, .pa-top';

export function sessionLogEnabled(search = '') {
  const q = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(q).get('sessionlog') === '1';
}

const stampOf = (t) => (t instanceof Date ? t.toISOString() : String(t));

function targetLabel(node) {
  let el = node;
  if (el && el.nodeType && el.nodeType !== 1) el = el.parentElement;
  for (; el; el = el.parentElement) {
    if (el.id) return `#${el.id}`;
    const raw = typeof el.className === 'string' ? el.className : (el.className?.baseVal ?? '');
    const cls = String(raw).trim().split(/\s+/).filter(Boolean)[0];
    if (cls) return `.${cls}`;
    if (!el.parentElement) break;
  }
  const tag = node?.tagName || node?.parentElement?.tagName;
  return tag ? String(tag).toLowerCase() : 'unknown';
}

function insideLog(node, root) {
  for (let el = node; el; el = el.parentElement) if (el === root) return true;
  return false;
}

export function rectsOverlap(a, b, pad = 0) {
  if (!a || !b) return false;
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

function hits(rect, list, pad = 1) {
  return list.some(o => rectsOverlap(rect, o, pad));
}

function inside(rect, bounds) {
  return rect.x >= bounds.x - 0.5 && rect.y >= bounds.y - 0.5
    && rect.x + rect.w <= bounds.x + bounds.w + 0.5
    && rect.y + rect.h <= bounds.y + bounds.h + 0.5;
}

function cornerDistance(rect, bounds) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const corners = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.w, bounds.y],
    [bounds.x, bounds.y + bounds.h],
    [bounds.x + bounds.w, bounds.y + bounds.h],
  ];
  return Math.min(...corners.map(([x, y]) => Math.hypot(cx - x, cy - y)));
}

// Crop a rectangle so it does not sit on a toolbar row. Too small to read means no panel.
function avoidToolbars(pre, toolbars) {
  let r = { ...pre };
  for (const tb of toolbars) {
    if (!rectsOverlap(r, tb, 0)) continue;
    if (tb.y <= r.y && tb.y + tb.h > r.y && tb.y + tb.h < r.y + r.h) {
      const cut = tb.y + tb.h - r.y;
      r = { ...r, y: r.y + cut, h: r.h - cut };
    } else if (tb.y > r.y && tb.y < r.y + r.h) {
      r = { ...r, h: tb.y - r.y };
    } else if (tb.x <= r.x && tb.x + tb.w > r.x && tb.x + tb.w < r.x + r.w) {
      const cut = tb.x + tb.w - r.x;
      r = { ...r, x: r.x + cut, w: r.w - cut };
    } else if (tb.x > r.x && tb.x < r.x + r.w) {
      r = { ...r, w: tb.x - r.x };
    } else return null;
    if (r.w < 48 || r.h < 32) return null;
  }
  return r;
}

function layoutsFor(anchor, bounds, expanded, chip) {
  const t = { x: anchor.x, y: anchor.y, w: chip, h: chip };
  if (!expanded) return [{ toggle: t, copy: null, clear: null, pre: null, kind: 'chip' }];
  const leftish = anchor.x <= bounds.x + bounds.w / 2;
  const topish = anchor.y <= bounds.y + bounds.h / 2;
  const beside = (x, step) => ({ x: x + step, y: t.y, w: chip, h: chip });
  const step = leftish ? chip + GAP : -(chip + GAP);
  const copy = beside(t.x, step);
  const clear = beside(copy.x, step);
  const rowLeft = Math.min(t.x, copy.x, clear.x);
  const preRow = topish
    ? { x: rowLeft, y: t.y + chip + GAP, w: PRE_W, h: SESSION_LOG_PRE_H }
    : { x: rowLeft, y: t.y - GAP - SESSION_LOG_PRE_H, w: PRE_W, h: SESSION_LOG_PRE_H };
  const vStep = topish ? chip + GAP : -(chip + GAP);
  const vCopy = { x: t.x, y: t.y + vStep, w: chip, h: chip };
  const vClear = { x: t.x, y: vCopy.y + vStep, w: chip, h: chip };
  const stackTop = Math.min(t.y, vCopy.y, vClear.y);
  const preStack = leftish
    ? { x: t.x + chip + GAP, y: stackTop, w: PRE_W, h: SESSION_LOG_PRE_H }
    : { x: t.x - GAP - PRE_W, y: stackTop, w: PRE_W, h: SESSION_LOG_PRE_H };
  return [
    { toggle: t, copy, clear, pre: preRow, kind: 'row' },
    { toggle: t, copy: vCopy, clear: vClear, pre: preStack, kind: 'stack' },
  ];
}

function scoreLayout(layout, bounds, controls, toolbars) {
  const buttons = [layout.toggle, layout.copy, layout.clear].filter(Boolean);
  if (buttons.some(b => !inside(b, bounds) || hits(b, controls) || hits(b, toolbars))) return null;
  let pre = layout.pre ? { ...layout.pre } : null;
  if (pre) {
    pre.w = Math.min(pre.w, bounds.x + bounds.w - pre.x);
    pre.h = Math.min(pre.h, bounds.y + bounds.h - pre.y);
    if (pre.x < bounds.x) { pre.w -= bounds.x - pre.x; pre.x = bounds.x; }
    if (pre.y < bounds.y) { pre.h -= bounds.y - pre.y; pre.y = bounds.y; }
    pre = pre.w >= 48 && pre.h >= 32 ? avoidToolbars(pre, toolbars) : null;
  }
  const preCovers = !!(pre && hits(pre, controls, 0));
  return {
    ...layout,
    pre,
    preCovers,
    covers: preCovers ? 1 : 0,
    cornerDist: cornerDistance(layout.toggle, bounds),
  };
}

// Pick a ~44px chip inside the safe rectangle, as close to a corner as the controls allow.
// Copy and Clear (when expanded) stay off controls and off toolbar rows. The log text may
// overlap a control only when every clear corner is taken; it is then pointer-events: none.
export function chooseSessionSpot({ vw, vh, insets = {}, controls = [], toolbars = [], expanded = false, chip = SESSION_LOG_CHIP } = {}) {
  const bounds = {
    x: (insets.left || 0) + PAD,
    y: (insets.top || 0) + PAD,
    w: vw - (insets.left || 0) - (insets.right || 0) - PAD * 2,
    h: vh - (insets.top || 0) - (insets.bottom || 0) - PAD * 2,
  };
  if (!(bounds.w >= chip) || !(bounds.h >= chip)) {
    const toggle = { x: Math.max(0, bounds.x), y: Math.max(0, bounds.y), w: chip, h: chip };
    return { name: 'tl', kind: 'chip', toggle, copy: null, clear: null, pre: null, preCovers: false };
  }
  const maxX = bounds.x + bounds.w - chip;
  const maxY = bounds.y + bounds.h - chip;
  const corners = [
    { name: 'tl', x: bounds.x, y: bounds.y },
    { name: 'tr', x: maxX, y: bounds.y },
    { name: 'bl', x: bounds.x, y: maxY },
    { name: 'br', x: maxX, y: maxY },
  ];
  const spots = [...corners];
  const obstacles = [...controls, ...toolbars];
  for (const c of corners) {
    for (let i = 1; i <= 8; i++) {
      const d = i * 20;
      const towardX = c.x === bounds.x ? Math.min(maxX, bounds.x + d) : Math.max(bounds.x, maxX - d);
      const towardY = c.y === bounds.y ? Math.min(maxY, bounds.y + d) : Math.max(bounds.y, maxY - d);
      spots.push({ name: c.name, x: towardX, y: c.y });
      spots.push({ name: c.name, x: c.x, y: towardY });
    }
    for (const o of obstacles) {
      const below = Math.min(maxY, Math.max(bounds.y, o.y + o.h + GAP));
      const above = Math.max(bounds.y, Math.min(maxY, o.y - GAP - chip));
      const right = Math.min(maxX, Math.max(bounds.x, o.x + o.w + GAP));
      const left = Math.max(bounds.x, Math.min(maxX, o.x - GAP - chip));
      spots.push({ name: c.name, x: c.x, y: below });
      spots.push({ name: c.name, x: c.x, y: above });
      spots.push({ name: c.name, x: right, y: c.y });
      spots.push({ name: c.name, x: left, y: c.y });
    }
  }
  let best = null;
  const consider = (anchor) => {
    for (const layout of layoutsFor(anchor, bounds, expanded, chip)) {
      const scored = scoreLayout(layout, bounds, controls, toolbars);
      if (!scored) continue;
      if (!best || scored.covers < best.covers || (scored.covers === best.covers && scored.cornerDist < best.cornerDist - 0.5)) {
        best = { name: anchor.name, ...scored };
      }
    }
  };
  for (const spot of spots) consider(spot);
  if (!best) {
    for (let y = bounds.y; y <= maxY; y += 24) {
      for (let x = bounds.x; x <= maxX; x += 24) consider({ name: 'grid', x, y });
    }
  }
  if (!best) {
    const toggle = { x: bounds.x, y: bounds.y, w: chip, h: chip };
    return { name: 'tl', kind: 'chip', toggle, copy: null, clear: null, pre: null, preCovers: false };
  }
  return best;
}

function boxOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, id: el.id || '' };
}

function isVisible(el, root) {
  if (!el || el === root || root.contains(el)) return false;
  if (el.closest?.('[hidden]')) return false;
  const cs = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
  if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none')) return false;
  const r = el.getBoundingClientRect?.();
  return !!r && r.width >= 1 && r.height >= 1;
}

function probeEnv(doc, win) {
  if (!envInsetsAllowed(win.navigator?.userAgent || '')) return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  (doc.documentElement || doc.body).append(probe);
  const cs = win.getComputedStyle(probe);
  const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? Math.max(0, x) : 0; };
  const insets = { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
  probe.remove?.();
  return insets;
}

function readInsets(doc, host) {
  const style = doc.documentElement?.style;
  const cssVars = style && typeof style.getPropertyValue === 'function' ? cssVarsFromInline(style) : {};
  const envInsets = typeof host.getComputedStyle === 'function' ? probeEnv(doc, host) : { top: 0, right: 0, bottom: 0, left: 0 };
  return resolveSafeInsets({ cssVars, envInsets, userAgent: host.navigator?.userAgent || '' });
}

function pin(el, rect) {
  if (!rect) return;
  el.style.position = 'fixed';
  el.style.left = `${Math.round(rect.x)}px`;
  el.style.top = `${Math.round(rect.y)}px`;
  el.style.width = `${Math.round(rect.w)}px`;
  el.style.height = `${Math.round(rect.h)}px`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
}

export function createSessionLog(doc, { cap = SESSION_LOG_CAP, now = () => new Date(), win } = {}) {
  const host = win ?? doc.defaultView ?? globalThis;
  const entries = [];
  let open = false;
  let spot = null;
  const format = () => entries.map(e => `${e.t}\t${e.kind}\t${e.detail}`).join('\n');
  const push = (kind, detail = '') => {
    entries.push({ t: stampOf(now()), kind, detail: detail == null ? '' : String(detail) });
    if (entries.length > cap) entries.splice(0, entries.length - cap);
    paint();
  };
  const paint = () => {
    if (!view) return;
    view.textContent = entries.slice(-VIEW_LINES).map(e => {
      const clock = e.t.length >= 23 ? e.t.slice(11, 23) : e.t;
      return `${clock} ${e.kind} ${e.detail}`.trimEnd();
    }).join('\n');
  };

  const root = doc.createElement('div');
  root.id = 'kit-sessionlog';
  if (!root.dataset) root.dataset = {};
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Session log');
  root.dataset.open = 'false';
  root.style.pointerEvents = 'none';
  const toggle = doc.createElement('button');
  toggle.id = 'kit-sessionlog-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Log';
  toggle.setAttribute('aria-label', 'Session log');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.style.pointerEvents = 'auto';
  const copyBtn = doc.createElement('button');
  copyBtn.id = 'kit-sessionlog-copy';
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy';
  copyBtn.hidden = true;
  copyBtn.style.pointerEvents = 'auto';
  const clearBtn = doc.createElement('button');
  clearBtn.id = 'kit-sessionlog-clear';
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear';
  clearBtn.hidden = true;
  clearBtn.style.pointerEvents = 'auto';
  const view = doc.createElement('pre');
  view.id = 'kit-sessionlog-view';
  view.hidden = true;
  view.style.pointerEvents = 'none';
  view.style.height = `${SESSION_LOG_PRE_H}px`;
  view.style.maxHeight = `${SESSION_LOG_PRE_H}px`;
  view.style.overflow = 'auto';
  root.append(toggle, copyBtn, clearBtn, view);
  const style = doc.createElement('style');
  style.id = 'kit-sessionlog-style';
  style.textContent = SESSION_LOG_CSS;
  (doc.head || doc.documentElement).append(style);
  doc.body.append(root);

  const place = () => {
    const vw = host.innerWidth, vh = host.innerHeight;
    if (!vw || !vh || typeof doc.querySelectorAll !== 'function') return spot;
    const controls = [...doc.querySelectorAll(CONTROL_SEL)].filter(el => isVisible(el, root)).map(boxOf);
    const toolbars = [...doc.querySelectorAll(TOOLBAR_SEL)].filter(el => isVisible(el, root)).map(boxOf);
    spot = chooseSessionSpot({
      vw, vh, insets: readInsets(doc, host), controls, toolbars, expanded: open,
    });
    root.dataset.corner = spot.name;
    root.dataset.kind = spot.kind;
    pin(toggle, spot.toggle);
    for (const [el, rect] of [[copyBtn, spot.copy], [clearBtn, spot.clear]]) {
      if (!rect) continue;
      pin(el, rect);
    }
    if (spot.pre) {
      pin(view, spot.pre);
      view.style.height = `${Math.round(spot.pre.h)}px`;
      view.style.maxHeight = `${Math.round(spot.pre.h)}px`;
      view.style.overflow = 'auto';
      view.style.pointerEvents = spot.preCovers ? 'none' : 'auto';
    }
    return spot;
  };
  const schedulePlace = () => {
    place();
    host.requestAnimationFrame?.(() => place());
  };

  const markCopied = () => {
    copyBtn.textContent = 'Copied';
    host.setTimeout?.(() => { copyBtn.textContent = 'Copy'; }, 1200);
  };
  const fallbackCopy = (text) => {
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.pointerEvents = 'none';
    doc.body.append(ta);
    try { ta.select?.(); doc.execCommand?.('copy'); } catch { /* the button still shows the attempt */ }
    ta.remove?.();
  };
  copyBtn.addEventListener('click', () => {
    const text = format();
    const clip = host.navigator?.clipboard;
    if (clip?.writeText) {
      Promise.resolve(clip.writeText(text)).then(markCopied, () => { fallbackCopy(text); markCopied(); });
      return;
    }
    fallbackCopy(text);
    markCopied();
  });
  clearBtn.addEventListener('click', () => { entries.length = 0; paint(); });
  const setOpen = (next) => {
    open = !!next;
    root.dataset.open = open ? 'true' : 'false';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    copyBtn.hidden = !open;
    clearBtn.hidden = !open;
    view.hidden = !open;
    place();
  };
  toggle.addEventListener('click', () => setOpen(!open));

  doc.addEventListener('visibilitychange', () => push('visibility', doc.visibilityState || ''), { capture: true, passive: true });
  host.addEventListener?.('pagehide', () => push('pagehide', ''));
  host.addEventListener?.('pageshow', (e) => push('pageshow', e?.persisted ? 'persisted' : ''));
  // Taps on the overlay itself must not append a line: a growing panel used to slide Copy and Clear
  // out from under the finger before pointerup.
  doc.addEventListener('pointerdown', (e) => {
    if (insideLog(e.target, root)) return;
    push('tap', `${targetLabel(e.target)} ${e.pointerType || 'unknown'}`);
  }, { capture: true, passive: true });
  push('visibility', doc.visibilityState || 'visible');

  if (host.innerWidth && typeof host.addEventListener === 'function') {
    host.addEventListener('resize', schedulePlace);
    host.visualViewport?.addEventListener?.('resize', schedulePlace);
    if (typeof host.MutationObserver === 'function' && doc.documentElement) {
      new host.MutationObserver(schedulePlace).observe(doc.documentElement, { attributes: true, attributeFilter: ['style'] });
    }
    schedulePlace();
  }

  return {
    push,
    phase: (from, next) => push('hello', `${from}->${next}`),
    audio: (state) => push('audio', state ?? ''),
    screen: (id) => { push('screen', id ?? ''); schedulePlace(); },
    tap: (target, pointerType) => push('tap', `${target} ${pointerType || 'unknown'}`),
    storage: (op, err, key) => {
      const name = err?.name || 'Error';
      const msg = err?.message || err || '';
      push('storage', key == null || key === '' ? `${op}: ${name} ${msg}` : `${op} ${key}: ${name} ${msg}`);
    },
    clear() { entries.length = 0; paint(); },
    text: format,
    get entries() { return entries.map(e => ({ ...e })); },
    get spot() { return spot; },
    get open() { return open; },
    place,
    setOpen,
    root,
    toggle,
    copyButton: copyBtn,
    clearButton: clearBtn,
    view,
  };
}

// audio.js does not expose the AudioContext (only `unlocked`, a boolean). When the flag is on, wrap the
// constructors before createAudio() and listen for statechange. When the flag is off this is never called.
export function observeAudioContexts(win, log) {
  if (!win || !log || typeof log.audio !== 'function') return false;
  const originals = new WeakSet();
  let patched = false;
  const patch = (name) => {
    const Native = win[name];
    if (typeof Native !== 'function' || originals.has(Native)) return;
    originals.add(Native);
    function SessionLogAudioContext(...args) {
      const ctx = new Native(...args);
      let last = '';
      const note = () => {
        const state = ctx.state || '';
        if (state === last) return;
        last = state;
        log.audio(state);
      };
      try { ctx.addEventListener?.('statechange', note); } catch { /* a host without events still gets the snapshot below */ }
      note();
      return ctx;
    }
    SessionLogAudioContext.prototype = Native.prototype;
    try { Object.setPrototypeOf(SessionLogAudioContext, Native); } catch { /* the instance is what unlock() uses */ }
    win[name] = SessionLogAudioContext;
    patched = true;
  };
  patch('AudioContext');
  patch('webkitAudioContext');
  if (!patched) log.audio('unavailable');
  return patched;
}

// Wraps the Storage object app.js passes into settings, the response store, and seen.
// Logs getItem/setItem/removeItem/clear failures and rethrows so the callers keep their own catches.
export function watchStorage(storage, log) {
  if (!storage || !log) return storage;
  const wrapped = {};
  for (const name of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
    if (typeof storage[name] !== 'function') continue;
    wrapped[name] = (...args) => {
      try { return storage[name](...args); }
      catch (err) { log.storage(name, err, args[0]); throw err; }
    };
  }
  if (typeof storage.length === 'number') Object.defineProperty(wrapped, 'length', { get: () => storage.length });
  return wrapped;
}

const SESSION_LOG_CSS = `
#kit-sessionlog{position:fixed;z-index:40;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:#3A2E28}
#kit-sessionlog button{position:fixed;box-sizing:border-box;width:44px;height:44px;padding:0;pointer-events:auto;font:inherit;font-weight:700;background:#fff;color:#3A2E28;border:2px solid #EADCC6;border-radius:12px;touch-action:manipulation}
#kit-sessionlog button:focus-visible{outline:4px solid #4E97C9;outline-offset:3px}
#kit-sessionlog pre{position:fixed;box-sizing:border-box;height:96px;max-height:96px;overflow:auto;margin:0;white-space:pre-wrap;word-break:break-word;background:rgba(255,248,236,.92);border:1px solid #EADCC6;border-radius:8px;padding:4px 6px}
#kit-sessionlog pre[hidden],#kit-sessionlog button[hidden]{display:none}
`;
