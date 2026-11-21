// Screen x window x text-scale matrix for the no-overlap check (tests/e2e/no-overlap.spec.js).
// Text scale is the ?textScale= dev param (js/stage.js readPreferredRootPx), the same path a device text size takes.
// No ?nosw=1: its kill switch reloads the tab once (~2 s in), which raced the checks. The projects block service workers.
const R = 'skipHello=1&reducedMotion=1';
export const OVERLAP_SCREENS = [
  { name: 'hello', q: 'reducedMotion=1&nosw=1', ready: () => !!window.kitphonic && !document.getElementById('hello').hidden },
  { name: 'word', q: `${R}&level=2&word=map&seed=1&support=3`, ready: () => window.kitphonic?.screen?.state === 'slide' },
  { name: 'check', q: `${R}&direct=1&level=2&word=map&seed=1&support=3`, ready: () => !!window.kitphonic?.screen?.entry, show: 'check' },
  { name: 'sentence', q: `${R}&activity=sentence&sentence=map-mat&seed=1`, ready: () => !document.getElementById('sentence').hidden && !!document.querySelector('#sn-tiles .stari') },
  { name: 'sentence-blend', q: `${R}&activity=sentence&sentence=map-mat&seed=1`, ready: () => !document.getElementById('sentence').hidden && !!document.querySelector('#sn-strip .wd.cur'),
    // tap the star word "the" (again until the screen takes it), then "map" is the word being blended
    act: async (page) => { await page.waitForFunction(() => { const sn = document.getElementById('sentence');
      if (sn.classList.contains('blending') && document.querySelectorAll('#sn-tiles .tile').length > 0) return true;
      document.querySelector('#sn-strip .wd.star.cur:not(.done)')?.click(); return false; }, null, { timeout: 10_000, polling: 400 }); } },
  { name: 'letters', q: `${R}&activity=soundTap&seed=1`, ready: () => document.querySelectorAll('#l-arena > *').length > 0 },
  { name: 'family', q: `${R}&activity=family&rime=at&familyMax=7&seed=1`, ready: () => !document.getElementById('family').hidden && document.querySelectorAll('.ftile').length > 0 },
  { name: 'intro', q: `${R}&activity=intro&gpc=s&seed=1`, ready: () => !document.getElementById('intro').hidden },
  { name: 'trace', q: `${R}&activity=trace&gpc=m&seed=1`, ready: () => (window.kitphonic?.lesson?.run?.debugPoints?.() ?? []).length > 2 },
  // a wide letter (Vinh, Nov 20: it may shrink on small landscape phones so Kit's prompt never covers it)
  { name: 'trace-wide', q: `${R}&activity=trace&gpc=qu&seed=1`, ready: () => (window.kitphonic?.lesson?.run?.debugPoints?.() ?? []).length > 2 },
  { name: 'map', q: `${R}&progress=5&seed=1`, ready: () => !document.getElementById('map').hidden && document.querySelectorAll('#m-stops > *').length > 0 },
  { name: 'grown-ups', q: `${R}&parent=1&progress=5`, ready: () => document.querySelectorAll('.ptile').length > 0 },
  { name: 'star', q: `${R}&activity=star&word=the&seed=1`, ready: () => !document.getElementById('star').hidden },
  { name: 'done', q: `${R}&progress=4&practiceEnd=1&seed=1`, ready: () => !document.getElementById('done').hidden },
];
export const OVERLAP_VIEWPORTS = [[390, 844], [320, 568], [1280, 720], [568, 320], [1180, 820], [1280, 480]];
export const OVERLAP_SCALES = [1, 1.5, 2];
// iPhone-style safe-area insets (top, right, bottom, left) for the notched phone size
export const OVERLAP_INSETS = { '390x844': [47, 0, 34, 0] };

// A stray navigation while the page settles is retried once from the start.
export async function openOverlapScreen(page, s, k, vp) {
  try { return await openOnce(page, s, k, vp); } catch (e) {
    if (!/Execution context was destroyed|navigat/i.test(String(e?.message))) throw e;
    return openOnce(page, s, k, vp);
  }
}
const insetsAdded = new WeakSet();
async function openOnce(page, s, k, vp) {
  const ins = OVERLAP_INSETS[`${vp.width}x${vp.height}`];
  if (ins && !insetsAdded.has(page)) {
    insetsAdded.add(page);
    await page.addInitScript((ins) => {
    const set = () => { const st = document.documentElement.style; ['top', 'right', 'bottom', 'left'].forEach((x, i) => st.setProperty(`--safe-area-inset-${x}`, ins[i] + 'px')); };
    if (document.documentElement) set();
    document.addEventListener('DOMContentLoaded', () => { set(); dispatchEvent(new Event('resize')); });
    }, ins);
  }
  await page.goto(`/?${s.q}&textScale=${k}`, { waitUntil: 'load' });
  await page.waitForFunction(s.ready, null, { timeout: 20_000 });
  if (s.show) {
    await page.evaluate((w) => window.kitphonic.screen.debugShow(w), s.show);
    await page.waitForFunction(() => window.kitphonic.screen.state === 'check' && document.querySelectorAll('#choices button.choice').length > 0, null, { timeout: 8_000 });
  }
  if (s.act) await s.act(page);
  await page.addStyleTag({ content: '.ghosthand{display:none!important} *{caret-color:transparent!important;transition:none!important;animation-play-state:paused!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
  const [t, r, b, l] = ins || [0, 0, 0, 0];
  return { top: t, right: r, bottom: b, left: l };
}
