import test from 'node:test';
import assert from 'node:assert/strict';
import { STROKES, createTracer, resample } from '../js/trace.js';
import { PROTOTYPE_SET } from '../js/sequence.js';

const follow = (tr, noise = 0, seed = 1) => {
  let r = seed; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * noise;
  let last;
  for (const P of tr.strokes) { tr.down(P[0][0], P[0][1]); for (const p of P) last = tr.move(p[0] + rnd(), p[1] + rnd()); tr.up(); }
  return last;
};
test('every prototype letter has strokes inside the 100x180 box', () => {
  for (const l of PROTOTYPE_SET) {
    assert.ok(STROKES[l]?.length, l);
    for (const s of STROKES[l]) for (const [x, y] of resample(s)) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 180, `${l} ${x},${y}`);
  }
});
test('following the path (with finger wobble) completes each letter', () => {
  for (const l of Object.keys(STROKES)) {
    assert.equal(follow(createTracer(l)).letterDone, true, l);
    assert.equal(follow(createTracer(l), 10, 7).letterDone, true, `${l} wobbly`);
  }
});
test('must start at the green dot; off the lane the ink pauses and never jumps ahead', () => {
  const tr = createTracer('t'), P = tr.strokes[0];
  assert.equal(tr.down(90, 170).active, false); // far from the start dot
  tr.down(P[0][0], P[0][1]); tr.move(P[10][0], P[10][1]);
  const k = tr.state().k;
  const off = tr.move(P[10][0] + 40, P[10][1]); assert.equal(off.onPath, false); assert.equal(off.k, k);
  const skip = tr.move(P.at(-1)[0], P.at(-1)[1]); assert.ok(skip.k <= k + 13, 'cannot jump to the end');
});
test('undo clears the current stroke, then the previous one', () => {
  const tr = createTracer('t'); const P = tr.strokes[0];
  tr.down(...P[0]); for (const p of P) tr.move(...p); assert.equal(tr.state().stroke, 1);
  tr.undo(); assert.equal(tr.state().stroke, 0); assert.equal(tr.state().k, 0);
});
