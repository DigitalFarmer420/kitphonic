// rc5: the audio layer plays ONE sound at a time. Real createAudio() against a fake Web Audio clock (real timers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORRECT, CHIME_QUIET_MS, PRAISE, praise } from '../js/feedback.js';

const DUR = { 'm-find-letter': 0.12, 'name-t': 0.06, 'sfx-chime': 0.08, 'm-yes': 0.05, 'snd-t': 0.03, 'm-tap-it': 0.05, 'word-cat': 0.07, 'm-level-up': 0.06 };
const SR = 1000, LEAD = 0.02, TAIL = 0.03; // every fake clip has 20 ms silence in front, 30 ms behind
function fakeEnv() { // sources keep exact audio-clock intervals [a, b] (s), like sample-accurate Web Audio; onended never fires early
  const t0 = performance.now(), ivs = [];
  class Ctx {
    state = 'running'; destination = {};
    get currentTime() { return (performance.now() - t0) / 1000; }
    resume() { return Promise.resolve(); }
    async decodeAudioData(b) { const d = new Float64Array(b)[0], n = Math.round(d * SR), ch = new Float32Array(n);
      for (let i = Math.round(LEAD * SR); i < n - Math.round(TAIL * SR); i++) ch[i] = 0.5;
      return { duration: d, sampleRate: SR, length: n, getChannelData: () => ch }; }
    createBufferSource() { const ctx = this, s = { playbackRate: { value: 1 }, connect() {}, onended: null,
      start(when = 0, offset = 0, dur) { const now = ctx.currentTime, a = Math.max(when, now), len = dur ?? s.buffer.duration - offset;
        s.iv = { a, b: a + len, d: s.buffer.duration, gen: globalThis.__g }; ivs.push(s.iv); s.off = setTimeout(() => s.end(), Math.ceil((s.iv.b - now) * 1000) + 1); },
      stop() { clearTimeout(s.off); if (s.iv) s.iv.b = Math.min(s.iv.b, ctx.currentTime); s.end(); },
      end() { if (s.done) return; s.done = true; s.onended?.(); } }; return s; }
  }
  globalThis.window = globalThis; globalThis.AudioContext = Ctx;
  const clips = Object.keys(DUR).map(id => ({ id, kind: id.startsWith('sfx') ? 'sfx' : 'x', tts: id, take: `takes/${id}.mp3` }));
  globalThis.fetch = async url => url.endsWith('manifest.json') ? { ok: true, json: async () => ({ clips }) }
    : { ok: true, arrayBuffer: async () => new Float64Array([DUR[url.match(/takes\/(.+)\.mp3$/)[1]]]).buffer };
  const peak = () => { const ev = ivs.filter(v => v.b - v.a > 1e-4).flatMap(v => [[v.a, 1], [v.b - 1e-4, -1]]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let n = 0, m = 0; for (const [, d] of ev) m = Math.max(m, (n += d)); return m; }; // 0.1 ms tolerance at a joint
  return { peak };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const overlaps = log => { const s = log.filter(e => !(e.end < e.t)).sort((a, b) => a.t - b.t); const bad = [];
  for (let i = 1; i < s.length; i++) if (s[i].t < (s[i - 1].end ?? Infinity) - 15) bad.push([s[i - 1], s[i]]); return bad; };

test('one sound at a time: queued clips never overlap; a phrase joins gaplessly; stop() cuts and drops the queue', async () => {
  const env = fakeEnv(); const { createAudio } = await import('../js/audio.js?q1');
  const a = await createAudio({ early: [] }); await a.unlock({ first: [] });
  // correct tap: chime, then (Kit's next prompt) a phrase — issued at the same moment, must play one after the other
  const chime = a.play('sfx-chime'); const phrase = a.say(['m-find-letter', 'name-t']);
  await Promise.all([chime, phrase]);
  const L = window.__kitAudioLog; assert.deepEqual(L.map(e => e.id), ['sfx-chime', 'm-find-letter', 'name-t']);
  assert.ok(L[1].t >= L[0].end + 240, `prompt waits for the chime + ~250 ms (${L[1].t - L[0].end} ms)`);
  // "Find… t": the letter starts where "Find…"'s sound ends (its 30 ms tail skipped), no overlap, no gap beyond the clips' own silence
  const joint = L[2].t - L[1].t; assert.ok(Math.abs(joint - (DUR['m-find-letter'] - LEAD + 0.01 - TAIL + 0.02) * 1000) < 25, `joint ${joint} ms`);
  assert.equal(overlaps(L).length, 0); assert.equal(env.peak(), 1);
  // rapid taps: each tap = stop() + play(); nothing stacks, only the last tap's clip finishes
  window.__kitAudioLog.length = 0;
  for (let i = 0; i < 6; i++) { a.stop(); a.play('word-cat'); a.play('m-tap-it'); await sleep(15); }
  await sleep(400);
  assert.equal(env.peak(), 1, 'never two sources at once'); assert.equal(overlaps(window.__kitAudioLog).length, 0);
  assert.equal(window.__kitAudioLog.filter(e => e.id === 'm-tap-it').length, 1, 'queued clips of interrupted taps are dropped');
  assert.equal(a.busy, false);
});

test('simulated session: random prompts, taps, chimes and praise never put two sounds on top of each other', async () => {
  const env = fakeEnv(); const { createAudio } = await import('../js/audio.js?q2');
  const a = await createAudio({ early: [] }); await a.unlock({ first: [] }); window.__kitAudioLog.length = 0;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ids = Object.keys(DUR), jobs = [];
  for (let step = 0; step < 60; step++) {
    const r = rnd();
    if (r < 0.25) { a.stop(); jobs.push(a.play(CORRECT[0])); } // a tap (cuts Kit off)
    else if (r < 0.55) jobs.push(a.say([ids[Math.floor(rnd() * ids.length)], ids[Math.floor(rnd() * ids.length)]]));
    else if (r < 0.8) jobs.push(a.play(ids[Math.floor(rnd() * ids.length)], { delayMs: Math.floor(rnd() * 80) }));
    else jobs.push(a.play('snd-t', { gapMs: 0 })); // slider phonemes join end-to-start
    await sleep(Math.floor(rnd() * 60));
  }
  await Promise.all(jobs); await sleep(50);
  const L = window.__kitAudioLog; assert.ok(L.length > 20, `${L.length} clips played`);
  assert.equal(env.peak(), 1, 'never two sounds at once (audio-clock intervals)'); assert.deepEqual(overlaps(L), []);
});

test('feedback rules: a correct tap is the chime only; quiet before the next prompt; praise only from milestone pools, varied', () => {
  assert.deepEqual(CORRECT, ['sfx-chime']); assert.ok(CHIME_QUIET_MS >= 300 && CHIME_QUIET_MS <= 500);
  for (const pool of Object.values(PRAISE)) assert.ok(pool.length >= 2);
  let last = null; for (let i = 0; i < 20; i++) { const p = praise('letters', Math.random, last); assert.notEqual(p, last); last = p; }
});
