// A hung decodeAudioData or fetch must not block unlock() or play(), or hello Play never reaches the map.
// Late success may be cached for a later play but must never auto-play. A timeout must not poison the clip cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHelloGate } from '../js/hello-gate.js';

const DUR = { 'sfx-chime': 0.08, 'm-hello': 5 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

function makeBuf(duration = 0.08) {
  const n = Math.max(1, Math.round(duration * 1000));
  return { sampleRate: 1000, length: n, duration, getChannelData: () => new Float32Array(n) };
}

function installAudio(opts = {}) {
  const { initialState = 'running', hangResume = false, hangFetch = false } = opts;
  let hangDecode = !!opts.hangDecode;
  let failResume = !!opts.failResume;
  const ctxs = [];
  const pendingDecodes = [];
  let sourceStarts = 0, oscStarts = 0;
  class Ctx {
    state = initialState;
    destination = {};
    resumeCalls = 0;
    decodeCalls = 0;
    constructor() { ctxs.push(this); }
    get currentTime() { return 0; }
    resume() {
      this.resumeCalls++;
      if (hangResume) return new Promise(() => {});
      if (failResume) return Promise.reject(Object.assign(new Error('Failed to start the audio device'), { name: 'InvalidStateError' }));
      this.state = 'running';
      return Promise.resolve();
    }
    decodeAudioData(b) {
      this.decodeCalls++;
      if (hangDecode) {
        return new Promise((resolve, reject) => pendingDecodes.push({ resolve, reject, b, ctx: this }));
      }
      const encoded = new Float64Array(b)[0];
      const d = Number.isFinite(encoded) && encoded > 0 ? encoded : 0.08;
      return Promise.resolve(makeBuf(d));
    }
    createBufferSource() {
      const s = { playbackRate: { value: 1 }, connect() {}, onended: null, buffer: null,
        start() { sourceStarts++; s.off = setTimeout(() => s.onended?.(), 20); },
        stop() { clearTimeout(s.off); s.onended?.(); } };
      return s;
    }
    createOscillator() {
      return { frequency: { value: 0 }, type: 'sine', connect() { return this; }, start() { oscStarts++; }, stop() {}, onended: null };
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } }; }
  }
  globalThis.AudioContext = Ctx;
  globalThis.fetch = async url => {
    if (url.endsWith('manifest.json')) {
      return { ok: true, json: async () => ({ clips: Object.keys(DUR).map(id => ({ id, kind: id.startsWith('sfx') ? 'sfx' : 'x', tts: id, take: `takes/${id}.mp3` })) }) };
    }
    if (hangFetch) return new Promise(() => {});
    const id = url.match(/takes\/(.+)\.mp3$/)?.[1];
    return { ok: true, arrayBuffer: async () => new Float64Array([DUR[id] ?? 0.08]).buffer };
  };
  return {
    ctxs,
    pendingDecodes,
    setHangDecode: v => { hangDecode = v; },
    setFailResume: v => { failResume = v; },
    sourceStarts: () => sourceStarts,
    oscStarts: () => oscStarts,
    resolvePending(duration) {
      for (const p of pendingDecodes.splice(0)) {
        const encoded = p.b ? new Float64Array(p.b)[0] : duration;
        p.resolve(makeBuf(Number.isFinite(duration) ? duration : (Number.isFinite(encoded) && encoded > 0 ? encoded : 0.08)));
      }
    },
    rejectPending(err = new Error('decode failed')) {
      for (const p of pendingDecodes.splice(0)) p.reject(err);
    },
  };
}

