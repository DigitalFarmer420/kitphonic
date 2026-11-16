// KP-BUG-002: play() must not hang when onended never fires or the context is suspended;
// returning to the tab (visibilitychange / pageshow) resumes AudioContext, including iOS 'interrupted'.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DUR = { 'sfx-chime': 0.08, 'm-hello': 5 };
function installDom() {
  const document = new EventTarget();
  document.hidden = false;
  const listeners = new EventTarget();
  globalThis.document = document;
  globalThis.window = globalThis;
  globalThis.addEventListener = listeners.addEventListener.bind(listeners);
  globalThis.removeEventListener = listeners.removeEventListener.bind(listeners);
  globalThis.dispatchEvent = ev => listeners.dispatchEvent(ev);
  return { document, window: globalThis };
}
function installAudio(opts = {}) {
  const { neverEnd = false, stopFiresEnded = !neverEnd, initialState = 'running', hangResume = false } = opts;
  const ctxs = [];
  class Ctx {
    state = initialState;
    destination = {};
    resumeCalls = 0;
    failResume = false;
    hangResume = hangResume;
    constructor() { ctxs.push(this); }
    get currentTime() { return 0; }
    resume() {
      this.resumeCalls++;
      if (this.hangResume) return new Promise(() => {});
      if (this.failResume) return Promise.resolve();
      this.state = 'running';
      return Promise.resolve();
    }
    async decodeAudioData(b) {
      const encoded = new Float64Array(b)[0];
      const over = Object.hasOwn(opts, 'durationOverride');
      const d = over ? opts.durationOverride : encoded;
      const span = Number.isFinite(d) && d > 0 ? d : 0.08;
      const n = Math.max(1, Math.round(span * 1000));
      const buf = { sampleRate: 1000, length: n, getChannelData: () => new Float32Array(n) };
      if (!over || d !== undefined) buf.duration = d;
      return buf;
    }
    createBufferSource() {
      const s = { playbackRate: { value: 1 }, connect() {}, onended: null, buffer: null,
        start() { if (!neverEnd) s.off = setTimeout(() => s.onended?.(), 20); },
        stop() { clearTimeout(s.off); if (stopFiresEnded) s.onended?.(); } };
      return s;
    }
    createOscillator() { return { frequency: { value: 0 }, type: 'sine', connect() { return this; }, start() {}, stop() {}, onended: null }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } }; }
  }
  globalThis.AudioContext = Ctx;
  globalThis.fetch = async url => url.endsWith('manifest.json')
    ? { ok: true, json: async () => ({ clips: Object.keys(DUR).map(id => ({ id, kind: id.startsWith('sfx') ? 'sfx' : 'x', tts: id, take: `takes/${id}.mp3` })) }) }
    : { ok: true, arrayBuffer: async () => new Float64Array([DUR[url.match(/takes\/(.+)\.mp3$/)[1]]]).buffer };
  return { ctxs };
}

test('play() resolves when onended never fires', { timeout: 3000 }, async () => {
  installDom();
  installAudio({ neverEnd: true });
  const rejections = [];
  const onRej = reason => rejections.push(reason);
  process.on('unhandledRejection', onRej);
  const { createAudio } = await import('../js/audio.js?hang-onended');
  const a = await createAudio({ early: [] });
  await a.unlock({ first: [] });
  const t0 = Date.now();
  await a.play('sfx-chime');
  const elapsed = Date.now() - t0;
  process.off('unhandledRejection', onRej);
  assert.equal(a.busy, false);
  assert.ok(elapsed < 2500, `play() hung (${elapsed} ms)`);
  assert.equal(rejections.length, 0);
});

test('play() resolves with a suspended context that will not resume', { timeout: 2000 }, async () => {
  installDom();
  const { ctxs } = installAudio({ neverEnd: true });
  const rejections = [];
  const onRej = reason => rejections.push(reason);
  process.on('unhandledRejection', onRej);
  const { createAudio } = await import('../js/audio.js?hang-suspended');
  const a = await createAudio({ early: [] });
  await a.unlock({ first: [] });
  const ctx = ctxs[0];
  ctx.state = 'suspended';
  ctx.failResume = true;
  const t0 = Date.now();
  // m-hello is 5 s: a duration timeout would take ~5.4 s; the prompt resume fallback must be faster.
  await a.play('m-hello');
  const elapsed = Date.now() - t0;
  process.off('unhandledRejection', onRej);
  assert.equal(a.busy, false);
  assert.ok(ctx.resumeCalls >= 1, 'tried ctx.resume() before giving up');
  assert.ok(elapsed < 1000, `play() waited on a dead context (${elapsed} ms)`);
  assert.equal(rejections.length, 0);
  assert.equal(ctx.state, 'suspended');
});

