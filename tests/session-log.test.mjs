// ?sessionlog=1 ring buffer. The flag-off path never constructs one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSessionSpot, createSessionLog, observeAudioContexts, rectsOverlap, sessionLogEnabled, watchStorage, SESSION_LOG_CAP, SESSION_LOG_CHIP, SESSION_LOG_PRE_H } from '../js/session-log.js';

function fakeDocument() {
  const make = (tag) => {
    const node = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      textContent: '',
      type: '',
      value: '',
      style: {},
      children: [],
      attrs: {},
      listeners: [],
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); },
      append(...kids) { this.children.push(...kids); },
      addEventListener(type, fn) { this.listeners.push([type, fn]); },
      remove() { this.removed = true; },
      select() { this.selected = true; },
    };
    return node;
  };
  const body = make('body');
  const head = make('head');
  return {
    visibilityState: 'visible',
    listeners: [],
    body,
    head,
    documentElement: head,
    defaultView: {
      listeners: [],
      navigator: { clipboard: { writeText: async () => {} } },
      addEventListener(type, fn) { this.listeners.push([type, fn]); },
      setTimeout(fn) { fn(); },
    },
    createElement: make,
    addEventListener(type, fn, opts) { this.listeners.push([type, fn, opts]); },
    execCommand() { return true; },
  };
}

test('sessionlog=1 is the only on switch', () => {
  assert.equal(sessionLogEnabled(''), false);
  assert.equal(sessionLogEnabled('?skipHello=1'), false);
  assert.equal(sessionLogEnabled('?sessionlog=0'), false);
  assert.equal(sessionLogEnabled('?sessionlog=1'), true);
  assert.equal(sessionLogEnabled('?skipHello=1&sessionlog=1'), true);
});

test('the ring keeps the last 200 stamped entries and Copy reads all of them', async () => {
  const doc = fakeDocument();
  const log = createSessionLog(doc, { now: () => new Date('2026-11-16T10:56:00.007Z'), win: doc.defaultView });
  assert.equal(log.entries[0].t, '2026-11-16T10:56:00.007Z');
  assert.equal(log.entries[0].kind, 'visibility');
  for (let i = 0; i < SESSION_LOG_CAP + 20; i++) log.push('screen', `s${i}`);
  assert.equal(log.entries.length, SESSION_LOG_CAP);
  assert.equal(log.entries[0].detail, 's20');
  assert.equal(log.entries.at(-1).detail, `s${SESSION_LOG_CAP + 19}`);
  assert.match(log.text(), new RegExp(`2026-11-16T10:56:00.007Z\\tscreen\\ts${SESSION_LOG_CAP + 19}`));
  assert.equal(log.view.style.pointerEvents, 'none');
  assert.equal(log.view.style.height, `${SESSION_LOG_PRE_H}px`);
  assert.equal(log.view.style.overflow, 'auto');
  assert.equal(log.root.style.pointerEvents, 'none');
  assert.equal(log.root.dataset.open, 'false');
  assert.equal(log.copyButton.hidden, true);
  assert.equal(log.clearButton.hidden, true);
  assert.equal(log.copyButton.style.pointerEvents, 'auto');
  assert.equal(log.clearButton.style.pointerEvents, 'auto');
  let copied = '';
  doc.defaultView.navigator.clipboard.writeText = async (text) => { copied = text; };
  log.copyButton.listeners.find(([type]) => type === 'click')[1]();
  await Promise.resolve();
  assert.equal(copied, log.text());
  log.clearButton.listeners.find(([type]) => type === 'click')[1]();
  assert.equal(log.entries.length, 0);
  assert.equal(log.view.textContent, '');
});

test('taps, visibility, page show/hide, and hello phases are recorded', () => {
  const doc = fakeDocument();
  const log = createSessionLog(doc, { now: () => new Date('2026-11-16T10:56:00.007Z'), win: doc.defaultView });
  log.phase('idle', 'running');
  log.screen('map');
  const tap = doc.listeners.find(([type]) => type === 'pointerdown');
  assert.equal(tap[2].capture, true);
  assert.equal(tap[2].passive, true);
  tap[1]({ target: { id: '', className: '', parentElement: { id: 'play' } }, pointerType: 'touch' });
  tap[1]({ target: { id: '', className: 'btn coral', parentElement: null }, pointerType: 'mouse' });
  const before = log.entries.filter(e => e.kind === 'tap').length;
  tap[1]({ target: { id: 'kit-sessionlog-clear', parentElement: log.root }, pointerType: 'touch' });
  assert.equal(log.entries.filter(e => e.kind === 'tap').length, before);
  doc.listeners.find(([type]) => type === 'visibilitychange')[1]();
  doc.visibilityState = 'hidden';
  doc.listeners.find(([type]) => type === 'visibilitychange')[1]();
  doc.defaultView.listeners.find(([type]) => type === 'pagehide')[1]();
  doc.defaultView.listeners.find(([type]) => type === 'pageshow')[1]({ persisted: true });
  const kinds = log.entries.map(e => `${e.kind}:${e.detail}`);
  assert.ok(kinds.includes('hello:idle->running'));
  assert.ok(kinds.includes('screen:map'));
  assert.ok(kinds.includes('tap:#play touch'));
  assert.ok(kinds.includes('tap:.btn mouse'));
  assert.ok(kinds.includes('visibility:hidden'));
  assert.ok(kinds.includes('pagehide:'));
  assert.ok(kinds.includes('pageshow:persisted'));
});

