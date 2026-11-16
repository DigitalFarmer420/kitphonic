// Startup Play accepts one attempt. Rapid taps must not each queue the welcome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHelloGate } from '../js/hello-gate.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

test('rapid starts: one unlock, one welcome, one transition', async () => {
  const gate = createHelloGate();
  let unlocks = 0, plays = 0, goes = 0;
  let releaseUnlock;
  const pending = new Promise(r => { releaseUnlock = r; });
  const start = () => gate.start({
    unlock: () => { unlocks++; return pending; },
    play: async () => { plays++; },
    go: () => { goes++; },
  });
  const runs = [start(), start(), start(), start(), start()];
  await wait(10);
  assert.equal(unlocks, 1);
  assert.equal(plays, 0);
  assert.equal(gate.phase, 'running');
  releaseUnlock();
  const results = await Promise.all(runs);
  assert.deepEqual(results, [true, false, false, false, false]);
  assert.equal(unlocks, 1);
  assert.equal(plays, 1);
  assert.equal(goes, 1);
  assert.equal(gate.phase, 'done');
  assert.equal(await gate.start({ unlock() {}, play() {}, go() {} }), false);
  assert.equal(plays, 1);
});

test('a failed unlock or welcome can be tried again; a success cannot', async () => {
  const gate = createHelloGate();
  await assert.rejects(() => gate.start({ unlock: async () => { throw new Error('slow manifest'); }, play() {}, go() {} }));
  assert.equal(gate.phase, 'idle');
  let plays = 0;
  await assert.rejects(() => gate.start({
    unlock: async () => {},
    play: async () => { plays++; throw new Error('decode'); },
    go() { throw new Error('should not transition'); },
  }));
  assert.equal(plays, 1);
  assert.equal(gate.phase, 'idle');
  let went = 0;
  assert.equal(await gate.start({ unlock: async () => {}, play: async () => { plays++; }, go: () => { went++; } }), true);
  assert.equal(plays, 2);
  assert.equal(went, 1);
  assert.equal(gate.phase, 'done');
  assert.equal(await gate.start({ unlock() {}, play() { plays++; }, go() { went++; } }), false);
  assert.equal(plays, 2);
  assert.equal(went, 1);
});

test('reset after a success arms another visit', async () => {
  const phases = [];
  const gate = createHelloGate({ onPhase: (next, from) => phases.push(`${from}->${next}`) });
  let plays = 0, goes = 0;
  const once = () => gate.start({ unlock: async () => {}, play: async () => { plays++; }, go: () => { goes++; } });
  for (let i = 0; i < 3; i++) {
    if (i) gate.reset();
    assert.equal(gate.phase, 'idle');
    assert.equal(await once(), true);
    assert.equal(await once(), false);
  }
  assert.equal(plays, 3);
  assert.equal(goes, 3);
  assert.deepEqual(phases, [
    'idle->running', 'running->done',
    'done->idle', 'idle->running', 'running->done',
    'done->idle', 'idle->running', 'running->done',
  ]);
});

test('reset during a greeting drops that attempt', async () => {
  const gate = createHelloGate();
  let release;
  const hold = new Promise(r => { release = r; });
  let plays = 0, goes = 0;
  const first = gate.start({ unlock: () => hold, play: async () => { plays++; }, go: () => { goes++; } });
  assert.equal(gate.phase, 'running');
  gate.reset();
  release();
  assert.equal(await first, false);
  assert.equal(plays, 0);
  assert.equal(goes, 0);
  assert.equal(gate.phase, 'idle');
  assert.equal(await gate.start({ unlock: async () => {}, play: async () => { plays++; }, go: () => { goes++; } }), true);
  assert.equal(plays, 1);
  assert.equal(goes, 1);
});

test('welcome playback in flight ignores more starts and still transitions once', async () => {
  const gate = createHelloGate();
  let releasePlay, plays = 0, goes = 0;
  const playHold = new Promise(r => { releasePlay = r; });
  const first = gate.start({ unlock: async () => {}, play: () => { plays++; return playHold; }, go: () => { goes++; } });
  await wait(5);
  assert.equal(await gate.start({ unlock() {}, play() { plays++; }, go() { goes++; } }), false);
  assert.equal(plays, 1);
  assert.equal(goes, 0);
  releasePlay();
  assert.equal(await first, true);
  assert.equal(goes, 1);
  assert.equal(plays, 1);
});