test('visibilitychange and pageshow resume a suspended or interrupted context', async () => {
  const { document } = installDom();
  const { ctxs } = installAudio();
  const { createAudio } = await import('../js/audio.js?vis-resume');
  const a = await createAudio({ early: [] });
  await a.unlock({ first: [] });
  const ctx = ctxs[0];

  ctx.state = 'suspended';
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(ctx.state, 'suspended');
  assert.equal(ctx.resumeCalls, 0);

  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(ctx.state, 'running');
  assert.equal(ctx.resumeCalls, 1);

  ctx.state = 'interrupted';
  window.dispatchEvent(new Event('pageshow'));
  assert.equal(ctx.state, 'running');
  assert.equal(ctx.resumeCalls, 2);

  // hook is idempotent: a second instance shares one listener; each context resumes once per event
  const b = await createAudio({ early: [] });
  await b.unlock({ first: [] });
  assert.equal(ctxs.length, 2);
  ctxs[0].state = 'suspended';
  ctxs[1].state = 'interrupted';
  ctxs[0].resumeCalls = 0;
  ctxs[1].resumeCalls = 0;
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(ctxs[0].resumeCalls, 1, 'first context resumed once (listener not stacked)');
  assert.equal(ctxs[1].resumeCalls, 1, 'second context resumed once');
  assert.equal(ctxs[0].state, 'running');
  assert.equal(ctxs[1].state, 'running');
});

test('unlock() resolves when resume() never settles', { timeout: 2000 }, async () => {
  installDom();
  const { ctxs } = installAudio({ hangResume: true, initialState: 'suspended' });
  const rejections = [];
  const onRej = reason => rejections.push(reason);
  process.on('unhandledRejection', onRej);
  const { createAudio } = await import('../js/audio.js?hang-unlock');
  const a = await createAudio({ early: [] });
  const t0 = Date.now();
  const state = await a.unlock({ first: ['m-hello'] });
  const elapsed = Date.now() - t0;
  process.off('unhandledRejection', onRej);
  assert.ok(elapsed < 1500, `unlock() hung (${elapsed} ms)`);
  assert.equal(state, 'suspended');
  assert.equal(a.unlocked, false, 'unlocked follows ctx.state === running');
  assert.ok(ctxs[0].resumeCalls >= 1, 'tried ctx.resume()');
  assert.ok(a.loadedCount >= 1, 'first clips still primed while resume is outstanding');
  assert.equal(rejections.length, 0);
});

test('endedWaitMs falls back to the 10 s cap for missing, NaN, non-finite, or negative duration', async () => {
  const { endedWaitMs } = await import('../js/audio.js?ended-wait-ms');
  assert.equal(endedWaitMs(NaN), 10_000);
  assert.equal(endedWaitMs(undefined), 10_000);
  assert.equal(endedWaitMs(Infinity), 10_000);
  assert.equal(endedWaitMs(-1), 10_000);
  assert.equal(endedWaitMs(Number.NEGATIVE_INFINITY), 10_000);
  assert.equal(endedWaitMs(0), 400);
  assert.equal(endedWaitMs(0.5), 900);
  assert.equal(endedWaitMs(30), 10_000);
});

test('play() does not resolve immediately or log end: NaN when buffer.duration is missing or non-finite', { timeout: 3000 }, async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cases = [['missing', undefined], ['NaN', NaN], ['Infinity', Infinity], ['negative', -1]];
  for (const [label, durationOverride] of cases) {
    installDom();
    installAudio({ neverEnd: true, stopFiresEnded: false, durationOverride });
    const { createAudio } = await import(`../js/audio.js?bad-dur-${label}`);
    const a = await createAudio({ early: [] });
    await a.unlock({ first: [] });
    let settled = false;
    const p = a.play('sfx-chime').then(v => { settled = true; return v; });
    await sleep(80);
    assert.equal(settled, false, `${label}: play() resolved immediately (NaN timeout)`);
    const pending = window.__kitAudioLog.filter(e => e.id === 'sfx-chime');
    assert.ok(pending.length >= 1, `${label}: clip was logged`);
    assert.ok(pending.every(e => e.end === undefined || Number.isFinite(e.end)), `${label}: logged end: ${pending.map(e => e.end)}`);
    a.stop();
    await p;
    assert.equal(settled, true, `${label}: play() should resolve after stop()`);
    assert.ok(window.__kitAudioLog.filter(e => e.id === 'sfx-chime').every(e => Number.isFinite(e.end)), `${label}: end must be finite after stop, got ${JSON.stringify(window.__kitAudioLog)}`);
    assert.equal(a.busy, false);
  }
});

test('stop() resolves play() promptly when onended never fires', { timeout: 2000 }, async () => {
  installDom();
  installAudio({ neverEnd: true, stopFiresEnded: false });
  const rejections = [];
  const onRej = reason => rejections.push(reason);
  process.on('unhandledRejection', onRej);
  const { createAudio } = await import('../js/audio.js?stop-no-ended');
  const a = await createAudio({ early: [] });
  await a.unlock({ first: [] });
  const p = a.play('m-hello'); // 5 s clip would otherwise wait ~5.4 s
  await new Promise(r => setTimeout(r, 40));
  const t0 = Date.now();
  a.stop();
  await p;
  const elapsed = Date.now() - t0;
  process.off('unhandledRejection', onRej);
  assert.ok(elapsed < 500, `play() resolved late after stop() (${elapsed} ms)`);
  assert.equal(a.busy, false);
  assert.ok(window.__kitAudioLog.every(e => e.end === undefined || Number.isFinite(e.end)));
  assert.equal(rejections.length, 0);
});
