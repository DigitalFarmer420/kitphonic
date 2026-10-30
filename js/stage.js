// Responsive stage. Landscape (tablets first, spec §3.8.1): fixed 960x600 design. Portrait (phones): 540 wide,
// height follows the screen (880–1170) and --dy centres the content block vertically. Everything is scaled to fit.
export const LANDSCAPE = { w: 960, h: 600 };
export const PORTRAIT_W = 540, PORTRAIT_H = [880, 1170], PORTRAIT_BLOCK = 880;
export function stageFor(vw, vh) {
  if (vh > vw * 1.05) {
    const h = Math.round(Math.min(PORTRAIT_H[1], Math.max(PORTRAIT_H[0], PORTRAIT_W * vh / vw)));
    return { portrait: true, w: PORTRAIT_W, h, scale: Math.min(vw / PORTRAIT_W, vh / h), dy: Math.round((h - PORTRAIT_BLOCK) / 2) };
  }
  return { portrait: false, ...LANDSCAPE, scale: Math.min(vw / LANDSCAPE.w, vh / LANDSCAPE.h), dy: 0 };
}
export function createStage(el, onChange = () => {}) {
  let cur = null;
  const fit = () => {
    const s = stageFor(innerWidth, innerHeight), changed = !cur || cur.portrait !== s.portrait || cur.h !== s.h;
    cur = s;
    Object.assign(el.style, { width: s.w + 'px', height: s.h + 'px', transform: `translate(-50%,-50%) scale(${s.scale})` });
    el.classList.toggle('portrait', s.portrait); el.style.setProperty('--dy', s.dy + 'px');
    if (changed) onChange(s);
  };
  addEventListener('resize', fit); fit();
  return { get info() { return cur; }, get scale() { return cur.scale; }, fit,
    toStage(e) { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) / cur.scale, y: (e.clientY - r.top) / cur.scale }; } };
}
