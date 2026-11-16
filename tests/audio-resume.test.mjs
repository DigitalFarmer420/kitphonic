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
function installAudio({ neverEnd = false } = {}) {
  const ctxs = [];
  class Ctx {
    state = 'running';
    destination = {};
    resumeCalls = 0;
    failResume = false;
    hangResume = false;
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
      const d = new Float64Array(b)[0], n = Math.max(1, Math.round(d * 1000));
      return { duration: d, sampleRate: 1000, length: n, getChannelData: () => new Float32Array(n) };
    }
    createBufferSource() {
      const s = { playbackRate: { value: 1 }, connect() {}, onended: null, buffer: null,
        start() { if (!neverEnd) s.off = setTimeout(() => s.onended?.(), 20); },
        stop() { clearTimeout(s.off); s.onended?.(); } };
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