test('unlock() and play() resolve when decodeAudioData never settles', { timeout: 4000 }, async () => {
  installDom();
  const env = installAudio({ hangDecode: true, failResume: true, initialState: 'suspended' });
  const rejections = [];
  const onRej = reason => rejections.push(reason);
  process.on('unhandledRejection', onRej);
  const { createAudio, DECODE_MS } = await import('../js/audio.js?hang-decode');
  const a = await createAudio({ early: [] });
  const t0 = Date.now();
  await a.unlock({ first: ['m-hello'] });
  const unlockMs = Date.now() - t0;
  const t1 = Date.now();
  await a.play('m-hello');
  const playMs = Date.now() - t1;
  const total = Date.now() - t0;
  process.off('unhandledRejection', onRej);
  assert.ok(unlockMs < DECODE_MS + 400, `unlock() hung (${unlockMs} ms)`);
  assert.ok(unlockMs >= DECODE_MS - 100, `unlock() returned too fast (${unlockMs} ms), expected ~${DECODE_MS}`);
  assert.ok(playMs < 600, `play() re-waited a hung decode (${playMs} ms)`);
  assert.ok(total < DECODE_MS + 700, `unlock+play took ${total} ms`);
  assert.equal(a.busy, false);
  assert.equal(rejections.length, 0);
  assert.equal(env.sourceStarts(), 0, 'hung decode must not start a buffer source');
});

test('unlock() and play() resolve when the clip fetch never settles', { timeout: 4000 }, async () => {
  installDom();
  installAudio({ hangFetch: true, failResume: true, initialState: 'suspended' });
  const rejections = [];
  const onRej = reason => rejections.push(reason);
  process.on('unhandledRejection', onRej);
  const { createAudio, DECODE_MS } = await import('../js/audio.js?hang-fetch');
  const a = await createAudio({ early: [] });
  const t0 = Date.now();
  await a.unlock({ first: ['m-hello'] });
  await a.play('m-hello');
  const elapsed = Date.now() - t0;
  process.off('unhandledRejection', onRej);
  assert.ok(elapsed < DECODE_MS + 700, `unlock+play hung on fetch (${elapsed} ms)`);
  assert.equal(a.busy, false);
  assert.equal(rejections.length, 0);
  assert.equal((window.__kitAudioLog || []).filter(e => e.id === 'm-hello').length, 0);
});

test('play() itself is bounded when unlock() did not already start the hung decode', { timeout: 4000 }, async () => {
  installDom();
  const env = installAudio({ hangDecode: true, initialState: 'running' });
  const { createAudio, DECODE_MS } = await import('../js/audio.js?hang-decode-play');
  const a = await createAudio({ early: [] });
  // No sfx / first clips: unlock returns immediately; play() is the first load.
  const manifest = a.manifest;
  manifest.clips.forEach(c => { if (c.kind === 'sfx') c.kind = 'x'; });
  const t0 = Date.now();
  await a.unlock({ first: [] });
  const afterUnlock = Date.now() - t0;
  assert.ok(afterUnlock < 300, `unlock({ first: [] }) should not wait on decode (${afterUnlock} ms)`);
  env.ctxs[0].state = 'suspended';
  env.setFailResume(true);
  await a.play('m-hello');
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < DECODE_MS + 700, `play() hung (${elapsed} ms)`);
  assert.ok(elapsed >= DECODE_MS - 100, `play() returned too fast (${elapsed} ms)`);
  assert.equal(a.busy, false);
});

test('a late decode is cached but never auto-plays', { timeout: 4000 }, async () => {
  installDom();
  const env = installAudio({ hangDecode: true, initialState: 'running' });
  const { createAudio } = await import('../js/audio.js?late-decode');
  const a = await createAudio({ early: [] });
  await a.unlock({ first: ['m-hello'] });
  await a.play('m-hello');
  const starts = env.sourceStarts();
  const logged = (window.__kitAudioLog || []).length;
  env.setHangDecode(false);
  env.resolvePending();
  await sleep(120);
  assert.equal(env.sourceStarts(), starts, 'late decode must not auto-play');
  assert.equal((window.__kitAudioLog || []).length, logged, 'late decode must not log a clip');
  // Next play should use the cached buffer and start a real source.
  window.__kitAudioLog.length = 0;
  await a.play('m-hello');
  assert.ok(env.sourceStarts() > starts, 'cached late decode should play on the next call');
  assert.equal((window.__kitAudioLog || []).filter(e => e.id === 'm-hello' && e.via !== 'tone').length, 1);
  assert.equal(a.busy, false);
});

