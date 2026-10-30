import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWindow, mapLayout, levelUpChips, GO, NOW_R, TEASERS } from '../js/map-layout.js';
import { STOPS, mapState } from '../js/progress.js';
import { stageFor } from '../js/stage.js';
import { seedProgress } from '../js/dev-seed.js';

const VPS = [[360, 780], [390, 844], [780, 360], [844, 390], [820, 1180], [1180, 820], [667, 375]];
test('map window: current stop visible, <= 6 stops, the stories teaser (📖) appears at the end', () => {
  for (let n = 0; n <= STOPS.length; n++) {
    const win = mapWindow(mapState(seedProgress(n)).stops, n);
    assert.ok(win.length <= 6);
    if (n < STOPS.length) assert.equal(win.filter(s => s.now).length, 1);
  }
  const end = mapWindow(STOPS.map(s => ({ ...s, status: 'passed' })), STOPS.length);
  assert.deepEqual(end.slice(-TEASERS.length).map(s => s.label), TEASERS.map(t => t.label));
});
test('map layout: stops never overlap each other, the top bar or the ▶ button; all on stage', () => {
  for (const [vw, vh] of VPS) for (let n = 0; n <= STOPS.length; n++) {
    const s = stageFor(vw, vh), pts = mapLayout(mapWindow(mapState(seedProgress(n)).stops, n), s);
    const goTop = s.h - GO.bottom - GO.h, goL = s.w / 2 - GO.w / 2, goR = s.w / 2 + GO.w / 2;
    for (const p of pts) {
      assert.ok(p.x - p.r >= 0 && p.x + p.r <= s.w && p.y - p.r >= 86, `${vw}x${vh} n=${n} ${p.label} off stage/top bar`);
      assert.ok(p.y + p.r <= goTop - 4 || p.x + p.r < goL || p.x - p.r > goR, `${vw}x${vh} n=${n} ${p.label} under ▶`);
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
      assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= pts[i].r + pts[j].r + 6, `${vw}x${vh} n=${n} ${pts[i].label}/${pts[j].label} overlap`);
  }
});
test('level-up chips: words read right at that level, else the sounds learned', () => {
  const words = STOPS.find(s => s.id === 'words:L2');
  const rs = ['mat', 'sat', 'mat', 'tap', 'pat'].map((w, i) => ({ skill: 'blend:L2', itemId: w, correct: true, gpcs: [...w], timestamp: i }));
  assert.deepEqual(levelUpChips(words, rs, STOPS).map(c => c.text), ['pat', 'tap', 'mat']);
  const t = STOPS.find(s => s.gpc === 't');
  assert.deepEqual(levelUpChips(t, [], STOPS).map(c => c.clip), ['snd-s', 'snd-a', 'snd-t']);
});
