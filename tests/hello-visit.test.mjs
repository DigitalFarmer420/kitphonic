// Map Home shows the Kit intro again. Play must work on every visit, while a double tap in one visit stays one greeting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHelloGate } from '../js/hello-gate.js';
import { createHelloVisit } from '../js/hello-visit.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

function playButton() {
  const classes = new Set();
  const attrs = new Map();
  return {
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: k => attrs.delete(k),
    getAttribute: k => (attrs.has(k) ? attrs.get(k) : null),
  };
}

const attempt = (counts) => ({
  unlock: async () => {},
  play: async () => { counts.plays++; },
  go() { counts.goes++; },
});

test('Home then Play works again for three visits, and a refused press does not leave Play going', async () => {
  const gate = createHelloGate();
  const play = playButton();
  const visit = createHelloVisit({ gate, play });
  const counts = { plays: 0, goes: 0 };
  for (let i = 0; i < 3; i++) {
    visit.beginVisit(); // map Home shows #hello again
    assert.equal(play.classList.contains('going'), false);
    assert.equal(play.hidden, false);
    assert.equal(play.disabled, false);
    assert.equal(play.getAttribute('aria-disabled'), null);
    assert.equal(play.getAttribute('aria-busy'), null);
    assert.equal(gate.phase, 'idle');
    assert.equal(await visit.press(attempt(counts)), true);
    assert.equal(gate.phase, 'done');
    assert.equal(play.classList.contains('going'), true);
    assert.equal(play.hidden, true);
    assert.equal(play.disabled, true);
    assert.equal(await visit.press(attempt(counts)), false); // success cannot be tried again in this visit
    assert.equal(play.classList.contains('going'), false);
    assert.equal(play.hidden, false);
    assert.equal(play.disabled, false);
    assert.equal(play.getAttribute('aria-disabled'), null);
    assert.equal(play.getAttribute('aria-busy'), null);
  }
  assert.equal(counts.plays, 3);
  assert.equal(counts.goes, 3);
});

test('two presses in one visit start one greeting and keep Play accepted', async () => {
  const gate = createHelloGate();
  const play = playButton();
  const visit = createHelloVisit({ gate, play });
  visit.beginVisit();
  let releaseUnlock;
  const pending = new Promise(r => { releaseUnlock = r; });
  let plays = 0, goes = 0;
  const first = visit.press({
    unlock: () => pending,
    play: async () => { plays++; },
    go: () => { goes++; },
  });
  await wait(5);
  const second = await visit.press({
    unlock: async () => { throw new Error('should not unlock'); },
    play: async () => { plays++; },
    go: () => { goes++; },
  });
  assert.equal(second, false);
  assert.equal(plays, 0);
  assert.equal(goes, 0);
  assert.equal(play.classList.contains('going'), true);
  assert.equal(play.hidden, true);
  assert.equal(play.disabled, true);
  assert.equal(play.getAttribute('aria-disabled'), 'true');
  releaseUnlock();
  assert.equal(await first, true);
  assert.equal(plays, 1);
  assert.equal(goes, 1);
  assert.equal(gate.phase, 'done');
  assert.equal(play.classList.contains('going'), true);
  assert.equal(play.hidden, true);
  assert.equal(play.disabled, true);
});

test('a failed greeting re-enables Play', async () => {
  const gate = createHelloGate();
  const play = playButton();
  const visit = createHelloVisit({ gate, play });
  visit.beginVisit();
  await assert.rejects(() => visit.press({
    unlock: async () => { throw new Error('slow manifest'); },
    play() {},
    go() {},
  }));
  assert.equal(gate.phase, 'idle');
  assert.equal(play.classList.contains('going'), false);
  assert.equal(play.hidden, false);
  assert.equal(play.disabled, false);
  assert.equal(play.getAttribute('aria-disabled'), null);
  assert.equal(play.getAttribute('aria-busy'), null);
  let plays = 0;
  assert.equal(await visit.press({ unlock: async () => {}, play: async () => { plays++; }, go() {} }), true);
  assert.equal(plays, 1);
  assert.equal(play.hidden, true);
  assert.equal(play.disabled, true);
});

test('accepted Play is fully hidden, not a faded hit target', () => {
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  const rule = css.match(/#play\.going[^{]*\{([^}]*)\}/);
  assert.ok(rule, 'missing #play.going rule');
  assert.match(rule[1], /display:\s*none\s*!important/);
  assert.match(rule[1], /pointer-events:\s*none/);
  assert.equal(/opacity|brightness/.test(rule[1]), false);
});
