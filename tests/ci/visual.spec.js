import { test, expect } from '@playwright/test';
import { SCREENS, VISUAL_SCREENS, openScreen } from './screens.js';

// Committed pixel baselines (job "visual", blocking). Baselines live in tests/ci/__screenshots__/<project>/ and are
// made on the GitHub ubuntu-latest runner (fonts come from fonts/, so text is the same everywhere; emoji come from the
// runner image). Tolerance: per-pixel threshold 0.2 and at most 0.2% of pixels different, animations disabled,
// reduced motion, the pointing-hand hint hidden. A PR that changes the UI on purpose refreshes them: add the label
// "visual:update" to the PR, download the "visual-baselines-*" artifacts from that run, and commit them.
for (const name of VISUAL_SCREENS) {
  test(`visual ${name}`, async ({ page }) => {
    await openScreen(page, SCREENS.find((s) => s.name === name));
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: false, timeout: 15_000 });
  });
}
