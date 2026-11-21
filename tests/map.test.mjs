import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWindow, mapStops, mapLayout, mapMetrics, mapScroll, mapStep, boardInsets, levelUpChips, TEASERS, WINDOW } from '../js/map-layout.js';
import { STOPS, mapState, starCount } from '../js/progress.js';
import { stageFor } from '../js/stage.js';
import { seedProgress } from '../js/dev-seed.js';
import { skillState } from '../js/mastery.js';
import { planReplay } from '../js/session.js';
import { rng } from '../js/word-logic.js';

const VPS = [[320, 568], [360, 780], [390, 844], [780, 360], [844, 390], [820, 1180], [1180, 820], [667, 375]];
test('map window: current stop visible, <= 6 stops, the map ends on the story stops', () => {
  for (let n = 0; n <= STOPS.length; n++) {
    const win = mapWindow(mapState(seedProgress(n)).stops, n);
    assert.ok(win.length <= 6);
    if (n < STOPS.length) assert.equal(win.filter(s => s.now).length, 1);
  }
  const end = mapWindow(STOPS.map(s => ({ ...s, status: 'passed' })), STOPS.length);
  if (TEASERS.length) assert.deepEqual(end.slice(-TEASERS.length).map(s => s.label), TEASERS.map(t => t.label));
  assert.equal(end.at(-1).kind, 'story'); // the map ends on the last little story
});
test('map stops: the whole course is on the trail', () => {
  assert.equal(STOPS.length, 56);
  for (let n = 0; n <= STOPS.length; n++) {
    const pts = mapStops(mapState(seedProgress(n)).stops, n);
    assert.equal(pts.length, STOPS.length);
    if (n < STOPS.length) {
      assert.equal(pts.filter(s => s.now).length, 1);
      assert.equal(pts[n].now, true);
    } else assert.equal(pts.filter(s => s.now).length, 0);
  }
});
test('map layout: every stop is on the trail, never overlapping; the focused stop sits in the 6-stop slot, clear of ▶ and the top bar', () => {
  for (const [vw, vh] of VPS) for (let n = 0; n <= STOPS.length; n++) {
    const s = stageFor(vw, vh), mstate = mapState(seedProgress(n));
    const pts = mapLayout(mapStops(mstate.stops, mstate.index), s);
    const metrics = mapMetrics(s), band = boardInsets(s), { step } = mapStep(s);
    const sc = mapScroll(pts, s, mstate.done ? pts.length - 1 : mstate.index);
    const goL = s.w / 2 - metrics.goW / 2, goR = s.w / 2 + metrics.goW / 2;
    assert.equal(pts.length, STOPS.length);
    for (const p of pts) {
      assert.ok(p.x - p.r >= -1 && p.x + p.r <= p.contentW + 1 && p.y - p.r >= -1 && p.y + p.r <= p.contentH + 1,
        `${vw}x${vh} n=${n} ${p.label} off the trail`);
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
      assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) + 0.5 >= pts[i].r + pts[j].r + 6, `${vw}x${vh} n=${n} ${pts[i].label}/${pts[j].label} overlap`);
    if (s.mode === 'portrait') assert.ok(pts[0].contentH > band.boardH + step * 2, `${vw}x${vh} trail should be taller than the board`);
    else assert.ok(pts[0].contentW > band.boardW + step * 2, `${vw}x${vh} trail should be wider than the board`);
    const cur = pts.find(p => p.now) ?? pts.at(-1);
    const stageX = cur.x - sc.left, stageY = cur.y - sc.top + band.boardTop;
    const start = Math.max(0, Math.min((mstate.done ? STOPS.length - 1 : mstate.index) - 2, Math.max(0, STOPS.length - WINDOW)));
    const k = (mstate.done ? STOPS.length - 1 : mstate.index) - start;
    const wantY = Math.max(band.boardTop + metrics.nowR, Math.min(band.boardTop + band.boardH - metrics.nowR, metrics.bottom - k * step));
    const wantX = Math.max(metrics.nowR, Math.min(band.boardW - metrics.nowR, 90 * s.u + k * step));
    if (s.mode === 'portrait') assert.ok(Math.abs(stageY - wantY) < 1.5, `${vw}x${vh} n=${n} current y ${stageY} vs ${wantY}`);
    else assert.ok(Math.abs(stageX - wantX) < 1.5, `${vw}x${vh} n=${n} current x`);
    assert.ok(stageY - cur.r >= band.boardTop - 1.5, `${vw}x${vh} n=${n} current under the top bar`);
    assert.ok(stageY + cur.r <= metrics.goTop + 1.5 || stageX + cur.r < goL || stageX - cur.r > goR, `${vw}x${vh} n=${n} current under ▶`);
  }
});
test('level-up chips: words read right at that level, else the sounds learned', () => {
  const words = STOPS.find(s => s.id === 'words:L2');
  const rs = ['mat', 'sat', 'mat', 'tap', 'pat'].map((w, i) => ({ skill: 'blend:L2', itemId: w, correct: true, gpcs: [...w], timestamp: i }));
  assert.deepEqual(levelUpChips(words, rs, STOPS).map(c => c.text), ['pat', 'tap', 'mat']);
  const t = STOPS.find(s => s.gpc === 't');
  assert.deepEqual(levelUpChips(t, [], STOPS).map(c => c.clip), ['snd-s', 'snd-a', 'snd-t']);
});
test('planReplay: a passed sound, words or story stop is practice-only for that lesson', () => {
  const now = Date.UTC(2026, 9, 30, 17), rs = seedProgress(12, { now }), map = mapState(rs, now);
  const sound = map.stops[0], plan = planReplay(rs, sound, { now, rand: rng(1) });
  assert.equal(plan.practice, true);
  assert.ok(plan.items.length >= 2);
  assert.ok(plan.items.every(i => i.why === 'practice'));
  assert.ok(plan.items.some(i => i.type === 'lesson' && i.activity === 'intro' && i.gpc === sound.gpc));
  const words = map.stops.find(s => s.id === 'words:L1');
  assert.equal(words.status, 'passed');
  const wp = planReplay(rs, words, { now, rand: rng(1) });
  assert.ok(wp.items.every(i => i.type === 'words' && i.level === 1 && i.why === 'practice'));
  assert.ok(wp.items[0].words.length >= 2);
  // a late story, once reached, is a reread of that story
  const end = seedProgress(STOPS.length, { now }), last = STOPS.at(-1);
  const sp = planReplay(end, { ...last, status: 'passed' }, { now, rand: rng(1) });
  assert.ok(sp.items.some(i => i.type === 'story' && i.story.id === last.story && i.reread && i.why === 'practice'));
});
test('practice records never change stars, the current stop, or mastery', () => {
  const now = Date.UTC(2026, 9, 30, 17), rs = seedProgress(12, { now });
  const before = mapState(rs, now), stars = starCount(rs, now);
  const skills = ['sound:m', 'sound:s', 'blend:L1'];
  const states = Object.fromEntries(skills.map(s => [s, skillState(rs, s, now).state]));
  const extra = [
    { skill: 'sound:m', itemId: 'm', correct: false, firstAttempt: false, scored: false, practice: true, timestamp: now + 1, sessionId: 'p-1' },
    { skill: 'sound:m', itemId: 'm', correct: false, firstAttempt: false, scored: false, practice: true, timestamp: now + 2, sessionId: 'p-1' },
    { skill: 'blend:L1', itemId: 'at', correct: false, firstAttempt: false, scored: false, practice: true, timestamp: now + 3, sessionId: 'p-1' },
  ];
  const after = [...rs, ...extra];
  const map = mapState(after, now + 4);
  assert.equal(map.index, before.index);
  assert.equal(starCount(after, now + 4), stars);
  assert.equal(map.stops.filter(s => s.status === 'passed').length, 12);
  for (const s of skills) assert.equal(skillState(after, s, now + 4).state, states[s], s);
});
