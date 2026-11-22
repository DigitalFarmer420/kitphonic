// A simulated child for the full-map playthrough: plays the visible session through the real UI (mouse taps,
// slider drags, letter traces along the tracer's own points), like tools/play-session.py's drive(). No dev
// shortcuts: every response is logged by the app's own lesson logic.
//   wrong: chance of a wrong pick before the right one on a scored letter round / word check (realistic child).

export const visibleScreen = (page) => page.evaluate(() => [...document.querySelectorAll('.screen')].find((s) => !s.hidden)?.id ?? null);

async function drag(page, x0, y0, x1, y1, steps = 40, ms = 45) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let k = 1; k <= steps; k++) { await page.mouse.move(x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps); await page.waitForTimeout(ms); }
  await page.mouse.up();
}
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);

// One step on the current screen. Returns the screen id it acted on.
export async function step(page, scr, rng, wrong) {
  const w = (ms) => page.waitForTimeout(ms);
  if (scr === 'letters') {
    const st = await page.evaluate(() => { const r = window.kitphonic.letters.run; return r && { scored: !!r.def.scored, target: r.target, busy: !!r.busy }; });
    if (!st || st.busy) return w(300);
    if (st.scored) {
      await w(700); // think time (> fast-pick guard)
      if (wrong && rng() < wrong) {
        const other = (await page.evaluate(() => [...document.querySelectorAll('.ltr')].map((e) => e.dataset.l))).filter((l) => l !== st.target);
        if (other.length) { await page.locator(`.ltr[data-l="${other[Math.floor(rng() * other.length)]}"] .tile`).first().click({ force: true }); await w(1500); }
      }
      await page.locator(`.ltr[data-l="${st.target}"] .tile`).first().click({ force: true }); return w(1100);
    }
    for (const t of (await page.locator('.ltr .tile').all()).slice(0, 4)) { await t.click({ force: true }).catch(() => {}); await w(250); }
    await w(300);
    if (await visible(page, '#l-next')) await page.locator('#l-next').click();
    return;
  }
  if (scr === 'lesson') {
    if (await visible(page, '#intro')) {
      await w(600); await page.locator('#ic-letter').click(); await w(400); await page.locator('#ic-pic').click(); await w(400); await page.locator('#ic-next').click(); return w(400);
    }
    if (await visible(page, '#tr-next')) { await page.locator('#tr-next').click(); return w(400); }
    const pts = await page.evaluate(() => window.kitphonic.lesson.run?.debugPoints?.() ?? []);
    if (!pts.length) return w(300);
    await page.mouse.move(...pts[0]); await page.mouse.down();
    for (const [x, y] of pts.slice(1)) { await page.mouse.move(x, y); await w(12); }
    await page.mouse.up(); return w(250);
  }
  if (scr === 'family') {
    const st = await page.evaluate(() => { const r = window.kitphonic.familyScreen.run; return r && { busy: !!r.busy, left: document.querySelectorAll('#fm-tray .ftile:not(.made)').length }; });
    if (!st || st.busy || !st.left) return w(300);
    const t = page.locator('#fm-tray .ftile:not(.made)').first();
    if (st.left % 2) { // alternate: drag, then tap-to-place
      const a = await t.boundingBox(), z = await page.locator('#fm-slot').boundingBox();
      await drag(page, a.x + a.width / 2, a.y + a.height / 2, z.x + z.width / 2, z.y + z.height / 2, 20, 20);
    } else { await t.click(); await w(200); await page.locator('#fm-slot').click(); }
    return w(800);
  }
  if (scr === 'star') {
    const st = await page.evaluate(() => { const r = window.kitphonic.starScreen.run; return r && { busy: !!r.busy, w: r.star.w, cards: document.querySelectorAll('#st-cards .wcard2').length }; });
    if (!st || st.busy || !st.cards) return w(300);
    await w(800); await page.locator(`#st-cards .wcard2[data-w="${st.w}"]`).click(); return w(1300);
  }
  if (scr === 'sentence') {
    const st = await page.evaluate(() => { const r = window.kitphonic.sentenceScreen.run; return r && { i: r.i, kind: r.tokens[r.i]?.kind, blend: !!r.ms, read: !document.getElementById('sn-read').disabled, reading: !!r.reading }; });
    if (!st || st.reading) return w(400);
    if (await visible(page, '#sn-choices')) {
      const pic = await page.evaluate(() => { const r = window.kitphonic.sentenceScreen.run; return r.story ? r.story.ask.answer : r.sent.pic; });
      await w(400); await page.locator(`#sn-choices .pc[data-pic="${pic}"]`).first().click(); return w(1200);
    }
    if (st.read) { await page.locator('#sn-read').click(); return w(800); }
    if (await visible(page, '#sn-next')) { await w(500); await page.locator('#sn-next').click(); return w(600); }
    if (st.kind === 'star') { await w(500); await page.locator('#sn-strip .wd').nth(st.i).click(); return w(900); }
    if (st.blend && await visible(page, '#sn-handle')) {
      const hb = await page.locator('#sn-handle').boundingBox(), tb = await page.locator('#sn-tiles .tile').last().boundingBox();
      const y = hb.y + hb.height / 2; await drag(page, hb.x + hb.width / 2, y, tb.x + tb.width + 8, y); return w(900);
    }
    return w(300);
  }
  if (scr === 'word') {
    const state = await page.evaluate(() => window.kitphonic.screen.state);
    if (state === 'slide') {
      const hb = await page.locator('#handle').boundingBox(), tb = await page.locator('#tiles').boundingBox();
      if (!hb || !tb) return w(300);
      const y = hb.y + hb.height / 2; await drag(page, hb.x + hb.width / 2, y, tb.x + tb.width - 2, y); return w(500);
    }
    if (state === 'check') {
      await w(800);
      const wd = await page.evaluate(() => window.kitphonic.screen.entry.w);
      if (wrong && rng() < wrong) {
        const others = await page.locator(`.choice:not([data-w="${wd}"])`).all();
        if (others.length) { await others[Math.floor(rng() * others.length)].click({ force: true }).catch(() => {}); await w(1500); }
      }
      if (await page.evaluate(() => window.kitphonic.screen.state) === 'check') await page.locator(`.choice[data-w="${wd}"]`).first().click().catch(() => {});
      return w(900);
    }
    if (state === 'revealed' && await visible(page, '#next')) { await page.locator('#next').click(); return w(400); }
    return w(300);
  }
  return w(300);
}

