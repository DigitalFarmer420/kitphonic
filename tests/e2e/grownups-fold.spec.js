import { test, expect } from '@playwright/test';

// AC-G1 on a real engine. check-sizes covers the B1 matrix (Chromium) and the
// CDP-before-load path; this covers WebKit's layout of the same CSS variables.
const URL = '/?skipHello=1&progress=5&parent=1';

async function speedRow(page) {
  return page.evaluate(() => {
    const row = document.querySelector('button[data-k="audioSpeed"]')?.closest('.prow');
    const port = row?.closest('.pcol') || document.getElementById('pa-body');
    const pr = port.getBoundingClientRect();
    const parent = document.getElementById('parent');
    const padB = parseFloat(getComputedStyle(parent).paddingBottom) || 0;
    const label = row.querySelector('.plabel').getBoundingClientRect();
    const buttons = [...row.querySelectorAll('button')].map(el => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { name: el.textContent.trim(), top: r.top, bottom: r.bottom, hit: hit === el || el.contains(hit) };
    });
    return {
      label: { top: label.top, bottom: label.bottom },
      buttons, portTop: pr.top, portBottom: pr.bottom,
      safeBottom: innerHeight - padB, scroll: port.scrollTop,
      fit: parent.classList.contains('pa-fit'),
      aria: parent.querySelector('.pa-settings')?.getAttribute('aria-label'),
    };
  });
}

function g1Failures(g) {
  const limit = Math.min(g.portBottom, g.safeBottom);
  const bad = [];
  if (g.label.top < g.portTop - 0.5 || g.label.bottom > g.portBottom + 0.5) bad.push('label outside the scrollport');
  for (const b of g.buttons) {
    if (b.top < g.portTop - 0.5 || b.bottom > limit + 0.5) bad.push(`${b.name} ${b.top.toFixed(0)}-${b.bottom.toFixed(0)} past ${limit.toFixed(0)}`);
    if (!b.hit) bad.push(`${b.name} centre missed`);
  }
  if (g.scroll) bad.push('not default scroll');
  if (Math.abs(g.safeBottom - 272) > 1.5) bad.push(`safe bottom ${g.safeBottom}`);
  if (!g.fit || g.aria !== 'Settings') bad.push('settings heading not folded into the card label');
  return bad;
}

test('AC-G1 speed row at 568x320 with CSS inset variables', async ({ page, browserName }, testInfo) => {
  test.skip(!['chromium-phone', 'webkit-phone'].includes(testInfo.project.name), 'one Chromium and one WebKit');
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('button[data-k="audioSpeed"]');
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty('--safe-area-inset-top', '24px');
    s.setProperty('--safe-area-inset-right', '0px');
    s.setProperty('--safe-area-inset-bottom', '48px');
    s.setProperty('--safe-area-inset-left', '0px');
  });
  await page.waitForTimeout(100);
  const g = await speedRow(page);
  const ys = g.buttons.flatMap(b => [b.top, b.bottom]);
  console.log(`AC-G1 ${browserName} CSS vars speed y ${Math.min(...ys).toFixed(0)}-${Math.max(...ys).toFixed(0)}`);
  expect(g1Failures(g)).toEqual([]);
});

test('AC-G1 speed row with safe-area env() set before load', async ({ browser, browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-phone', 'CDP safe-area override is Chromium');
  const context = await browser.newContext({ viewport: { width: 568, height: 320 }, hasTouch: true });
  const page = await context.newPage();
  try {
    const client = await context.newCDPSession(page);
    await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 24, right: 0, bottom: 48, left: 0 } });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForSelector('button[data-k="audioSpeed"]');
    await page.waitForTimeout(200);
    const env = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.documentElement.appendChild(probe);
      const cs = getComputedStyle(probe);
      return { top: cs.paddingTop, bottom: cs.paddingBottom, vars: document.documentElement.style.getPropertyValue('--safe-area-inset-top') };
    });
    expect(env).toEqual({ top: '24px', bottom: '48px', vars: '' });
    const g = await speedRow(page);
    const ys = g.buttons.flatMap(b => [b.top, b.bottom]);
    console.log(`AC-G1 ${browserName} env() speed y ${Math.min(...ys).toFixed(0)}-${Math.max(...ys).toFixed(0)}`);
    expect(g1Failures(g)).toEqual([]);
  } finally {
    await context.close();
  }
});
