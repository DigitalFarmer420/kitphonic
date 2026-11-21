// No-overlap check (Vinh, Nov 20: "things cannot overlap"). Every flow screen x window size x device text size:
// no two controls / words / bubbles / Kit / cards may overlap, nothing may be clipped (safe area, a clipping box),
// no own text may run out of a clipping box, Kit's bubbles never scroll, and Kit's Hello paw stays on Kit.
// Scrollable columns (Grown-ups) may hold rows below the fold; the scroll box itself is checked instead.
// Runs in CI as the "overlap" group: tests/ci/playwright.ci.config.js projects overlap-{chromium,webkit}-WxH.
// The window size comes from the project; text sizes are the dev param ?textScale (the app honours up to 2x).
import { test, expect } from '@playwright/test';
import { overlapAudit } from './overlap-audit.js';
import { OVERLAP_SCREENS, OVERLAP_SCALES, openOverlapScreen } from './overlap-matrix.js';

for (const s of OVERLAP_SCREENS) {
  for (const k of OVERLAP_SCALES) {
    test(`${s.name} @ text ${k}x`, async ({ page, browserName }, info) => {
      const scales = info.project.metadata?.scales;
      test.skip(scales && !scales.includes(k), `${browserName} runs text ${scales?.join(', ')}x`);
      const vp = page.viewportSize();
      const safe = await openOverlapScreen(page, s, k, vp);
      const findings = await page.evaluate(overlapAudit, { safe });
      if (findings.length) await info.attach(`${s.name}-${vp.width}x${vp.height}-x${k}.png`, { body: await page.screenshot(), contentType: 'image/png' });
      expect(findings.map((f) => `${f.check}: ${f.element} (${f.value})`), `${s.name} at ${vp.width}x${vp.height}, text ${k}x`).toEqual([]);
    });
  }
}
