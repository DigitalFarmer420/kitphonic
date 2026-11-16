// Pointer ownership, lost-capture, slider keys, and ARIA for the blend sliders and family tray.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pointerOwner, scheduleLostCapture, sliderKeyTarget, sliderAriaState, applySliderAria } from '../js/gesture.js';
import { screenToLetter } from '../js/trace.js';
import { markers, createSweep } from '../js/core.js';

const src = name => readFileSync(new URL(`../js/${name}`, import.meta.url), 'utf8');

test('pointerOwner: a second finger cannot begin or end the gesture', () => {
  const o = pointerOwner();
  assert.equal(o.begin(null), false);
  assert.equal(o.begin(1), true); assert.equal(o.owns(1), true); assert.equal(o.id, 1);
  assert.equal(o.begin(2), false, 'palm down does not take over'); assert.equal(o.owns(2), false);
  assert.equal(o.end(2), false, 'palm lift does not end it'); assert.equal(o.owns(1), true);
  assert.equal(o.begin(1), true, 'the owning pointer may re-begin');
  assert.equal(o.end(1), true); assert.equal(o.id, null);
  assert.equal(o.begin(2), true, 'after the lift, another finger may start');
  assert.equal(o.end(2), true);
});

test('lost capture aborts only when pointerup or pointercancel does not end the owner first', () => {
  const o = pointerOwner();
  let aborted = 0, run = null;
  const later = fn => { run = fn; };
  o.begin(1);
  scheduleLostCapture({ pointerId: 1 }, pid => o.owns(pid), () => { aborted++; }, later);
  o.end(1); // pointerup is specified to follow lostpointercapture in the same turn
  run();
  assert.equal(aborted, 0); assert.equal(o.id, null);

  o.begin(4);
  scheduleLostCapture({ pointerId: 4 }, pid => o.owns(pid), () => { aborted++; o.end(4); }, later);
  assert.equal(aborted, 0);
  run(); // no up and no cancel: the capture was stolen
  assert.equal(aborted, 1); assert.equal(o.id, null);

  o.begin(5);
  scheduleLostCapture({ pointerId: 9 }, pid => o.owns(pid), () => { aborted++; }, later);
  run();
  assert.equal(aborted, 1, 'another pointer losing capture does not abort the owner');
  assert.equal(o.owns(5), true);
});

test('slider keys step one sound at a time; Home and End are the ends of the track', () => {
  const stops = [0.167, 0.5, 0.833];
  assert.equal(sliderKeyTarget(0, stops, 'Enter'), null);
  assert.equal(sliderKeyTarget(0, stops, 'ArrowRight'), 0.167);
  assert.equal(sliderKeyTarget(0.167, stops, 'ArrowUp'), 0.5);
  assert.equal(sliderKeyTarget(0.5, stops, 'ArrowRight'), 0.833);
  assert.equal(sliderKeyTarget(0.833, stops, 'ArrowRight'), 1);
  assert.equal(sliderKeyTarget(0.5, stops, 'ArrowLeft'), 0.167);
  assert.equal(sliderKeyTarget(0.167, stops, 'ArrowDown'), 0);
  assert.equal(sliderKeyTarget(0.9, stops, 'Home'), 0);
  assert.equal(sliderKeyTarget(0, stops, 'End'), 1);
  assert.equal(sliderKeyTarget(0, [], 'ArrowRight'), 1);
  assert.equal(sliderKeyTarget(0.4, [], 'ArrowLeft'), 0);
});

test('arrow keys drive the same sweep as a drag: one sound each, End blends', () => {
  const ms = markers('map', 3), sweep = createSweep(ms);
  let f = 0; const evs = [];
  for (let i = 0; i < 4; i++) {
    const next = sliderKeyTarget(f, sweep.positions, i < 3 ? 'ArrowRight' : 'End');
    evs.push(...sweep.move(next, i * 400));
    f = sweep.position;
  }
  assert.deepEqual(evs.filter(e => e.kind === 'play').map(e => e.marker), [0, 1, 2]);
  assert.equal(evs.at(-1).kind, 'blend');
  assert.equal(sliderKeyTarget(f, sweep.positions, 'Home'), 0);
  const back = sweep.move(0, 2000);
  assert.ok(back.some(e => e.kind === 'replay'));
});

test('slider ARIA follows the knob position, not sounds already heard', () => {
  const stops = [0.167, 0.5, 0.833];
  assert.deepEqual(sliderAriaState({ fraction: 0, total: 3, stops }), {
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-valuetext': '0 of 3 sounds', 'aria-orientation': 'horizontal',
  });
  const mid = sliderAriaState({ fraction: 0.5, total: 3, stops });
  assert.equal(mid['aria-valuenow'], '50'); assert.equal(mid['aria-valuetext'], '2 of 3 sounds');
  assert.equal(sliderAriaState({ fraction: 0.2, total: 3, stops })['aria-valuetext'], '1 of 3 sounds');
  assert.equal(sliderAriaState({ fraction: 1, total: 3, stops })['aria-valuetext'], 'all 3 sounds');
  assert.equal(sliderAriaState({ fraction: 0, total: 0 })['aria-valuetext'], 'start');
  assert.equal(sliderAriaState({ fraction: Number.NaN, total: 2 })['aria-valuenow'], '0');
  assert.equal(sliderAriaState({ fraction: Number.NaN, total: 2 })['aria-valuetext'], '0 of 2 sounds');
  const el = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  applySliderAria(el, { fraction: 0.833, total: 3, stops });
  assert.equal(el.attrs['aria-valuenow'], '83'); assert.equal(el.attrs['aria-valuetext'], '3 of 3 sounds');
  assert.equal(el.attrs['aria-valuemin'], '0'); assert.equal(el.attrs['aria-valuemax'], '100');
  applySliderAria(null, {});
});

