// Key screens for the Uiux checks, the committed-baseline screenshots and the develop diff.
// Each opens straight from a dev URL (TESTING.md "URL params"), with reduced motion, and waits for a steady state.
export const SCREENS = [
  { name: 'hello', url: '/?reducedMotion=1', ready: () => !!window.kitphonic && !document.getElementById('hello').hidden },
  { name: 'map', url: '/?skipHello=1&reducedMotion=1&progress=3', ready: () => !document.getElementById('map').hidden && document.querySelectorAll('#m-stops > *').length > 0 },
  { name: 'intro', url: '/?skipHello=1&reducedMotion=1&activity=intro&gpc=m', ready: () => !document.getElementById('intro').hidden },
  { name: 'trace', url: '/?skipHello=1&reducedMotion=1&activity=trace&gpc=m', ready: () => (window.kitphonic?.lesson?.run?.debugPoints?.() ?? []).length > 2 },
  { name: 'word', url: '/?skipHello=1&reducedMotion=1&level=2&word=map&seed=1&support=3', ready: () => window.kitphonic?.screen?.state === 'slide' },
  { name: 'check-picture', url: '/?skipHello=1&reducedMotion=1&direct=1&level=2&word=map&seed=1&support=3', ready: () => !!window.kitphonic?.screen?.entry, show: 'check' },
  { name: 'check-cards', url: '/?skipHello=1&reducedMotion=1&direct=1&level=1&word=am&seed=1&support=3', ready: () => !!window.kitphonic?.screen?.entry, show: 'check' },
  { name: 'star', url: '/?skipHello=1&reducedMotion=1&activity=star&word=the&seed=1', ready: () => !document.getElementById('star').hidden },
  { name: 'letters', url: '/?skipHello=1&reducedMotion=1&activity=soundTap&seed=1', ready: () => document.querySelectorAll('#l-arena > *').length > 0 },
  { name: 'family', url: '/?skipHello=1&reducedMotion=1&activity=family&rime=ap', ready: () => !document.getElementById('family').hidden },
  { name: 'sentence', url: '/?skipHello=1&reducedMotion=1&activity=sentence&sentence=map-mat', ready: () => !document.getElementById('sentence').hidden },
  { name: 'grown-ups', url: '/?skipHello=1&reducedMotion=1&parent=1&progress=5', ready: () => document.querySelectorAll('.ptile').length > 0 },
];
// Screens with committed pixel baselines (and the develop diff): the ones every fluid UI PR touches.
export const VISUAL_SCREENS = ['hello', 'map', 'trace', 'word', 'check-cards', 'grown-ups'];

// Hides what moves on its own (pointing-hand hint, blinking caret) so screenshots are stable.
export const STILL_CSS = '.ghosthand{display:none!important} *{caret-color:transparent!important}';

export async function openScreen(page, s) {
  await page.goto(s.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(s.ready, null, { timeout: 20_000 });
  if (s.show) {
    await page.evaluate((w) => window.kitphonic.screen.debugShow(w), s.show);
    await page.waitForFunction(() => window.kitphonic.screen.state === 'check' && document.querySelectorAll('#choices button.choice').length > 0, null, { timeout: 8_000 });
  }
  await page.addStyleTag({ content: STILL_CSS });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400); // let layout settle (relayout on resize, map scroll)
}
