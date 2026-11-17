import test from 'node:test';
import assert from 'node:assert/strict';
import { needsTurn, screenHmin, viewportBox, createTurnGate, resumeClock } from '../js/turn.js';
import { stageFor } from '../js/stage.js';
import { stageBox } from '../js/safe-insets.js';

const land = { portrait: false }, port = { portrait: true };

test('each screen has its own Hmin and the card shows only under that height', () => {
  assert.equal(screenHmin('star', land), 150);
  assert.equal(screenHmin('trace', land), 176);
  assert.equal(screenHmin('lesson', { ...land, trace: true }), 176);
  assert.equal(screenHmin('lesson', land), 224); // intro
  assert.equal(screenHmin('sentence', land), 236);
  assert.equal(screenHmin('map', land), 224);
  assert.equal(screenHmin('letters', land), 224);
  assert.equal(screenHmin('word', land), 224);
  assert.equal(screenHmin('word', { ...land, letters: 5 }), 244);
  assert.equal(screenHmin('family', { ...land, family: 7 }), 244);
  assert.equal(screenHmin('family', { ...land, family: 4 }), 0);
  assert.equal(screenHmin('hello', land), 0);
  assert.equal(screenHmin('word', port), 376);
  assert.equal(screenHmin('star', port), 344);
  assert.equal(screenHmin('sentence', port), 352);
  assert.equal(screenHmin('family', { ...port, family: 7 }), 382);

  const show = (screen, safe, opts) => needsTurn(safe, screenHmin(screen, opts));
  // L1 is the only landscape miss for map, word, letters and intro.
  for (const screen of ['map', 'word', 'letters']) {
    assert.equal(show(screen, 192, land), true, screen);
    assert.equal(show(screen, 232, land), false, screen);
    assert.equal(show(screen, 248, land), false, screen);
    assert.equal(show(screen, 320, land), false, screen);
  }
  assert.equal(show('lesson', 192, land), true);
  assert.equal(show('lesson', 232, land), false);
  assert.equal(show('lesson', 192, { ...land, trace: true }), false);
  // 5-letter words and family-7 miss L2, and stay open at 568×320 S.
  assert.equal(show('word', 240, { ...land, letters: 5 }), true);
  assert.equal(show('word', 248, { ...land, letters: 5 }), false);
  assert.equal(show('family', 240, { ...land, family: 7 }), true);
  assert.equal(show('family', 248, { ...land, family: 7 }), false);
  assert.equal(show('family', 232, { ...land, family: 7 }), true);
  // sentence misses 232 and fits 240. star and trace fit L1.
  assert.equal(show('sentence', 232, land), true);
  assert.equal(show('sentence', 240, land), false);
  assert.equal(show('star', 192, land), false);
  assert.equal(show('trace', 192, land), false);
  // 568×320 P and S never show the card. Portrait 387 fits every screen.
  for (const screen of ['hello', 'map', 'word', 'letters', 'sentence', 'star', 'family']) {
    assert.equal(show(screen, 320, { ...land, letters: 5, family: 7 }), false, screen);
    assert.equal(show(screen, 248, { ...land, letters: 5, family: 7 }), false, screen);
    assert.equal(show(screen, 387, { ...port, letters: 5, family: 7 }), false, screen);
  }
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
  assert.equal(needsTurn(box.h - 47 - 34, screenHmin('word', port)), false);
});

test('the turn card pauses the activity and resumes it in place', () => {
  const activity = { step: 2, x: 40 };
  let pauses = 0, resumes = 0;
  const gate = createTurnGate({
    onPause() { pauses++; activity.held = activity.step; activity.heldX = activity.x; },
    onResume() { resumes++; assert.equal(activity.step, activity.held); assert.equal(activity.x, activity.heldX); },
  });
  assert.equal(gate.active, false);
  gate.update(192, 224);
  assert.equal(gate.active, true);
  assert.equal(pauses, 1);
  gate.update(180, 224); // still too short: do not pause again or restart
  assert.equal(pauses, 1);
  assert.equal(activity.step, 2);
  gate.update(800, 224);
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
