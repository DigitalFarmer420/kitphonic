import { test, expect } from '@playwright/test';

// KP-BUG-002: Play, then the map house button, then Play again. The second Play used to
// leave #play.going (pointer-events: none) and the hello gate stuck on "done".
async function waitForMap(page) {
  await page.waitForFunction(
    () => !document.getElementById('map').hidden && !window.kitphonic.audio.busy,
    null,
    { timeout: 20_000 },
  );
}

async function helloArmed(page) {
  return page.evaluate(() => {
    const p = document.getElementById('play');
    const r = p.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      going: p.classList.contains('going'),
      disabled: p.getAttribute('aria-disabled'),
      busy: p.getAttribute('aria-busy'),
      phase: window.kitphonic.helloGate.phase,
      hit: !!(hit && (hit.id === 'play' || p.contains(hit))),
      screen: [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id,
    };
  });
}

test('session log is absent unless ?sessionlog=1', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.kitphonic);
  await expect(page.locator('#kit-sessionlog')).toHaveCount(0);
  const log = await page.evaluate(() => window.kitphonic.sessionLog);
  expect(log).toBeNull();
});

test('Play, map Home, Play reaches the map three times', async ({ page, browserName }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kitphonic.v1.responses', JSON.stringify([
      { skill: 'sound:s', itemId: 's', correct: true, firstAttempt: true, scored: true, timestamp: 1, sessionId: 'keep' },
    ]));
  });
  await page.goto('/?sessionlog=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.kitphonic?.helloGate);

  const overlay = await page.evaluate(() => {
    const root = document.getElementById('kit-sessionlog');
    const toggle = document.getElementById('kit-sessionlog-toggle');
    const copy = document.getElementById('kit-sessionlog-copy');
    const view = document.getElementById('kit-sessionlog-view');
    const cs = getComputedStyle;
    return {
      present: !!root,
      open: root.dataset.open,
      root: cs(root).pointerEvents,
      toggle: cs(toggle).pointerEvents,
      copyHidden: !!copy.hidden,
      viewHidden: !!view.hidden,
      viewH: view.style.height,
    };
  });
  expect(overlay).toEqual({
    present: true, open: 'false', root: 'none', toggle: 'auto',
    copyHidden: true, viewHidden: true, viewH: '96px',
  });

  const before = await page.evaluate(() => (window.__kitAudioLog || []).filter(e => e.id === 'm-hello').length);
  await page.evaluate(() => { const b = document.getElementById('play'); b.click(); b.click(); });
  if (browserName === 'webkit') {
    await page.waitForTimeout(1500);
    const early = await page.evaluate(() => ({
      map: !document.getElementById('map').hidden,
      unlocked: !!window.kitphonic.audio.unlocked,
      phase: window.kitphonic.helloGate.phase,
      audio: window.kitphonic.sessionLog.entries.filter(e => e.kind === 'audio').map(e => e.detail),
    }));
    test.skip(!early.map && !early.unlocked, `headless WebKit did not resume AudioContext (${early.audio.join('>') || 'no state'}); phase ${early.phase}`);
  }
  await waitForMap(page);
  const firstHellos = await page.evaluate((n) => (window.__kitAudioLog || []).filter(e => e.id === 'm-hello').length - n, before);
  // After the decode timeout fix, a runner with no audio device reaches the map with
  // unlocked===false and 0 m-hello. That used to fail expect(m-hello).toBe(1) because
  // the 1500 ms skip only fired when the map was still hidden. A runner that actually
  // plays audio (unlocked or m-hello logged) still asserts exactly one greeting.
  if (browserName === 'webkit') {
    const after = await page.evaluate(() => ({
      unlocked: !!window.kitphonic.audio.unlocked,
      phase: window.kitphonic.helloGate.phase,
      audio: window.kitphonic.sessionLog.entries.filter(e => e.kind === 'audio').map(e => e.detail),
    }));
    test.skip(firstHellos === 0 && !after.unlocked, `headless WebKit did not resume AudioContext (${after.audio.join('>') || 'no state'}); phase ${after.phase}`);
  }
  expect(firstHellos).toBe(1);

  for (let i = 0; i < 3; i++) {
    const seen = await page.evaluate(() => (window.__kitAudioLog || []).filter(e => e.id === 'm-hello').length);
    await page.locator('#m-home').click();
    await page.waitForFunction(() => !document.getElementById('hello').hidden);
    const armed = await helloArmed(page);
    expect(armed).toEqual({ going: false, disabled: null, busy: null, phase: 'idle', hit: true, screen: 'hello' });
    await page.locator('#play').click();
    await waitForMap(page);
    const added = await page.evaluate((n) => (window.__kitAudioLog || []).filter(e => e.id === 'm-hello').length - n, seen);
    expect(added).toBe(1);
  }

  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('kitphonic.v1.responses') || '[]').some(r => r.sessionId === 'keep'));
  expect(kept).toBe(true);
  const kinds = await page.evaluate(() => [...new Set(window.kitphonic.sessionLog.entries.map(e => e.kind))]);
  expect(kinds).toEqual(expect.arrayContaining(['hello', 'screen', 'tap', 'visibility', 'audio']));
  const helloPhases = await page.evaluate(() => window.kitphonic.sessionLog.entries.filter(e => e.kind === 'hello').map(e => e.detail));
  expect(helloPhases).toContain('done->idle');
  expect(helloPhases.filter(p => p === 'idle->running').length).toBeGreaterThanOrEqual(3);
});
