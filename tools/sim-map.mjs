#!/usr/bin/env node
// Planner-level playthrough of the whole map with a simulated child (no browser, no real data). Each planned item is
// "played" and logged the way its screen records it (letters-screen, word-screen, star-screen, sentence / story).
//   node tools/sim-map.mjs [--wrong 0.2] [--seed 1] [--root .] [--max 400] [--per-stop 40] [--json]
// Prints sessions spent at every map stop; a stop that takes more than --per-stop sessions is reported as STUCK.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export async function simulate({ wrong = 0, seed = 1, root = '.', maxSessions = 400, perStop = 40, gap = 8 * 3600e3, log: trace = null } = {}) {
  const imp = f => import(pathToFileURL(resolve(root, 'js', f)).href);
  const { planSession } = await imp('session.js'), { mapState, progressMarkers, STOPS } = await imp('progress.js');
  const { createStore } = await imp('mastery.js'), { supportFor, supportPattern, S } = await imp('support.js');
  const { memoryStorage } = await imp('dev-seed.js'), { roundTargets } = await imp('letter-logic.js');
  const ws = await imp('word-screen.js');
  const served = ws.servedSupport ?? (({ hasCheck, assist, ladder }) => (!hasCheck ? 4 : Math.max(assist ? 3 : 1, Math.min(4, ladder ?? 3))));
  let s0 = seed >>> 0 || 1; const rand = () => { s0 = (s0 * 1664525 + 1013904223) % 4294967296; return s0 / 4294967296; };
  const ok = () => rand() >= wrong;
  const store = createStore(memoryStorage(), 'k', 1e9); let t = new Date(2026, 10, 2, 9).getTime();
  const sync = () => { const add = progressMarkers(store.all(), { now: t }); if (add.length) store.logMany(add); };
  const per = STOPS.map(s => ({ id: s.id, label: s.label, kind: s.kind, sessions: 0 })); let total = 0;
  const L = r => { t += 3000; store.log({ timestamp: t, ...r }); sync(); };
  for (let n = 1; n <= maxSessions; n++) {
    const m = mapState(store.all(), t); if (m.done || m.index >= STOPS.length) break;
    const cur = per[m.index]; cur.sessions++; total++;
    if (cur.sessions > perStop) { cur.stuck = true; break; }
    const sid = `sim${n}`, plan = planSession(store.all(), { now: t, rand }), lines = [];
    for (const it of plan.items) {
      if (it.type === 'lesson') L({ skill: `${it.activity}:${it.gpc}`, itemId: it.gpc, correct: true, firstAttempt: true, scored: false, sessionId: sid });
      else if (it.type === 'letters') {
        if (it.activity !== 'hunt' && it.activity !== 'find') continue; // explore games are unscored
        for (const g of roundTargets(it.targets ?? it.pool, it.rounds ?? 4, rand)) { const c = ok(); L({ skill: `sound:${g}`, itemId: g, correct: c, firstAttempt: true, assisted: false, sessionId: sid }); lines.push(`${g}${c ? '+' : '-'}`); }
      } else if (it.type === 'words') for (const e of it.words) {
        const lv = it.level ?? e.level, lad = supportFor(store.all(), e, { sessionId: sid, now: t + 3000 });
        const sup = served({ hasCheck: true, assist: !!it.assist, ladder: lad.level }), mod = sup === S.MODEL, c = ok();
        L({ ...(it.apply ? { apply: it.apply } : {}), skill: `blend:L${lv}`, itemId: e.w, gpcs: e.parse?.split(' ') ?? [...e.w], correct: c, firstAttempt: true, assisted: false,
          scored: !mod, ...(mod ? { modelled: true } : {}), fast: false, sweepMs: 1800, latencyMs: 1500, support: sup, pattern: supportPattern(e), hints: 0, dotTaps: 0, helpUsed: false,
          sessionId: sid, ...(it.assist ? { stepBack: true } : {}), ...(it.stepBackFor ? { stepBackFor: it.stepBackFor } : {}) });
        lines.push(`L${lv}${it.assist ? 'a' : ''}S${sup}${c ? '+' : '-'}`);
      } else if (it.type === 'star') for (let k = 0; k < 3; k++) L({ skill: `star:${it.word}`, itemId: it.word, correct: ok(), firstAttempt: true, assisted: false, sessionId: sid });
      else if (it.type === 'family') L({ skill: `family:${it.family?.rime ?? it.family}`, itemId: 'f', correct: true, firstAttempt: true, scored: false, sessionId: sid });
      else if (it.type === 'story' || it.type === 'sentence') {
        const st = it.story, c = ok(), skill = st ? `${it.reread ? 'reread' : 'story'}:${st.id}` : `sentence:L${it.sentence.level}`;
        L({ skill, itemId: st?.id ?? it.sentence.id, correct: c, firstAttempt: true, scored: true, sessionId: sid });
        if (!c) L({ skill, itemId: st?.id ?? it.sentence.id, correct: true, firstAttempt: false, scored: false, sessionId: sid });
        lines.push(`${skill}${c ? '+' : '-'}`);
      }
    }
    trace?.(`#${n} ${cur.label} :: ${lines.join(' ')}`);
    t += gap;
  }
  const m = mapState(store.all(), t);
  return { per, total, done: m.done || m.index >= STOPS.length, at: m.index };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const r = await simulate({ wrong: +arg('--wrong', 0), seed: +arg('--seed', 1), root: arg('--root', '.'), maxSessions: +arg('--max', 400), perStop: +arg('--per-stop', 40),
    log: a.includes('--trace') ? console.log : null });
  if (a.includes('--json')) console.log(JSON.stringify(r));
  else { for (const [i, s] of r.per.entries()) console.log(`${String(i).padStart(2)} ${s.kind.padEnd(5)} ${String(s.label).padEnd(6)} ${s.sessions}${s.stuck ? ' STUCK' : ''}`); console.log(`total ${r.total} sessions, ${r.done ? 'map done' : 'stopped at ' + r.at}`); }
}