test('storage errors are logged and rethrown; a missing log does not wrap', () => {
  const doc = fakeDocument();
  const log = createSessionLog(doc, { now: () => new Date('2026-11-16T10:56:00.007Z'), win: doc.defaultView });
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { const err = new Error('quota'); err.name = 'QuotaExceededError'; throw err; },
    removeItem() { throw new Error('nope'); },
    length: 1,
  };
  assert.equal(watchStorage(storage, null), storage);
  const wrapped = watchStorage(storage, log);
  assert.throws(() => wrapped.getItem('kitphonic.v1.responses'), /blocked/);
  assert.throws(() => wrapped.setItem('kitphonic.v1.settings', '{}'), /quota/);
  assert.throws(() => wrapped.removeItem('kitphonic.v1.seen'), /nope/);
  assert.equal(wrapped.length, 1);
  const lines = log.entries.filter(e => e.kind === 'storage').map(e => e.detail);
  assert.deepEqual(lines, [
    'getItem kitphonic.v1.responses: Error blocked',
    'setItem kitphonic.v1.settings: QuotaExceededError quota',
    'removeItem kitphonic.v1.seen: Error nope',
  ]);
});

function overlapsAny(rect, list) {
  return list.some(o => rectsOverlap(rect, o, 0));
}

test('the chip uses a free corner and stays inside the safe area', () => {
  const controls = [{ x: 10, y: 10, w: 72, h: 72, id: 'home' }];
  const spot = chooseSessionSpot({ vw: 400, vh: 800, controls, expanded: false });
  assert.equal(spot.toggle.w, SESSION_LOG_CHIP);
  assert.equal(spot.toggle.h, SESSION_LOG_CHIP);
  assert.equal(overlapsAny(spot.toggle, controls), false);
  assert.ok(spot.toggle.x >= 8 && spot.toggle.y >= 8);
  assert.equal(spot.name === 'tl' && spot.toggle.y < 20, false);
  const inset = chooseSessionSpot({
    vw: 400, vh: 800, insets: { top: 24, right: 0, bottom: 48, left: 0 }, controls, expanded: false,
  });
  assert.ok(inset.toggle.y >= 24);
  assert.ok(inset.toggle.y + inset.toggle.h <= 800 - 48);
});

test('lesson corners are full, so the chip steps off the toolbar and the buttons stay clear', () => {
  const controls = [
    { x: 14, y: 14, w: 70, h: 70, id: 'ls-home' },
    { x: 306, y: 14, w: 70, h: 70, id: 'ls-again' },
    { x: 18, y: 745, w: 80, h: 84, id: 'ic-replay' },
    { x: 110, y: 745, w: 260, h: 84, id: 'ic-next' },
    { x: 73, y: 180, w: 244, h: 244, id: 'ic-letter' },
  ];
  const toolbars = [
    { x: 0, y: 0, w: 390, h: 96, id: 'top' },
    { x: 0, y: 730, w: 390, h: 114, id: 'ibar' },
  ];
  const spot = chooseSessionSpot({ vw: 390, vh: 844, controls, toolbars, expanded: true });
  for (const rect of [spot.toggle, spot.copy, spot.clear]) {
    assert.equal(overlapsAny(rect, controls), false, spot.kind);
    assert.equal(overlapsAny(rect, toolbars), false, spot.kind);
  }
  assert.equal(spot.pre == null || overlapsAny(spot.pre, toolbars), false);
});

test('AudioContext state changes are observed without an audio.js getter', () => {
  const states = [];
  const log = { audio: (state) => states.push(state) };
  class FakeContext {
    constructor() { this.state = 'suspended'; this._listeners = []; }
    addEventListener(type, fn) { if (type === 'statechange') this._listeners.push(fn); }
    resume() { this.state = 'running'; for (const fn of this._listeners) fn(); }
  }
  const win = { AudioContext: FakeContext, webkitAudioContext: FakeContext };
  assert.equal(observeAudioContexts(win, log), true);
  // audio.js uses AudioContext when it exists. The shared original is wrapped once, not twice.
  assert.notEqual(win.AudioContext, FakeContext);
  assert.equal(win.webkitAudioContext, FakeContext);
  const ctx = new win.AudioContext();
  assert.deepEqual(states, ['suspended']);
  ctx.resume();
  ctx.resume(); // a repeat of the same state is not another change
  assert.deepEqual(states, ['suspended', 'running']);
  assert.equal(observeAudioContexts(null, log), false);
});
