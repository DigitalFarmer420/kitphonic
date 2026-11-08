// Safe rectangle for the stage. Capacitor 8.6.0 SystemBars (declared by the rc9 wrapper, always
// registered from Bridge.registerAllPlugins) is the source of truth on Android:
//   insetsHandling defaults to "css".
//   WebView major < 140: the plugin pads the decor view by the real status/navigation/cutout
//   insets and then sets --safe-area-inset-* to 0px. env() is not reliable there
//   (Chromium 40699457), so a CSS inset on top of that padding would double.
//   WebView major >= 140 with viewport-fit=cover: the plugin does not pad for system bars
//   (only for the IME) and sets --safe-area-inset-* to the real insets. The page must use
//   those variables. It must not also add env(), which would double them.
// An explicit 0 from the plugin is a value, not "missing". env() is only a fallback when the
// variables were never set (iOS, desktop, or Android Chrome/WebView >= 140 if injection failed).
export const ANDROID_SAFE_AREA_FIX = 140;

const SIDES = ['top', 'right', 'bottom', 'left'];

export function chromeMajor(ua = '') {
  const m = /Chrome\/(\d+)/.exec(ua);
  return m ? Number(m[1]) : null;
}

export function envInsetsAllowed(ua = '') {
  if (!/Android/i.test(ua)) return true;
  const major = chromeMajor(ua);
  return major != null && major >= ANDROID_SAFE_AREA_FIX;
}

export function cssVarsFromInline(style) {
  const out = {};
  for (const side of SIDES) {
    const raw = style?.getPropertyValue?.(`--safe-area-inset-${side}`);
    if (raw == null || String(raw).trim() === '') { out[side] = null; continue; }
    const n = parseFloat(raw);
    out[side] = Number.isFinite(n) ? Math.max(0, n) : null;
  }
  return out;
}

export function resolveSafeInsets({ cssVars = {}, envInsets = {}, userAgent = '' } = {}) {
  const anySet = SIDES.some(side => cssVars[side] != null);
  if (anySet) {
    const out = { source: 'css-var' };
    for (const side of SIDES) out[side] = cssVars[side] == null ? 0 : cssVars[side];
    return out;
  }
  if (!envInsetsAllowed(userAgent)) return { top: 0, right: 0, bottom: 0, left: 0, source: 'native' };
  const out = { source: 'env' };
  for (const side of SIDES) out[side] = Math.max(0, Number(envInsets[side]) || 0);
  return out;
}

// Fit the existing stage modes to the safe viewport. Zero insets return stageFor(vw, vh) unchanged,
// so a WebView that Capacitor has already padded (CSS variables 0) is not padded again. A full-bleed
// WebView gets the same layout it would have had if the WebView itself had been inset.
export function stageBox(vw, vh, insets, stageFor) {
  const raw = {
    top: Math.max(0, Number(insets?.top) || 0),
    right: Math.max(0, Number(insets?.right) || 0),
    bottom: Math.max(0, Number(insets?.bottom) || 0),
    left: Math.max(0, Number(insets?.left) || 0),
  };
  if (raw.left + raw.right > vw - 1) {
    const s = (vw - 1) / (raw.left + raw.right);
    raw.left *= s; raw.right *= s;
  }
  if (raw.top + raw.bottom > vh - 1) {
    const s = (vh - 1) / (raw.top + raw.bottom);
    raw.top *= s; raw.bottom *= s;
  }
  const box = { top: raw.top, right: raw.right, bottom: raw.bottom, left: raw.left };
  if (box.top + box.right + box.bottom + box.left === 0) {
    return { ...stageFor(vw, vh), insets: box, cx: vw / 2, cy: vh / 2 };
  }
  const safeW = vw - box.left - box.right, safeH = vh - box.top - box.bottom;
  return { ...stageFor(safeW, safeH), insets: box, cx: box.left + safeW / 2, cy: box.top + safeH / 2 };
}
