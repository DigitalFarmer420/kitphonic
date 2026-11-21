import { cssVarsFromInline, resolveSafeInsets, stageBox, envInsetsAllowed } from './safe-insets.js';

// Fluid stage. The board is still the art coordinate system (map path, slider, tracing), but it is
// sized in real CSS pixels — there is no transform: scale(). A root font-size of 16×u turns every
// `rem` into the old stage-pixel size times u, so 4.5rem is the old 72px button on screen.
// u is the old uniform fit, capped at MAX_SCALE so a 4K window stays at the 1080p composition.
// Controls that would fall under the touch floor use clamp(64px, …rem, …) / clamp(80px, …) in CSS;
// buttonPx / knobPx are that same formula for layout math.
export const PORTRAIT_W = { phone: 400, tablet: 630 }, SHORT_H = 400, TALL_W = 960;
export const MIN_TOUCH = 64, MIN_KNOB = 80;
export const PHONE_MIN_W = 360; // narrowest portrait composition, used only for large text
export const BUTTON = 72, KNOB_D = 90;
export const MAX_SCALE = 2; // 1920×1080 already lands on 2; larger windows do not grow past it
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Design-space fit (the historical stage). Kept so the tested viewports keep the same u.
export function legacyStage(vw, vh) {
  let mode, w, h;
  if (vh > vw * 1.05) { mode = 'portrait'; w = vw < 600 ? PORTRAIT_W.phone : PORTRAIT_W.tablet; h = Math.round(clamp(w * vh / vw, 700, 1400)); }
  else if (vh < 500) { mode = 'short'; h = SHORT_H; w = Math.round(clamp(SHORT_H * vw / vh, 640, 1000)); }
  else { mode = 'tall'; w = TALL_W; h = Math.round(clamp(TALL_W * vh / vw, 540, 760)); }
  return { mode, w, h, scale: Math.min(vw / w, vh / h) };
}

export function buttonPx(u) { return Math.max(MIN_TOUCH, Math.min(BUTTON * MAX_SCALE, BUTTON * u)); }
export function knobPx(u) { return Math.max(MIN_KNOB, Math.min(KNOB_D * MAX_SCALE, KNOB_D * u)); }

// Device text size as a whole-app zoom factor: 1 at the default 16px, up to TEXT_SCALE_MAX.
export const TEXT_SCALE_MAX = 2;
export function textScale(preferredPx = 16) {
  const p = Number.isFinite(preferredPx) && preferredPx > 0 ? preferredPx : 16;
  return clamp(p / 16, 1, TEXT_SCALE_MAX);
}

// Flow stage. The board fills the whole (safe) window: there is no letterbox on a wide or squat
// window. u is still the fit of the historical composition (portrait / short / tall), so every
// control keeps today's size; a window wider or taller than that composition gives the screen more
// board, and the screens reflow into it. designW / designH name the composition, not the board.
// Large text (k > 1) scales the whole app: the composition is chosen for a window k times smaller
// and then drawn k times larger, so the layout reflows like a smaller window instead of overlapping.
// A window already at the smallest composition (a phone in portrait) cannot grow further.
export function stageFor(vw, vh, k = 1) {
  vw = Math.max(1, vw); vh = Math.max(1, vh);
  k = textScale(16 * (Number.isFinite(k) ? k : 1));
  const raw = legacyStage(vw / k, vh / k);
  let u = Math.min(raw.scale, MAX_SCALE) * k;
  if (k > 1 && raw.mode === 'portrait' && raw.w === PORTRAIT_W.phone) {
    // A phone in portrait is already the smallest composition (400 wide). Large text narrows it toward
    // PHONE_MIN_W instead, so the whole app still grows; every phone screen is laid out to that width.
    const w = Math.max(PHONE_MIN_W, PORTRAIT_W.phone / k), h = clamp(w * vh / vw, 700, 1400);
    const up = Math.min(vw / w, vh / h, MAX_SCALE * k);
    if (up > u) { u = up; raw.w = Math.round(w); raw.h = Math.round(h); }
  }
  return {
    mode: raw.mode, portrait: raw.mode === 'portrait',
    w: vw, h: vh, scale: 1, // board CSS pixels; pointer code divides by scale and there is no CSS scale
    u, k, designW: raw.w, designH: raw.h, legacyScale: raw.scale, dy: 0,
  };
}

