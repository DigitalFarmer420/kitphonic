// rc7: the map never moves the child backwards (owner bug: after "at" the map went back two steps).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapState, progressMarkers, slippedStops, stopPassedLive, starCount, STOPS } from '../js/progress.js';
import { createStore, DAY, knownGpcs, blendingUnlocked } from '../js/mastery.js';
import { planSession } from '../js/session.js';
import { parentSummary } from '../js/parent.js';
import { seedProgress, memoryStorage } from '../js/dev-seed.js';
import { servableWords } from '../js/progress.js';

const KEY = 'kitphonic.v1.responses';
function child(t0 = Date.now() - 5 * DAY) { // a tiny app: log + sync markers after every response (like js/app.js)
  const storage = memoryStorage(), store = createStore(storage); let t = t0, scanned = -Infinity;
  const sync = () => { const all = store.all(), add = progressMarkers(all, { since: scanned, now: t }); scanned = Math.max(scanned, ...all.map(r => r.timestamp)); store.logMany(add); };
  const say = (skill, correct, extra = {}) => { store.log({ skill, itemId: skill.split(':')[1], correct, firstAttempt: true, scored: true, timestamp: t += 4000, sessionId: extra.sessionId ?? 's1', ...extra }); sync(); };
  return { storage, store, say, sync, get t() { return t; }, set t(v) { t = v; }, map: () => mapState(store.all(), t) };
}
const passAt = c => { for (const g of ['m', 's', 'a', 't']) for (let i = 0; i < 5; i++) c.say('sound:' + g, true);
  for (const w of ['at', 'am', 'at', 'am', 'at']) c.say('blend:L1', true, { itemId: w }); };

test('owner repro: "at" passed, then two slips on t — rc6 walked back to t (2 steps), rc7 stays at p', () => {
  const c = child(); passAt(c);
  assert.equal(c.map().current.id, 'sound:p');
  c.say('sound:t', false); c.say('sound:t', false); // a mixed review hunt: Rosie taps the wrong letter twice
  const live = c.store.all().filter(r => !r.marker); // what rc6 computed (no markers)
  assert.equal(mapState(live, c.t).current.id, 'sound:t', 'rc6 behaviour: the cat walks back to t');
  assert.equal(c.map().current.id, 'sound:p', 'rc7: completed steps stay passed');
  assert.deepEqual(slippedStops(c.store.all(), c.t).map(s => s.id), ['sound:t']);
  assert.ok(knownGpcs(c.store.all(), c.t).has('t') && blendingUnlocked(c.store.all(), c.t), 'a passed sound stays taught');
});

test('a pass and a slip inside the same session (no sync in between) are still caught by the replay', () => {
  const store = createStore(memoryStorage()); let t = Date.now() - DAY;
  const add = (skill, correct) => store.log({ skill, itemId: skill.split(':')[1], correct, firstAttempt: true, scored: true, timestamp: t += 4000, sessionId: 'x' });
  for (const g of ['m', 's', 'a', 't']) for (let i = 0; i < 5; i++) add('sound:' + g, true);
  add('sound:t', false); add('sound:t', false);
  assert.equal(mapState(store.all(), t).current.id, 'sound:t'); // nothing synced yet
  store.logMany(progressMarkers(store.all(), { now: t }));
  assert.equal(mapState(store.all(), t).current.id, 'words:L1', 'replay: t was passed for a while -> stays passed');
});

test('every exit path keeps progress: natural finish, home button mid-session, reload (new store on the same storage)', () => {
  const c = child(); passAt(c); const at = c.map().index;
  // home mid-session = no more responses; reload = a fresh store + boot replay on the same storage
  const reload = () => { const s = createStore(c.storage); s.logMany(progressMarkers(s.all(), { now: c.t })); return mapState(s.all(), c.t).index; };
  assert.equal(reload(), at);
  c.say('sound:p', false); c.say('sound:a', false); c.say('sound:a', false); assert.equal(reload(), at);
  c.t += 3 * DAY; assert.equal(reload(), at, 'days later (review due) the map is unchanged');
  // a progress log from an older rc on the same device, with markers stripped: the boot replay restores them
  const old = createStore(memoryStorage({ [KEY]: JSON.stringify(c.store.all().filter(r => !r.marker)) }));
  old.logMany(progressMarkers(old.all(), { now: c.t })); assert.equal(mapState(old.all(), c.t).index, at);
});

test('migration: rc4 / rc5 / rc6 saved logs (no markers) restore the furthest stop ever reached', () => {
  // the three rcs wrote the same response shape to kitphonic.v1.responses; rc4 lacked `fast`, rc6 adds `apply` tags
  const shapes = {
    rc4: r => { const { fast, ...x } = r; return x; },
    rc5: r => ({ ...r, latencyMs: 1500 }),
    rc6: r => ({ ...r, latencyMs: 1500, fast: false }),
  };
  for (const [rc, shape] of Object.entries(shapes)) for (const n of [3, 5, 9, 14]) {
    const now = Date.now(), log = seedProgress(n, { now: now - DAY }).map(shape);
    const furthest = mapState(log, now).index;
    let t = now; const slip = STOPS.slice(0, n).filter(s => s.kind === 'sound').slice(-2).map(s => s.gpc);
    for (const g of slip) for (let i = 0; i < 6; i++) log.push(shape({ skill: `sound:${g}`, itemId: g, correct: false, firstAttempt: true, scored: true, timestamp: t += 1000, sessionId: 'late' }));
    assert.ok(mapState(log, t).index < furthest, `${rc}/${n}: the rolled-back state the device may hold`);
    const store = createStore(memoryStorage({ [KEY]: JSON.stringify(log) }));
    store.logMany(progressMarkers(store.all(), { now: t }));
    assert.equal(mapState(store.all(), t).index, furthest, `${rc}/${n}: furthest stop restored`);
  }
});

