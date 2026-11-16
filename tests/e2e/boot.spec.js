import { test, expect } from '@playwright/test';

// A child of the control (the play icon inside the button) still counts as
// hitting that control. Another element on top of the centre does not.
async function hitTest(page) {
  return page.evaluate(() => {
    const sel = 'button, [role="slider"], a[href], input, select, textarea';
    const visible = (el) => {
      if (el.closest('[hidden]')) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
      const r = el.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1;
    };
    const name = (el) => (el.id ? `#${el.id}` : (el.getAttribute('aria-label') || el.tagName.toLowerCase()));
    const controls = [...document.querySelectorAll(sel)].filter(visible);
    const misses = [];
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit !== el && !(hit && el.contains(hit))) {
        misses.push(`${name(el)} centre ${Math.round(x)},${Math.round(y)} hit ${hit ? name(hit) : 'nothing'}`);
      }
    }
    return { n: controls.length, names: controls.map(name), misses };
  });
}

test('boots with no console errors, no failed requests, and hittable controls', async ({ page }) => {
  const errors = [];
  const failed = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('requestfailed', (req) => {
    failed.push(`${req.failure()?.errorText || 'failed'} ${req.url()}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.kitphonic && document.getElementById('play'));

  const screens = await page.locator('.screen').evaluateAll((nodes) => nodes.map((el) => ({
    id: el.id,
    hidden: el.hidden,
    display: getComputedStyle(el).display,
  })));
  const hello = screens.find((s) => s.id === 'hello');
  expect(hello, 'hello screen').toBeTruthy();
  expect(hello.hidden).toBe(false);
  expect(hello.display).not.toBe('none');
  for (const screen of screens) {
    if (screen.id === 'hello') continue;
    expect(screen.hidden, screen.id).toBe(true);
    expect(screen.display, `${screen.id} is display:none while hidden`).toBe('none');
  }

  const hits = await hitTest(page);
  expect(hits.n, `visible controls: ${hits.names.join(', ')}`).toBeGreaterThan(0);
  expect(hits.misses).toEqual([]);

  const audio404 = failed.filter((line) => /\/audio\//.test(line));
  expect(audio404, 'audio clips must not 404').toEqual([]);
  expect(failed, 'failed requests').toEqual([]);
  expect(errors, 'console or page errors').toEqual([]);
});