// Play the session on screen until the done screen or the map after a level-up. Returns { end, seen, stuckOn }.
// A session that sits on one screen + state for stuckMs, or runs past timeoutMs, is reported as stuck.
export async function playSession(page, { timeoutMs = 420_000, stuckMs = 90_000, rng = Math.random, wrong = 0 } = {}) {
  const t0 = Date.now(), seen = []; let lastSig = '', sigSince = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const scr = await visibleScreen(page);
    if (scr === 'done') return { end: 'done', seen };
    if (scr === 'levelup') {
      if (seen.at(-1) !== scr) seen.push(scr);
      await page.waitForTimeout(1700); await page.locator('#lv-next').click(); await page.waitForTimeout(1500);
      seen.push('map'); return { end: 'levelup', seen };
    }
    if (seen.at(-1) !== scr) seen.push(scr);
    // stall guard: screen + its run's state / response count unchanged for too long
    const sig = await page.evaluate(() => { const k = window.kitphonic; return JSON.stringify([[...document.querySelectorAll('.screen')].find((s) => !s.hidden)?.id, k.screen?.state, k.lesson?.run?.activity, k.letters?.run?.activity, k.letters?.run?.target, k.sentenceScreen?.run?.i, k.store.all().length]); });
    if (sig !== lastSig) { lastSig = sig; sigSince = Date.now(); }
    else if (Date.now() - sigSince > stuckMs) return { end: 'stuck', seen, stuckOn: sig };
    try { await step(page, scr, rng, wrong); } catch (e) { await page.waitForTimeout(300); if (Date.now() - sigSince > stuckMs) return { end: 'stuck', seen, stuckOn: `${sig} ${e.message.split('\n')[0]}` }; }
  }
  return { end: 'timeout', seen, stuckOn: lastSig };
}

// Small seeded PRNG so a realistic-child run is repeatable.
export const mulberry32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
