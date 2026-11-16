import { test, expect } from '@playwright/test';

// Mirrors the WebKit gap in /workspace/kitphonic-qa/hello-return-webkit/REPORT.md:
// resume() rejects with InvalidStateError and decodeAudioData never settles. Unlock used
// to wait on that decode with no timeout, so #play stayed .going and the map never appeared.
// The stub is injected before the app boots so this is reproducible on Chromium and WebKit.
// Chromium often starts AudioContext already 'running', so after the hung decode times out
// play() may fall back to a short tone (via 'tone') and still reach the map.
test('hung decode plus failed resume still reaches the map', async ({ page }) => {
  await page.addInitScript(() => {
    const Orig = window.AudioContext || window.webkitAudioContext;
    if (!Orig || Orig.__kitDecodeHang) return;
    const wrap = function AudioContextHang(...args) {
      const ctx = new Orig(...args);
      ctx.resume = () => Promise.reject(new DOMException('Failed to start the audio device', 'InvalidStateError'));
      ctx.decodeAudioData = () => new Promise(() => {});
      return ctx;
    };
    wrap.__kitDecodeHang = true;
    wrap.prototype = Orig.prototype;
    window.AudioContext = wrap;
    window.webkitAudioContext = wrap;
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.kitphonic?.helloGate);
  await page.locator('#play').click();
  const t0 = Date.now();
  // JS budget is ~1.7 s (DECODE_MS + RESUME_MS). Allow extra for WebKit under load;
  // the unfixed path never reached the map at all.
  await page.waitForFunction(() => !document.getElementById('map').hidden, null, { timeout: 5000 });
  expect(Date.now() - t0, 'map should appear well before a hung unlock').toBeLessThan(5000);
  const state = await page.evaluate(() => ({
    screen: [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id,
    phase: window.kitphonic.helloGate.phase,
    mapHidden: document.getElementById('map').hidden,
    hellos: (window.__kitAudioLog || []).filter(e => e.id === 'm-hello'),
  }));
  expect(state.screen).toBe('map');
  expect(state.phase).toBe('done');
  expect(state.mapHidden).toBe(false);
  // The recorded take must not play: the decode never settled. A running context may tone.
  expect(state.hellos.every(e => e.via === 'tone')).toBe(true);
});