test('a hung decode that later fails does not poison the cache; a retry can decode', { timeout: 5000 }, async () => {
  installDom();
  const env = installAudio({ hangDecode: true, initialState: 'running' });
  const { createAudio, DECODE_MS } = await import('../js/audio.js?no-poison');
  const a = await createAudio({ early: [] });
  await a.unlock({ first: ['m-hello'] });
  await a.play('m-hello');
  const firstCalls = env.ctxs[0].decodeCalls;
  assert.ok(firstCalls >= 1);
  env.setHangDecode(false);
  env.rejectPending(new Error('decode failed'));
  await sleep(30);
  window.__kitAudioLog.length = 0;
  const t0 = Date.now();
  await a.play('m-hello');
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 1000, `retry play() hung (${elapsed} ms)`);
  assert.ok(env.ctxs[0].decodeCalls > firstCalls, 'retry should start a new decode');
  assert.equal((window.__kitAudioLog || []).filter(e => e.id === 'm-hello' && e.via !== 'tone').length, 1);
  assert.equal(a.busy, false);
  assert.equal(DECODE_MS, 1500);
});

test('hello gate still reaches the map when resume rejects and decode hangs', { timeout: 4000 }, async () => {
  installDom();
  const env = installAudio({ hangDecode: true, failResume: true, initialState: 'suspended' });
  const rejections = [];
  const onRej = reason => rejections.push(reason);
  process.on('unhandledRejection', onRej);
  const { createAudio, DECODE_MS } = await import('../js/audio.js?gate-hang');
  const a = await createAudio({ early: [] });
  const gate = createHelloGate();
  let went = 0;
  const t0 = Date.now();
  const ok = await gate.start({
    unlock: () => a.unlock({ first: ['m-hello'] }),
    play: () => a.play('m-hello'),
    go: () => { went++; },
  });
  const elapsed = Date.now() - t0;
  process.off('unhandledRejection', onRej);
  assert.equal(ok, true);
  assert.equal(went, 1);
  assert.equal(gate.phase, 'done');
  // Budget: DECODE_MS (1500) + ensureRunning RESUME_MS (200) ≈ 1.7 s, plus timer slack.
  assert.ok(elapsed < DECODE_MS + 700, `hello gate took ${elapsed} ms (budget ~2 s)`);
  assert.ok(elapsed >= DECODE_MS - 100, `hello gate returned too fast (${elapsed} ms)`);
  assert.equal(a.unlocked, false);
  assert.equal((window.__kitAudioLog || []).filter(e => e.id === 'm-hello').length, 0);
  assert.equal(env.sourceStarts(), 0);
  const starts = env.sourceStarts();
  const logged = (window.__kitAudioLog || []).length;
  env.resolvePending();
  await sleep(120);
  assert.equal(env.sourceStarts(), starts, 'late decode must not auto-play after the gate has moved on');
  assert.equal((window.__kitAudioLog || []).length, logged);
  assert.equal(rejections.length, 0);
});

test('load() clears the decode timeout when decode finishes first', { timeout: 3000 }, async () => {
  installDom();
  const realSet = globalThis.setTimeout.bind(globalThis);
  const realClear = globalThis.clearTimeout.bind(globalThis);
  const pending = new Map();
  globalThis.setTimeout = (fn, ms, ...args) => {
    const handle = realSet(() => { pending.delete(handle); fn(...args); }, ms, ...args);
    pending.set(handle, ms);
    return handle;
  };
  globalThis.clearTimeout = handle => {
    pending.delete(handle);
    return realClear(handle);
  };
  try {
    installAudio({ initialState: 'running' });
    const { createAudio, DECODE_MS } = await import('../js/audio.js?clear-decode-timer');
    const a = await createAudio({ early: [] });
    await a.unlock({ first: ['m-hello'] });
    await a.play('sfx-chime');
    const leftover = [...pending.values()].filter(ms => ms >= DECODE_MS - 100);
    assert.deepEqual(leftover, [], `${leftover.length} DECODE_MS timer(s) still pending after a fast decode: ${leftover}`);
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
});
