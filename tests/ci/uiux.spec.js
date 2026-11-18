import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCREENS, openScreen } from './screens.js';
import { audit, axeText } from './uiux-audit.js';
import { watch } from './guards.js';

// Uiux layout checks (REPORT-ONLY job "uiux"): every key screen at every Uiux size, WebKit and Chromium.
// Each test writes its findings to test-results/uiux-findings/*.json (summarised by tests/ci/summarize.mjs)
// and fails when it has any. There is no known-failure list: a finding on develop shows up as a failure here,
// and the job is continue-on-error until those findings are fixed.
const root = fileURLToPath(new URL('../..', import.meta.url));
const axePath = `${root}node_modules/axe-core/axe.min.js`;
const outDir = `${root}test-results/uiux-findings`;

// Notched phones get the safe-area insets iOS reports (status bar / home indicator; landscape side insets).
// Playwright cannot set env(safe-area-inset-*), so they go in --safe-area-inset-*, which js/safe-insets.js reads.
const INSETS = { '390x844': [47, 0, 34, 0], '430x932': [59, 0, 34, 0], '844x390': [0, 47, 21, 47] };
const insetsFor = (vp) => INSETS[`${vp.width}x${vp.height}`] || [0, 0, 0, 0];

test.beforeEach(async ({ page, viewport }) => {
  const ins = insetsFor(viewport);
  if (ins.some(Boolean)) await page.addInitScript((ins) => {
    const set = () => { const st = document.documentElement.style; ['top', 'right', 'bottom', 'left'].forEach((k, i) => st.setProperty(`--safe-area-inset-${k}`, ins[i] + 'px')); };
    if (document.documentElement) set();
    document.addEventListener('DOMContentLoaded', () => { set(); dispatchEvent(new Event('resize')); });
  }, ins);
});

function record(testInfo, screen, findings) {
  mkdirSync(outDir, { recursive: true });
  const vp = testInfo.project.use.viewport;
  const rows = findings.map((f) => ({ ...f, screen, browser: testInfo.project.use.browserName, viewport: `${vp.width}x${vp.height}` }));
  writeFileSync(`${outDir}/${testInfo.project.name}__${screen}.json`, JSON.stringify(rows, null, 1));
  return rows.filter((f) => !f.info);
}
const safeOf = (vp) => { const [top, right, bottom, left] = insetsFor(vp); return { top, right, bottom, left }; };

for (const s of SCREENS) {
  test(`uiux ${s.name}`, async ({ page, baseURL, viewport }, testInfo) => {
    const g = watch(page, baseURL);
    await openScreen(page, s);
    const findings = [...await page.evaluate(audit, { safe: safeOf(viewport) }), ...await axeText(page, axePath)];
    expect(g.offsite, 'privacy').toEqual([]);
    const bad = record(testInfo, s.name, findings);
    expect(bad, `${s.name} findings`).toEqual([]);
  });
}

// Welcome bubble and buttons at 1.5x and 2x text size. Emulated by scaling the root font size (every size in
// css/app.css is rem), the closest headless stand-in for iOS / Android larger text.
for (const k of [1.5, 2]) {
  test(`uiux hello text ${k}x`, async ({ page, viewport }, testInfo) => {
    await openScreen(page, SCREENS[0]);
    await page.evaluate((k) => { const h = document.documentElement; h.style.setProperty('font-size', `${parseFloat(getComputedStyle(h).fontSize) * k}px`, 'important'); }, k);
    await page.waitForTimeout(300);
    const findings = (await page.evaluate(audit, { safe: safeOf(viewport) })).map((f) => ({ ...f, check: `${f.check}@text${k}x` }));
    const bad = record(testInfo, `hello-text-${k}x`, findings);
    expect(bad, `hello at ${k}x text`).toEqual([]);
  });
}

// Layout modes at their specced trigger sizes. Spec: js/stage.js legacyStage(): portrait when vh > 1.05*vw,
// otherwise short when vh < 500, otherwise tall; "ptab" (tablet portrait) when portrait and vw >= 600; with
// the matching css/app.css breakpoints (orientation: portrait and min-width: 600px; landscape max-height: 499px /
// min-height: 500px). vw / vh are the safe rect. The trace card (.tcard) must then show whole inside the safe rect.
test('uiux layout mode and trace card at the trigger sizes', async ({ page, viewport }, testInfo) => {
  const [t, r, b, l] = insetsFor(viewport);
  const vw = viewport.width - l - r, vh = viewport.height - t - b;
  const want = vh > vw * 1.05 ? 'portrait' : vh < 500 ? 'short' : 'tall';
  await openScreen(page, SCREENS.find((x) => x.name === 'trace'));
  const got = await page.evaluate(() => {
    const st = document.getElementById('stage');
    const c = document.querySelector('.tcard').getBoundingClientRect();
    return { modes: ['portrait', 'short', 'tall'].filter((m) => st.classList.contains(m)), ptab: st.classList.contains('ptab'), card: { l: c.left, t: c.top, r: c.right, b: c.bottom, w: c.width, h: c.height } };
  });
  const findings = [];
  if (got.modes.join() !== want) findings.push({ check: 'layout-mode', element: '#stage', value: `${got.modes.join() || 'none'} != ${want} (safe ${vw}x${vh})` });
  if (got.ptab !== (want === 'portrait' && vw >= 600)) findings.push({ check: 'layout-mode', element: '#stage.ptab', value: `ptab=${got.ptab} at ${vw}x${vh}` });
  const c = got.card;
  if (c.l < l - 1 || c.t < t - 1 || c.r > viewport.width - r + 1 || c.b > viewport.height - b + 1 || c.w < 80 || c.h < 80) findings.push({ check: 'trace-card', element: '.tcard', value: `${Math.round(c.l)},${Math.round(c.t)} ${Math.round(c.w)}x${Math.round(c.h)} outside safe rect or too small` });
  const bad = record(testInfo, 'layout-mode', findings);
  expect(bad).toEqual([]);
});