test('replay: never behind the furthest position ever shown, and every marker was truly earned at its time', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let run = 0; run < 6; run++) {
    const log = []; let t = Date.now() - 10 * DAY;
    for (let i = 0; i < 160; i++) {
      const sk = ['sound:m', 'sound:s', 'sound:a', 'sound:t', 'blend:L1', 'sound:p', 'blend:L2'][Math.floor(rnd() * 7)];
      log.push({ skill: sk, itemId: 'x', correct: rnd() < 0.78, firstAttempt: true, scored: true, timestamp: t += 30000 + rnd() * DAY / 8, sessionId: `s${Math.floor(i / 20)}` });
    }
    let best = 0; for (let i = 1; i <= log.length; i++) best = Math.max(best, mapState(log.slice(0, i), log[i - 1].timestamp).index); // rc6, brute force
    const marks = progressMarkers(log, { now: t });
    assert.ok(mapState([...log, ...marks], t).index >= best, `run ${run}: behind the furthest stop ever shown`);
    marks.forEach((m, j) => { // earned in map order, on the evidence up to that moment (earlier markers count as taught)
      assert.equal(m.itemId, STOPS[j].id);
      assert.ok(stopPassedLive([...log.filter(r => r.timestamp <= m.timestamp), ...marks.slice(0, j)], STOPS[j], m.timestamp), `run ${run}: ${m.itemId} not earned`);
    });
  }
});

test('long multi-day simulation through the real planner: map position and stars never decrease', () => {
  let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const c = child(Date.now() - 40 * DAY); let last = -1, lastStars = -1, reviews = 0;
  for (let day = 0; day < 30; day++) {
    c.t = Date.now() - (40 - day) * DAY;
    for (let s = 0; s < 2; s++) {
      const sid = `d${day}s${s}`, plan = planSession(c.store.all(), { now: c.t, rand: rnd, minutes: 7 });
      for (const it of plan.items) {
        if (it.why === 'review') reviews++;
        if (it.type === 'letters' && it.targets) for (let r = 0; r < it.rounds; r++) c.say(`sound:${it.targets[r % it.targets.length]}`, rnd() < 0.8, { sessionId: sid });
        else if (it.type === 'words') for (const w of it.words) c.say(it.level ? `blend:L${it.level}` : `blend:L1`, rnd() < 0.8, { sessionId: sid, itemId: w.w, ...(it.apply ? { apply: it.apply } : {}) });
        else if (it.type === 'story') c.say(`story:${it.story.id}`, true, { sessionId: sid });
        else if (it.type === 'star') c.say(`star:${it.word}`, rnd() < 0.85, { sessionId: sid });
        const m = c.map(), st = starCount(c.store.all(), c.t);
        assert.ok(m.index >= last, `day ${day + 1}: map moved back ${last} -> ${m.index}`); assert.ok(st >= lastStars, `day ${day + 1}: stars went down`);
        last = m.index; lastStars = st;
      }
    }
  }
  assert.ok(last >= 8, `the child makes real progress (reached stop ${last})`); assert.ok(reviews > 0, 'review happens inside sessions');
});

test('slipped sound: quick review in the next session (labelled), parent view says review due, map unchanged', () => {
  const c = child(); passAt(c); c.say('sound:t', false); c.say('sound:t', false);
  const plan = planSession(c.store.all(), { now: c.t, rand: () => 0.5 });
  const rev = plan.items.find(i => i.why === 'review'); assert.ok(rev && rev.targets.includes('t'), 'review hunt includes t');
  assert.equal(plan.stop.id, 'sound:p', 'the session still teaches the next new sound');
  const p = parentSummary(c.store.all(), c.t);
  assert.equal(p.soundTiles.find(x => x.id === 't').state, 'review-due'); assert.equal(p.stop.label, 'p');
});

test('store cap trims old responses but never the map markers; a parent skip marker moves on one step', () => {
  const store = createStore(memoryStorage(), 'k', 50); let t = 1;
  store.log({ skill: 'stop:sound:m', marker: true, timestamp: t++ });
  for (let i = 0; i < 120; i++) store.log({ skill: 'sound:s', correct: true, firstAttempt: true, scored: true, timestamp: t++ });
  assert.equal(store.all().length, 50); assert.ok(store.all().some(r => r.skill === 'stop:sound:m'));
  const c = child(); passAt(c); const i = c.map().index;
  c.store.log({ skill: `stop:${c.map().current.id}`, marker: true, parent: true, correct: true, firstAttempt: true, scored: false, timestamp: c.t + 1 });
  assert.equal(c.map().index, i + 1);
});
