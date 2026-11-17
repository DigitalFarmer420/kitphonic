// ?tracelog=1 used to call the tracer object, so active stayed 0 and k was blank, and a
// 40-line window dropped the pointerdown of a slow stroke.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traceLogLine, pushTraceLog, TRACE_LOG_KEEP } from '../js/lesson-screen.js';

const cols = line => line.split(' ');

test('a tracer state fills the active and k columns', () => {
  const row = traceLogLine({
    time: 12.4, kind: 'pointermove', pointerId: 4, pointerType: 'touch', target: 'tr-svg',
    clientX: 10, clientY: 20, mapped: [73.04, 60.06], state: { active: true, k: 12 }, ownerId: 4,
  });
  const c = cols(row);
  assert.equal(c[1], 'pointermove');
  assert.equal(c[8], '1', 'active');
  assert.equal(c[9], '12', 'k');
  const blank = cols(traceLogLine({ kind: 'pointerdown', pointerId: 4, state: {} }));
  assert.equal(blank[8], '0');
  assert.equal(blank[9], '', 'k stays blank until state().k is a number');
});

test('the latest pointerdown and pointerup of each pointer survive a long stroke', () => {
  const lines = [];
  pushTraceLog(lines, traceLogLine({ time: 1, kind: 'pointerdown', pointerId: 3, state: { active: true, k: 0 } }));
  pushTraceLog(lines, traceLogLine({ time: 2, kind: 'pointerdown', pointerId: 3, state: { active: true, k: 0 } }));
  for (let i = 0; i < 400; i++) {
    pushTraceLog(lines, traceLogLine({ time: 10 + i, kind: 'pointermove', pointerId: 3, state: { active: true, k: i + 1 } }));
  }
  pushTraceLog(lines, traceLogLine({ time: 900, kind: 'pointerup', pointerId: 3, state: { active: false, k: 40 } }));
  pushTraceLog(lines, traceLogLine({ time: 5, kind: 'pointerdown', pointerId: 9, state: { active: true, k: 0 } }));
  assert.ok(lines.length <= TRACE_LOG_KEEP + 2, lines.length);
  const downs = lines.filter(l => cols(l)[1] === 'pointerdown' && cols(l)[2] === '3');
  assert.equal(downs.length, 1, 'only the newest pointerdown for that pointer is kept');
  assert.equal(cols(downs[0])[0], '2');
  assert.equal(cols(downs[0])[8], '1');
  assert.equal(cols(downs[0])[9], '0');
  assert.equal(lines.filter(l => cols(l)[1] === 'pointerup' && cols(l)[2] === '3').length, 1);
  assert.equal(lines.filter(l => cols(l)[1] === 'pointerdown' && cols(l)[2] === '9').length, 1);
});

test('the logger reads tracer.state(), stays passive, and does not cover the letter', () => {
  const src = readFileSync(new URL('../js/lesson-screen.js', import.meta.url), 'utf8');
  assert.match(src, /mountTraceLog\(svg, toLetter, owner, \(\) => tracer\.state\(\)\)/);
  assert.doesNotMatch(src, /mountTraceLog\([^)]*\) => tracer\)/);
  const body = src.slice(src.indexOf('function mountTraceLog'), src.indexOf('export function createLessonScreen'));
  assert.match(body, /passive:\s*true/);
  assert.doesNotMatch(body, /preventDefault/);
  assert.match(body, /pointer-events:\s*none/);
  assert.match(body, /pointer-events:\s*auto/);
  assert.match(body, /height:44px;min-width:44px/);
});
