import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { playSession, mulberry32 } from './child.js';
import { startServer } from './server.js';

// Full-map playthrough (release gate): a fresh device plays real sessions, through the real UI, until every one of
// the 56 map stops (sound m ... the story "lunch on the bench") is passed, in map order. No dev shortcuts (no
// ?progress=, dev-seed or activity jumps): each stop is earned by the app's own lesson logic and recorded as its
// map marker. A stop that is not passed within KP_PT_CAP sessions, or a session that stalls, fails the test with
// the stop id, sessions, trials, skill accuracy, screen state, a screenshot and the last console lines.
//   KP_PT_BASE   app URL (default: an in-process server for this checkout, ./server.js), e.g. the production site
//   KP_PT_WRONG  realistic child: chance of a wrong pick first (default 0 = perfect child)
//   KP_PT_CAP    sessions allowed per stop (default 12)    KP_PT_OUT  report folder
const WRONG = +(process.env.KP_PT_WRONG || 0), CAP = +(process.env.KP_PT_CAP || 12), SEED = +(process.env.KP_PT_SEED || 1);

test('a fresh child passes all 56 map stops in order', async ({ page, browserName }, testInfo) => {
  const local = process.env.KP_PT_BASE ? null : await startServer();
  const base = process.env.KP_PT_BASE || local.url;
  const out = process.env.KP_PT_OUT || testInfo.outputPath('playthrough');
  fs.mkdirSync(out, { recursive: true });
  const rng = mulberry32(SEED), logs = [], report = { base, browser: browserName, wrong: WRONG, cap: CAP, started: new Date().toISOString(), stops: [], sessions: [], result: 'running' };
  const save = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`.slice(0, 400)); if (logs.length > 60) logs.shift(); });
  page.on('pageerror', (e) => { logs.push(`[pageerror] ${e.message}`.slice(0, 400)); if (logs.length > 60) logs.shift(); });
  const url = () => `${base}${base.includes('?') ? '&' : '?'}skipHello=1&reducedMotion=1&minutes=5&_=${Date.now()}`;
  // Map + the current stop's evidence, from the app's own modules (read-only).
  const mapInfo = () => page.evaluate(async () => {
    const k = window.kitphonic, P = await import(new URL('js/progress.js', location.href).href), M = await import(new URL('js/mastery.js', location.href).href);
    const rs = k.store.all(), m = k.map(), marked = M.passedStopIds(rs);
    const evid = (s) => { const r = P.stopResponses(rs, s).filter((x) => x.skill === s.skill); const st = s.kind === 'story' ? null : M.skillState(P.stopResponses(rs, s), s.skill);
      return { id: s.id, kind: s.kind, label: s.label, status: s.status, marker: marked.has(s.id), responses: r.length, trials: st?.trials ?? r.filter((x) => x.firstAttempt).length, accuracy: st ? Math.round(st.accuracy * 100) : null, state: st?.state ?? null }; };
    return { total: m.stops.length, index: m.index, done: m.done, current: m.current && evid(m.current), passed: m.stops.filter((s) => s.status === 'passed').map((s) => s.id), markers: [...marked], stops: m.stops.map((s) => ({ id: s.id, kind: s.kind, label: s.label, title: s.title })) };
  });
  const fail = async (why, extra = {}) => {
    const shot = path.join(out, `FAIL-${(extra.stop || 'x').replace(/[:/]/g, '_')}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const state = await page.evaluate(() => { const k = window.kitphonic; return { screen: [...document.querySelectorAll('.screen')].find((s) => !s.hidden)?.id, word: k.screen?.state, lesson: k.lesson?.run?.activity, letters: k.letters?.run?.activity, plan: k.session?.plan?.items?.map((i) => `${i.type}:${i.activity || i.level || ''}`) }; }).catch((e) => ({ error: e.message }));
    Object.assign(report, { result: 'fail', why, failure: { ...extra, screenshot: shot, state, console: logs.slice(-30) }, finished: new Date().toISOString() }); save();
    expect(false, `${why}\n${JSON.stringify(report.failure, null, 1)}`).toBe(true);
  };

  await page.goto(url(), { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.kitphonic?.store, null, { timeout: 30_000 });
  const first = await mapInfo();
  expect(first.passed.length, 'fresh profile: nothing passed yet').toBe(0);
  expect(first.total, 'the map has 56 stops').toBe(56);
  report.map = first.stops; save();

  const perStop = new Map(); let n = 0, last = first;
  while (!last.done) {
    const cur = last.current, k = perStop.get(cur.id) ?? { sessions: 0, t0: Date.now(), before: cur };
    if (k.sessions >= CAP) await fail(`stop ${last.index + 1}/56 ${cur.id} ("${cur.label}") not passed after ${CAP} sessions`, { stop: cur.id, index: last.index + 1, sessions: k.sessions, evidence: cur });
    k.sessions++; perStop.set(cur.id, k); n++;
    const t = Date.now();
    const s = await (async () => {
      await page.goto(url(), { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.kitphonic?.store, null, { timeout: 30_000 });
      await page.locator('#go').waitFor({ state: 'visible', timeout: 20_000 });
      await page.locator('#go').click();
      return playSession(page, { rng, wrong: WRONG });
    })().catch((e) => ({ end: 'error', seen: [], stuckOn: e.message.split('\n')[0] }));
    if (s.end === 'error') await fail(`session ${n} on stop ${last.index + 1}/56 ${cur.id} ("${cur.label}") errored: ${s.stuckOn}`, { stop: cur.id, index: last.index + 1, sessions: k.sessions, evidence: cur });
    const after = await mapInfo();
    report.sessions.push({ n, stop: cur.id, end: s.end, secs: Math.round((Date.now() - t) / 1000), screens: s.seen.join('>'), passedAfter: after.passed.length, current: after.current });
    if (s.end !== 'done' && s.end !== 'levelup') await fail(`session ${n} on stop ${last.index + 1}/56 ${cur.id} ("${cur.label}") ${s.end}: ${s.stuckOn}`, { stop: cur.id, index: last.index + 1, sessions: k.sessions, evidence: after.current, screens: s.seen });
    if (after.passed.length < last.passed.length) await fail(`map moved back after session ${n}: ${last.passed.length} -> ${after.passed.length}`, { stop: cur.id });
    for (const id of after.passed.filter((x) => !last.passed.includes(x))) {
      const ps = perStop.get(id) ?? { sessions: 0, t0: Date.now() };
      const i = after.stops.findIndex((x) => x.id === id);
      report.stops.push({ index: i + 1, id, label: after.stops[i].label, kind: after.stops[i].kind, sessions: ps.sessions, secs: Math.round((Date.now() - ps.t0) / 1000), marker: after.markers.includes(id), atSession: n });
      if (!after.markers.includes(id)) await fail(`stop ${id} shows passed but has no map marker`, { stop: id });
    }
    save(); last = after;
  }
  await page.screenshot({ path: path.join(out, 'map-all-passed.png'), fullPage: true });
  Object.assign(report, { result: 'pass', sessionsTotal: n, finished: new Date().toISOString() }); save();
  await local?.close();
  expect(last.passed.length).toBe(56);
  expect(report.stops.map((s) => s.id)).toEqual(first.stops.map((s) => s.id)); // passed strictly in map order
});
