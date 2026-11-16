import { test, expect } from '@playwright/test';

// The session log must not take a child's tap. elementFromPoint at the centre of every
// interactive control returns that control (or a descendant), never #kit-sessionlog*.
const VIEWPORTS = [
  [390, 844], [780, 360], [1376, 1032], [820, 1180], [1280, 800], [1920, 1080],
];
const INSETS = [null, { top: 24, bottom: 48 }];
const SCENES = [
  ['hello', '/?sessionlog=1&reducedMotion=1', '#play'],
  ['map', '/?sessionlog=1&skipHello=1&reducedMotion=1', '#go'],
  ['intro', '/?sessionlog=1&skipHello=1&activity=intro&gpc=s&reducedMotion=1', '#ic-replay'],
  ['trace', '/?sessionlog=1&skipHello=1&activity=trace&gpc=l&reducedMotion=1', '#tr-undo'],
  ['word', '/?sessionlog=1&skipHello=1&level=2&word=map&seed=1&reducedMotion=1', '#handle'],
  ['star', '/?sessionlog=1&skipHello=1&activity=star&word=the&seed=1&reducedMotion=1', '#st-word'],
  ['sound-tap', '/?sessionlog=1&skipHello=1&activity=soundTap&seed=1&reducedMotion=1', '#l-home'],
  ['sound-hunt', '/?sessionlog=1&skipHello=1&activity=hunt&seed=1&reducedMotion=1', '#l-home'],
  ['grown-ups', '/?sessionlog=1&skipHello=1&parent=1&progress=5&reducedMotion=1', '.ptile'],
];

async function settle(page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => window.kitphonic.sessionLog.place());
}

async function applyInsets(page, insets) {
  await page.evaluate((insets) => {
    const s = document.documentElement.style;
    for (const side of ['top', 'right', 'bottom', 'left']) {
      s.setProperty(`--safe-area-inset-${side}`, `${insets?.[side] || 0}px`);
    }
  }, { top: insets?.top || 0, right: 0, bottom: insets?.bottom || 0, left: 0 });
  await settle(page);
}

function hitTest() {
  const sel = 'button, [role="slider"], a[href], input, select, textarea';
  const root = document.getElementById('kit-sessionlog');
  const visible = (el) => {
    if (!el || root.contains(el) || el.closest('[hidden]')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };
  const name = (el) => (el.id ? `#${el.id}` : (el.getAttribute('aria-label') || el.className?.toString?.() || el.tagName));
  const misses = [];
  for (const el of [...document.querySelectorAll(sel)].filter(visible)) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    // A control scrolled below the fold, or out of the grown-ups scroller into the safe-area pad, is not on screen.
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    let clipped = false;
    for (let n = el.parentElement; n && !clipped; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflow)) continue;
      const b = n.getBoundingClientRect();
      if (x < b.left || x > b.right || y < b.top || y > b.bottom) clipped = true;
    }
    if (clipped) continue;
    const hit = document.elementFromPoint(x, y);
    const own = hit && (hit === el || el.contains(hit));
    const blocked = hit && (hit.id?.startsWith('kit-sessionlog') || hit.closest?.('#kit-sessionlog'));
    if (!own || blocked) misses.push(`${name(el)} -> ${hit ? name(hit) : 'nothing'}`);
  }
  const toggle = document.getElementById('kit-sessionlog-toggle');
  const tr = toggle.getBoundingClientRect();
  const inset = (side) => parseFloat(document.documentElement.style.getPropertyValue(`--safe-area-inset-${side}`)) || 0;
  const chip = {
    x: tr.left, y: tr.top, w: tr.width, h: tr.height,
    top: inset('top'), bottom: inset('bottom'), left: inset('left'), right: inset('right'),
    corner: root.dataset.corner, open: root.dataset.open,
  };
  return { misses, n: document.querySelectorAll(sel).length, chip };
}

test('session log controls never cover a child or grown-ups control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'one Chromium pass; the viewports are set in the test');
  test.setTimeout(360_000);
  const rows = [];
  const failures = [];
  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    for (const [scene, url, ready] of SCENES) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction((sel) => {
        const el = document.querySelector(sel);
        return window.kitphonic?.sessionLog && el && !el.closest('[hidden]') && el.getBoundingClientRect().width > 1;
      }, ready, { timeout: 15_000 });
      for (const insets of INSETS) {
        await applyInsets(page, insets);
        for (const open of [false, true]) {
          await page.evaluate((flag) => window.kitphonic.sessionLog.setOpen(flag), open);
          await settle(page);
          const result = await page.evaluate(hitTest);
          const label = `${w}x${h} ${insets ? `insets ${insets.top}/${insets.bottom}` : 'insets 0'} ${scene} ${open ? 'open' : 'shut'} corner ${result.chip.corner}`;
          const c = result.chip;
          const chipBad = [];
          if (c.w < 40 || c.h < 40) chipBad.push(`chip ${c.w}x${c.h}`);
          if (c.y < c.top - 1 || c.x < c.left - 1 || c.y + c.h > h - c.bottom + 1 || c.x + c.w > w - c.right + 1) {
            chipBad.push(`chip outside safe area (${Math.round(c.x)},${Math.round(c.y)})`);
          }
          const problems = [...chipBad, ...result.misses];
          rows.push(label);
          if (problems.length) failures.push(`${label}: ${problems.join('; ')}`);
        }
      }
    }
  }
  console.log(`session-log hit ${rows.length - failures.length}/${rows.length}`);
  for (const label of rows) console.log(`${failures.some(f => f.startsWith(label)) ? 'FAIL' : 'ok'} ${label}`);
  expect(failures).toEqual([]);
});

test('Copy and Clear take one tap from an empty log and from a 3-line log', async ({ page }) => {
  await page.goto('/?sessionlog=1&reducedMotion=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.kitphonic?.sessionLog);
  await page.evaluate(() => window.kitphonic.sessionLog.setOpen(true));
  await page.evaluate(() => {
    window.__logClicks = { copy: 0, clear: 0 };
    document.getElementById('kit-sessionlog-copy').addEventListener('click', () => window.__logClicks.copy++);
    document.getElementById('kit-sessionlog-clear').addEventListener('click', () => window.__logClicks.clear++);
    window.kitphonic.sessionLog.clear();
  });
  const box = () => page.locator('#kit-sessionlog-copy').boundingBox();
  const emptyBox = await box();
  await page.locator('#kit-sessionlog-copy').click();
  await page.locator('#kit-sessionlog-clear').click();
  await page.evaluate(() => {
    const log = window.kitphonic.sessionLog;
    log.push('screen', 'one');
    log.push('screen', 'two');
    log.push('screen', 'three');
  });
  const threeBox = await box();
  expect(threeBox).toEqual(emptyBox);
  await page.locator('#kit-sessionlog-copy').click();
  await page.locator('#kit-sessionlog-clear').click();
  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) window.kitphonic.sessionLog.push('screen', `line ${i}`);
  });
  expect(await box()).toEqual(emptyBox);
  expect(await page.evaluate(() => window.__logClicks)).toEqual({ copy: 2, clear: 2 });
  const taps = await page.evaluate(() => window.kitphonic.sessionLog.entries.filter(e => e.kind === 'tap').map(e => e.detail));
  expect(taps.some(d => d.includes('kit-sessionlog'))).toBe(false);
});