function readEnvInsets(doc) {
  if (!envInsetsAllowed(navigator.userAgent)) return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  doc.documentElement.appendChild(probe);
  const cs = getComputedStyle(probe);
  const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? Math.max(0, x) : 0; };
  const insets = { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
  probe.remove();
  return insets;
}

// The device text size. `medium` follows a desktop or Chrome font-size setting.
// `-apple-system-body` follows iOS text size and is 17px at the default setting,
// so that 17 is normalized back to 16. The larger of the two wins. A normal
// setting stays 16, which is today's root, and a larger setting scales every rem.
export function readPreferredRootPx(doc) {
  const getStyle = doc.defaultView?.getComputedStyle?.bind(doc.defaultView);
  if (!getStyle || !doc.documentElement) return 16;
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;visibility:hidden;font-size:medium';
  doc.documentElement.appendChild(probe);
  const medium = parseFloat(getStyle(probe).fontSize);
  probe.style.font = '-apple-system-body';
  const body = parseFloat(getStyle(probe).fontSize);
  probe.remove();
  const fromMedium = Number.isFinite(medium) && medium > 0 ? medium : 16;
  const fromBody = Number.isFinite(body) && body > 0 ? (body / 17) * 16 : fromMedium;
  const preferred = Math.max(fromMedium, fromBody);
  return Math.abs(preferred - 16) < 0.05 ? 16 : preferred;
}
// The root rem is 16 × u. u already carries the text scale (see stageFor), so large text grows
// every rem together with the board's composition, never the type alone.
export function rootFontPx(u) {
  return 16 * (Number.isFinite(u) && u > 0 ? u : 1);
}

function visualBox(win) {
  const vv = win?.visualViewport;
  if (!vv) return { vw: win.innerWidth, vh: win.innerHeight, offL: 0, offT: 0 };
  return { vw: vv.width, vh: vv.height, offL: vv.offsetLeft || 0, offT: vv.offsetTop || 0 };
}

export function createStage(el, onChange = () => {}) {
  let cur = null, fitting = false;
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  const fit = () => {
    if (fitting) return;
    fitting = true;
    try { fitNow(); } finally { fitting = false; }
  };
  const fitNow = () => {
    const insets = resolveSafeInsets({
      cssVars: cssVarsFromInline(doc.documentElement.style),
      envInsets: readEnvInsets(doc),
      userAgent: navigator.userAgent,
    });
    const { vw, vh, offL, offT } = visualBox(win);
    const k = textScale(readPreferredRootPx(doc));
    const s = stageBox(vw, vh, insets, (w, h) => stageFor(w, h, k));
    const changed = !cur || cur.mode !== s.mode || cur.h !== s.h || cur.w !== s.w || cur.u !== s.u;
    cur = s;
    const fs = rootFontPx(s.u) + 'px';
    // Root rem is the fluid unit. Skip the write when it is unchanged so the style observer does not loop.
    if (doc.documentElement.style.fontSize !== fs) doc.documentElement.style.fontSize = fs;
    Object.assign(el.style, {
      width: s.w + 'px', height: s.h + 'px',
      left: (offL + s.cx - s.w / 2) + 'px', top: (offT + s.cy - s.h / 2) + 'px',
      transform: 'none',
    });
    for (const m of ['portrait', 'short', 'tall']) el.classList.toggle(m, s.mode === m);
    el.classList.toggle('ptab', s.mode === 'portrait' && s.designW >= 600);
    el.classList.toggle('tight', s.mode === 'portrait' && s.h / s.k < 520);
    el.classList.toggle('large-text', s.k > 1);
    el.classList.toggle('narrow', s.mode === 'portrait' && s.designW < PORTRAIT_W.phone); // large-text phone composition
    el.dataset.insetSource = insets.source;
    el.style.setProperty('--dy', '0px');
    el.style.setProperty('--scale', '1');
    el.style.setProperty('--u', String(s.u));
    el.style.setProperty('--k', String(s.k));
    el.style.setProperty('--h', s.h + 'px');
    el.style.setProperty('--w', s.w + 'px');
    if (changed) onChange(s);
  };
  win.addEventListener('resize', fit);
  win.visualViewport?.addEventListener('resize', fit);
  win.visualViewport?.addEventListener('scroll', fit);
  new MutationObserver(fit).observe(doc.documentElement, { attributes: true, attributeFilter: ['style'] });
  fit();
  return {
    get info() { return cur; },
    get scale() { return 1; },
    fit,
    toStage(e) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },
  };
}
