// The trace hint used to schedule its next run 5 s after it started, which cut the ~9 s walk short.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGhostHand, hintWait } from '../js/ghost-hand.js';

test('hintWait lets the demonstration finish before the idle gap', () => {
  assert.equal(hintWait(0, 0, 5000), 5000);
  assert.equal(hintWait(1000, 8700, 5000), 12700);
  assert.equal(hintWait(9000, 8700, 5000), 5000, 'once the walk has ended, only the idle gap remains');
});

test('the hint does not restart until its path and the idle gap have both elapsed', () => {
  const pending = [];
  const schedule = (fn, ms) => { const t = { fn, ms }; pending.push(t); return t; };
  const clear = t => { const i = pending.indexOf(t); if (i >= 0) pending.splice(i, 1); };
  let clock = 0;
  const host = { append() {} };
  const hand = createGhostHand({
    host, idleMs: 5000, schedule, clear, now: () => clock,
    reduced: () => false,
  });
  globalThis.document = { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {}, remove() {} }) };
  const points = [[0, 0], [10, 0], [20, 0], [30, 0]]; // hide at 900 + 4*260 = 1940 with the trace step
  let walks = 0;
  hand.start(() => { walks += 1; return points; }, { now: true, stepMs: 260 });
  assert.equal(walks, 1);
  const idle = pending.filter(t => t.ms > 1000).sort((a, b) => b.ms - a.ms)[0];
  assert.ok(idle, 'an idle restart is scheduled');
  assert.equal(idle.ms, 1940 + 5000, 'the restart waits out the walk, then the idle gap');
  clock = 1000;
  idle.fn();
  assert.equal(walks, 1, 'firing early, while the walk is still going, does not start another');
  clock = 1940 + 5000;
  const again = pending.filter(t => t.fn !== idle.fn && t.ms > 1000).pop();
  again.fn();
  assert.equal(walks, 2);
  hand.stop();
  delete globalThis.document;
});
