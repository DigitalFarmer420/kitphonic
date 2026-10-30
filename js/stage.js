// Responsive stage (usability pass). Three modes, each filling the screen (no empty bands) and scaled so every touch
// target is >= 64 screen px (slider knob >= 80) on the smallest supported device:
//  - portrait : phones 400 wide (scale ~0.9 at 360), tablets 630 wide (scale ~1.3 at 820); height follows the screen.
//  - short    : phone landscape (viewport height < 500): 400 tall, width follows the screen.
//  - tall     : tablet/desktop landscape: 960 wide (spec §3.8.1 design), height follows the screen (540–760).
// Layouts anchor the slider row to the bottom of the stage (thumb zone) and the mascot/card to the top.
export const PORTRAIT_W = { phone: 400, tablet: 630 }, SHORT_H = 400, TALL_W = 960;
export const MIN_TOUCH = 64, MIN_KNOB = 80;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function stageFor(vw, vh) {
  let mode, w, h;
  if (vh > vw * 1.05) { mode = 'portrait'; w = vw < 600 ? PORTRAIT_W.phone : PORTRAIT_W.tablet; h = Math.round(clamp(w * vh / vw, 700, 1400)); }
  else if (vh < 500) { mode = 'short'; h = SHORT_H; w = Math.round(clamp(SHORT_H * vw / vh, 640, 1000)); }
  else { mode = 'tall'; w = TALL_W; h = Math.round(clamp(TALL_W * vh / vw, 540, 760)); }
  return { mode, portrait: mode === 'portrait', w, h, scale: Math.min(vw / w, vh / h), dy: 0 };
}
export function createStage(el, onChange = () => {}) {
  let cur = null;
  const fit = () => {
    const s = stageFor(innerWidth, innerHeight), changed = !cur || cur.mode !== s.mode || cur.h !== s.h || cur.w !== s.w;
    cur = s;
    Object.assign(el.style, { width: s.w + 'px', height: s.h + 'px', transform: `translate(-50%,-50%) scale(${s.scale})` });
    for (const m of ['portrait', 'short', 'tall']) el.classList.toggle(m, s.mode === m);
    el.classList.toggle('ptab', s.mode === 'portrait' && s.w >= 600);
    el.style.setProperty('--dy', '0px'); el.style.setProperty('--h', s.h + 'px'); el.style.setProperty('--w', s.w + 'px');
    if (changed) onChange(s);
  };
  addEventListener('resize', fit); fit();
  return { get info() { return cur; }, get scale() { return cur.scale; }, fit,
    toStage(e) { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) / cur.scale, y: (e.clientY - r.top) / cur.scale }; } };
}
