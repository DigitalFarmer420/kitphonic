import { test, expect } from '@playwright/test';

// The path is the whole 56-stop course; this check is the open-and-scroll contract.
const ready = () => !document.getElementById('map').hidden && document.querySelectorAll('#m-stops > .stop').length === 56;

test('map scrolls through every stop and a passed stop replays without changing progress', async ({ page }) => {
  await page.goto('/?skipHello=1&reducedMotion=1&progress=12&seed=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(ready, null, { timeout: 20_000 });

  const before = await page.evaluate(() => {
    const k = window.kitphonic, m = k.map(), board = document.getElementById('m-board');
    const cur = document.querySelector('.stop.current'), r = cur.getBoundingClientRect(), b = board.getBoundingClientRect();
    return {
      index: m.index,
      passed: m.stops.filter(s => s.status === 'passed').length,
      n: k.store.all().length,
      currentInView: r.bottom > b.top + 2 && r.top < b.bottom - 2 && r.right > b.left + 2 && r.left < b.right - 2,
      canScrollY: board.scrollHeight > board.clientHeight + 20,
      canScrollX: board.scrollWidth > board.clientWidth + 20,
    };
  });
  expect(before.passed).toBe(12);
  expect(before.currentInView).toBe(true);
  expect(before.canScrollY || before.canScrollX).toBe(true);

  // Scroll toward the start of the path (down in portrait, left in landscape) and replay the first passed stop.
  await page.locator('#m-board').evaluate(el => {
    el.scrollTop = el.scrollHeight;
    el.scrollLeft = 0;
  });
  const first = page.locator('#m-stops > .stop.passed').first();
  await expect(first).toBeVisible();
  await first.click();
  await page.waitForFunction(() => document.getElementById('map').hidden, null, { timeout: 10_000 });
  const mid = await page.evaluate(() => ({
    screen: [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id,
    practice: window.kitphonic.session?.practice === true,
    n: window.kitphonic.store.all().length,
  }));
  expect(mid.practice).toBe(true);
  expect(mid.n).toBe(before.n);
  expect(['lesson', 'letters', 'word', 'sentence']).toContain(mid.screen);

  const home = { lesson: '#ls-home', letters: '#l-home', word: '#home', sentence: '#sn-home' }[mid.screen];
  await page.locator(home).click();
  await page.waitForFunction(ready, null, { timeout: 10_000 });
  const after = await page.evaluate(() => {
    const k = window.kitphonic, m = k.map(), board = document.getElementById('m-board');
    const cur = document.querySelector('.stop.current'), r = cur.getBoundingClientRect(), b = board.getBoundingClientRect();
    return {
      index: m.index,
      passed: m.stops.filter(s => s.status === 'passed').length,
      n: k.store.all().length,
      practice: k.session?.practice ?? false,
      currentInView: r.bottom > b.top + 2 && r.top < b.bottom - 2 && r.right > b.left + 2 && r.left < b.right - 2,
    };
  });
  expect(after.index).toBe(before.index);
  expect(after.passed).toBe(12);
  expect(after.n).toBe(before.n);
  expect(after.practice).toBe(false);
  expect(after.currentInView).toBe(true);

  // A locked future stop does nothing.
  await page.locator('#m-board').evaluate(el => { el.scrollTop = 0; el.scrollLeft = el.scrollWidth; });
  const upcoming = page.locator('#m-stops > .stop.upcoming').last();
  await expect(upcoming).toBeVisible();
  await upcoming.click({ force: true }); // aria-disabled (locked) would otherwise block Playwright's click
  const stayed = await page.evaluate(() => ({
    map: !document.getElementById('map').hidden,
    index: window.kitphonic.map().index,
    n: window.kitphonic.store.all().length,
  }));
  expect(stayed.map).toBe(true);
  expect(stayed.index).toBe(before.index);
  expect(stayed.n).toBe(before.n);
});
