import test from 'node:test';
import assert from 'node:assert/strict';
import { needsTurn, MIN_STACK, viewportBox, createTurnGate, resumeClock } from '../js/turn.js';
import { stageFor } from '../js/stage.js';
import { stageBox } from '../js/safe-insets.js';

test('the turn card is only for a safe height that cannot hold the floors', () => {
  assert.equal(needsTurn(MIN_STACK - 1), true);
  assert.equal(needsTurn(MIN_STACK), false);
  assert.equal(needsTurn(320), true); // 568×320 with the bar hidden
  assert.equal(needsTurn(240), true); // 568×320 Wi
  assert.equal(needsTurn(192), true); // 568×320 W
  assert.equal(needsTurn(360), false); // 780×360 still fits
  assert.equal(needsTurn(387), false); // 320×568 W WebKit: 568 - 100 - 47 - 34
});

test('visualViewport wins over the layout viewport, including the address-bar offset', () => {
  const view = {
    innerWidth: 390, innerHeight: 844,
    visualViewport: { width: 390, height: 744, offsetLeft: 0, offsetTop: 50 },
  };
  const box = viewportBox(view);
  assert.deepEqual(box, { w: 390, h: 744, x: 0, y: 50 });
  const stage = stageBox(box.w, box.h, { top: 47, right: 0, bottom: 34, left: 0 }, stageFor);
  const top = box.y + stage.cy - stage.h / 2;
  assert.ok(top >= 50 + 47 - 1, `stage top ${top} is under the address bar`);
  assert.equal(needsTurn(box.h - 47 - 34), false);
});

test('the turn card pauses the activity and resumes it in place', () => {
  const activity = { step: 2, x: 40 };
  let pauses = 0, resumes = 0;
  const gate = createTurnGate({
    onPause() { pauses++; activity.held = activity.step; activity.heldX = activity.x; },
    onResume() { resumes++; assert.equal(activity.step, activity.held); assert.equal(activity.x, activity.heldX); },
  });
  assert.equal(gate.active, false);
  gate.update(192);
  assert.equal(gate.active, true);
  assert.equal(pauses, 1);
  gate.update(180); // still too short: do not pause again or restart
  assert.equal(pauses, 1);
  assert.equal(activity.step, 2);
  gate.update(800);
  assert.equal(gate.active, false);
  assert.equal(resumes, 1);
  assert.equal(activity.step, 2);
  assert.equal(activity.x, 40);
});

test('a paused clock resumes at the same frame', () => {
  const clock = { t0: 1000, pausedAt: null };
  resumeClock(clock, 1500, true);
  resumeClock(clock, 1800, true);
  assert.equal(clock.t0, 1000);
  assert.equal(clock.pausedAt, 1500);
  resumeClock(clock, 2000, false);
  assert.equal(clock.t0, 1500);
  assert.equal(clock.pausedAt, null);
});