test('Home after hearing every sound announces the start: valuenow 0 and valuetext 0 of N', () => {
  for (const [word, level] of [['at', 1], ['map', 3], ['sat', 2]]) {
    const ms = markers(word, level), sweep = createSweep(ms);
    sweep.move(1, 0); // every sound has been heard; the lit set does not shrink
    assert.equal(sweep.lit.length, ms.length, word);
    const end = sliderAriaState({ fraction: sweep.position, total: ms.length, stops: sweep.positions });
    assert.equal(end['aria-valuenow'], '100', word);
    assert.equal(end['aria-valuetext'], `all ${ms.length} sounds`, word);
    const home = sliderKeyTarget(sweep.position, sweep.positions, 'Home');
    sweep.move(home, 400);
    const back = sliderAriaState({ fraction: sweep.position, total: ms.length, stops: sweep.positions });
    assert.equal(sweep.position, 0, word);
    assert.equal(back['aria-valuenow'], '0', word);
    assert.equal(back['aria-valuetext'], `0 of ${ms.length} sounds`, word);
    assert.equal(sweep.lit.length, ms.length, `${word}: heard sounds stay lit; the label must not`);
    // two arrows back: the first lands on the last sound (still N of N); the second leaves it
    let f = 1;
    f = sliderKeyTarget(f, sweep.positions, 'ArrowLeft');
    f = sliderKeyTarget(f, sweep.positions, 'ArrowLeft');
    const stepped = sliderAriaState({ fraction: f, total: ms.length, stops: sweep.positions });
    assert.equal(stepped['aria-valuenow'], String(Math.round(f * 100)), word);
    assert.equal(stepped['aria-valuetext'], `${ms.length - 1} of ${ms.length} sounds`, word);
  }
});

test('screenToLetter is null-safe when the svg has no screen matrix', () => {
  const shift = { inverse() { return { a: 1, b: 0, c: 0, d: 1, e: -10, f: -20 }; } };
  assert.deepEqual(screenToLetter(shift, 15, 25), [5, 5]);
  assert.equal(screenToLetter(null, 0, 0), null);
  assert.equal(screenToLetter({}, 0, 0), null);
  assert.equal(screenToLetter({ inverse() { throw new Error('singular'); } }, 1, 1), null);
  assert.equal(screenToLetter({ inverse() { return null; } }, 1, 1), null);
  assert.equal(screenToLetter({ inverse() { return { a: NaN, b: 0, c: 0, d: 1, e: 0, f: 0 }; } }, 1, 1), null);
});

test('slider, sentence, and family screens bind pointer id, cancel, lost capture, keys, and ARIA', () => {
  const word = src('word-screen.js'), sentence = src('star-screen.js'), family = src('family-screen.js'), html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  for (const id of ['handle', 'sn-handle']) {
    const tag = html.slice(html.indexOf(`id="${id}"`), html.indexOf('>', html.indexOf(`id="${id}"`)));
    for (const attr of ['role="slider"', 'tabindex="0"', 'aria-valuemin="0"', 'aria-valuemax="100"', 'aria-valuenow="0"', 'aria-orientation="horizontal"'])
      assert.ok(tag.includes(attr), `${id} ${attr}`);
  }
  assert.match(word, /slideOwner\.begin\(e\.pointerId\)/);
  assert.match(word, /e\.pointerId !== dragging\.id/);
  assert.match(word, /pointercancel', onUp/);
  assert.match(word, /lostpointercapture', onUp/);
  assert.match(word, /onSliderKey/);
  assert.match(word, /applySliderAria\(handle, \{ fraction: f, stops: sweep\?\.positions/);
  assert.doesNotMatch(word, /passed: sweep\?\.lit/);
  assert.match(sentence, /slideOwner\.begin\(e\.pointerId\)/);
  assert.match(sentence, /e\.pointerId !== dragging\.id/);
  assert.match(sentence, /pointercancel', endSlide/);
  assert.match(sentence, /lostpointercapture', endSlide/);
  assert.match(sentence, /function onSliderKey/);
  assert.match(sentence, /applySliderAria\(\$\('sn-handle'\), \{ fraction: f, stops: run\.sweep\?\.positions/);
  assert.doesNotMatch(sentence, /passed: run\.sweep\?\.lit/);
  assert.match(family, /owner\.begin\(e\.pointerId\)/);
  assert.match(family, /!owner\.owns\(e\.pointerId\)/);
  assert.match(family, /pointercancel', abortDrag/);
  assert.match(family, /scheduleLostCapture/);
  assert.match(family, /e\.key !== 'Enter' && e\.key !== ' '/);
  assert.match(family, /aria-pressed/);
  assert.match(css, /#handle:focus-visible,#sn-handle:focus-visible,\.ftile:focus-visible,#fm-slot:focus-visible/);
});
