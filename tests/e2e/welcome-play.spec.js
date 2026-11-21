import { test, expect } from '@playwright/test';

// KP-BUG-005: after the first Play tap the greeting continues on its own.
// While Kit's line is up, Play must be gone (not a faded control kids can still tap).
// The speaker stays. Releasing the held line still opens the map with no second tap.
const GREETING = "Hi! I'm Kit. Let's read together!";

test.use({ viewport: { width: 1024, height: 768 } });

test('welcome Play hides after the first tap at 1024x768', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/?reducedMotion=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.kitphonic?.helloGate && document.getElementById('play'));
  expect(page.viewportSize()).toEqual({ width: 1024, height: 768 });
  const size = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  expect(size).toEqual({ w: 1024, h: 768 });

  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('#speaker')).toBeVisible();
  await expect(page.locator('#hello-bubble')).not.toHaveText(GREETING);

  const before = await page.evaluate(() => {
    const play = document.getElementById('play');
    const speaker = document.getElementById('speaker');
    const measure = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    };
    return { play: measure(play), speaker: measure(speaker) };
  });
  expect(before.play.w).toBeGreaterThan(40);
  expect(before.speaker.w).toBeGreaterThan(20);

  await page.evaluate(() => {
    const audio = window.kitphonic.audio;
    const orig = audio.play.bind(audio);
    let release;
    const held = new Promise(r => { release = r; });
    window.__helloPlays = [];
    window.__releaseHello = () => release();
    audio.unlock = async () => 'running';
    audio.play = (id, opts) => {
      window.__helloPlays.push(id);
      if (id === window.kitphonic.cfg.hello.greetingClip) return held;
      return orig(id, opts);
    };
  });

  await page.locator('#play').click();
  await page.waitForFunction(() => window.__helloPlays.includes('m-hello') && window.kitphonic.helloGate.phase === 'running');

  await expect(page.locator('#hello')).toBeVisible();
  await expect(page.locator('#hello-bubble')).toHaveText(GREETING);
  await expect(page.locator('#play')).toBeHidden();
  await expect(page.locator('#play')).toBeDisabled();
  await expect(page.locator('#speaker')).toBeVisible();
  await expect(page.locator('#speaker')).toBeEnabled();

  const mid = await page.evaluate(({ x, y }) => {
    const play = document.getElementById('play');
    const speaker = document.getElementById('speaker');
    const cs = getComputedStyle(play);
    const ss = getComputedStyle(speaker);
    const sr = speaker.getBoundingClientRect();
    const sx = sr.left + sr.width / 2;
    const sy = sr.top + sr.height / 2;
    const hit = document.elementFromPoint(x, y);
    const shit = document.elementFromPoint(sx, sy);
    const pr = play.getBoundingClientRect();
    return {
      display: cs.display,
      pointerEvents: cs.pointerEvents,
      hidden: play.hidden,
      disabled: play.disabled,
      playW: pr.width,
      playH: pr.height,
      hitPlay: !!(hit && (hit.id === 'play' || play.contains(hit))),
      speakerHit: !!(shit && (shit.id === 'speaker' || speaker.contains(shit))),
      speakerDisabled: speaker.disabled,
      speakerHidden: speaker.hidden,
      speakerPointer: ss.pointerEvents,
      speakerDisplay: ss.display,
      speaker: { x: sr.x, y: sr.y, w: sr.width, h: sr.height },
      phase: window.kitphonic.helloGate.phase,
      plays: window.__helloPlays.slice(),
      screen: [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id,
    };
  }, { x: before.play.cx, y: before.play.cy });

  expect(mid.screen).toBe('hello');
  expect(mid.display).toBe('none');
  expect(mid.pointerEvents).toBe('none');
  expect(mid.hidden).toBe(true);
  expect(mid.disabled).toBe(true);
  expect(mid.playW).toBe(0);
  expect(mid.playH).toBe(0);
  expect(mid.hitPlay).toBe(false);
  expect(mid.speakerHit).toBe(true);
  expect(mid.speakerDisabled).toBe(false);
  expect(mid.speakerHidden).toBe(false);
  expect(mid.speakerPointer).not.toBe('none');
  expect(mid.speakerDisplay).not.toBe('none');
  const round = (b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
  expect(round(mid.speaker)).toEqual(round(before.speaker));
  expect(mid.phase).toBe('running');
  expect(mid.plays).toEqual(['m-hello']);

  await page.mouse.click(before.play.cx, before.play.cy);
  const afterTap = await page.evaluate(() => ({
    phase: window.kitphonic.helloGate.phase,
    plays: window.__helloPlays.slice(),
    hidden: document.getElementById('play').hidden,
    disabled: document.getElementById('play').disabled,
    screen: [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id,
    bubble: document.getElementById('hello-bubble').textContent,
  }));
  expect(afterTap).toEqual({
    phase: 'running',
    plays: ['m-hello'],
    hidden: true,
    disabled: true,
    screen: 'hello',
    bubble: GREETING,
  });

  await page.evaluate(() => window.__releaseHello());
  await page.waitForFunction(() => !document.getElementById('map').hidden && window.kitphonic.helloGate.phase === 'done');
  await expect(page.locator('#hello')).toBeHidden();
  await expect(page.locator('#map')).toBeVisible();
  const end = await page.evaluate(() => window.__helloPlays.slice());
  expect(end).toEqual(['m-hello']);
});
