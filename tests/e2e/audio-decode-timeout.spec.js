import { test, expect } from '@playwright/test';

// Mirrors the WebKit gap in /workspace/kitphonic-qa/hello-return-webkit/REPORT.md:
// resume() rejects with InvalidStateError and decodeAudioData never settles. Unlock used
// to wait on that decode with no timeout, so #play stayed .going and the map never appeared.
// A complete fake AudioContext is installed before the app boots so CI WebKit (which has a
// working audio device) cannot bypass the stub the way a patched native instance can.
test('hung decode plus failed resume still reaches the map', async ({ page }) => {
  await page.addInitScript(() => {
    class KitHungAudioContext {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      resume() {
        return Promise.reject(new DOMException('Failed to start the audio device', 'InvalidStateError'));
      }
      decodeAudioData() { return new Promise(() => {}); }
      createBufferSource() {
        return { playbackRate: { value: 1 }, connect() {}, start() {}, stop() {}, onended: null };
      }
      createOscillator() {
        return { frequency: { value: 0 }, type: 'sine', connect() { return this; }, start() {}, stop() {} };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } };
      }
    }
    window.AudioContext = KitHungAudioContext;
    window.webkitAudioContext = KitHungAudioContext;
    window.__kitDecodeHangStub = true;
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.kitphonic?.helloGate && window.__kitDecodeHangStub);
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
    unlocked: !!window.kitphonic.audio.unlocked,
    hellos: (window.__kitAudioLog || []).filter(e => e.id === 'm-hello').map(e => e.via),
  }));
  expect(state.screen).toBe('map');
  expect(state.phase).toBe('done');
  expect(state.mapHidden).toBe(false);
  expect(state.unlocked).toBe(false);
  expect(state.hellos).toEqual([]);
});
