// Kitphonic audio (browser). Resolution order per clip id (audio/manifest.json):
//   1. recorded take   (audio/takes/<id>.<ext>)        -> Web Audio buffer (hot clips warmed after unlock, the rest per session / on demand)
//   2. placeholder file (e.g. placeholder/sfx-chime.wav) -> Web Audio buffer
//   3. browser speech  (speechSynthesis, manifest `tts` text) — placeholder voice only
//   4. soft tone        (Web Audio) when no voice exists (e.g. headless test browsers)
// Every play is logged to window.__kitAudioLog ({id, via, t, end} ms) for tests/debugging. rc5: one sound at a time (see play()).
// speechRate(): the grown-ups 'Kit's talking speed' (0.85 / 1 / 1.15). It applies to spoken words and sentences
// (Kit's lines, words, star words, sentences, picture words) but never to letter sounds or the slider's phonemes,
// whose timing is part of the blending design.
export const SPOKEN = /^(m-|word-|star-|sent-|pic-)/;
export const HOT = /^(snd-|name-|m-|sfx-)/; // small clips warmed right after unlock
// rc4: files fetched as raw bytes at page load (no gesture needed) so the first tap plays at once. Conventional paths
// (takes/<id>.mp3) so the fetch can start before the manifest arrives; index.html also
// <link rel=preload>s them. Ids must stay in sync with EARLY_CLIPS there (tests/audio.test.mjs checks).
export const EARLY_CLIPS = ['m-hello', 'sfx-chime', 'sfx-tap', 'm-letter-says', 'm-tap-it'];
export const earlyFile = id => `takes/${id}.mp3`; // rc4: the sfx are small MP3 takes too (chime wav 70 KB -> 7 KB)
export async function createAudio({ base = 'audio/', onClip = () => {}, speechRate = () => 1, early = EARLY_CLIPS } = {}) {
  const raw = new Map(early.map(id => [earlyFile(id), fetch(base + earlyFile(id)).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null)]));
  const manifest = await (await fetch(base + 'manifest.json')).json();
  const byId = new Map(manifest.clips.map(c => [c.id, c]));
  const log = (window.__kitAudioLog = []);
  let ctx = null, voice = null, timers = new Map(), sources = new Set(), gen = 0;
  const buffers = new Map();
  const fileFor = c => c?.take || (c?.placeholder && c.placeholder !== 'tts' ? c.placeholder : null);
  const hasSpeech = () => 'speechSynthesis' in window && speechSynthesis.getVoices().length > 0;
  const pickVoice = () => {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    voice = vs.find(v => /samantha|karen|female|google us english/i.test(v.name)) || vs[0] || null;
  };
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

  const bytes = f => raw.get(f) ?? fetch(base + f).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
  async function load(id) {
    const c = byId.get(id), f = fileFor(c); if (!f || !ctx) return null;
    if (!buffers.has(id)) { const p = raw.get(f); raw.delete(f); // raw bytes are single-use (decodeAudioData detaches them)
      buffers.set(id, (p ?? bytes(f)).then(b => b && ctx.decodeAudioData(b)).catch(() => null)); }
    return buffers.get(id);
  }
  const queue = []; let active = 0;
  function pump() { // at most 4 background loads in flight
    while (active < 4 && queue.length && ctx) { const id = queue.shift(); if (buffers.has(id)) continue; active++; load(id).finally(() => { active--; pump(); }); }
  }
  const wait = ms => new Promise(r => { const t = setTimeout(() => { timers.delete(t); r(); }, ms); timers.set(t, r); });
  // --- rc5 serial queue ---
  let tail = Promise.resolve(), pending = 0, lastEnd = -Infinity; // lastEnd: when the last clip finished (a cut = -Infinity)
  const now = () => performance.now();
  function edges(buf) { // [lead, tail] silence (s) below -50 dBFS, cached; phrases skip it so clips join without a gap
    if (buf.__edges) return buf.__edges;
    const d = buf.getChannelData(0), th = 0.003, n = d.length; let a = 0, b = n - 1;
    while (a < n && Math.abs(d[a]) < th) a++; while (b > a && Math.abs(d[b]) < th) b--;
    const sr = buf.sampleRate; return (buf.__edges = a >= n ? [0, 0] : [Math.max(0, a / sr - 0.01), Math.max(0, (n - 1 - b) / sr - 0.02)]);
  }
  function enqueue(ids, { rate, delayMs, gapMs }) {
    const my = gen, called = now(); pending++;
    const job = tail.then(async () => {
      if (my !== gen) return;
      const gap = Math.max(gapMs ?? 250 - (now() - lastEnd), delayMs - (now() - called)); // >= 250 ms after the previous clip unless gapMs says otherwise
      if (gap > 0) await wait(gap);
      if (my !== gen) return;
      await run(ids, rate, my); if (my === gen) lastEnd = now();
    }).finally(() => { if (my === gen) pending = Math.max(0, pending - 1); });
    tail = job.catch(() => {});
    return job;
  }
  async function run(ids, rate0, my) { // one phrase: clips scheduled back to back on the audio clock
    const clips = ids.map(id => byId.get(id)).filter(c => c || (console.warn('unknown clip', ids), false));
    const bufs = await Promise.all(clips.map(c => load(c.id)));
    if (my !== gen) return;
    let at = null; const ends = [];
    for (const [k, c] of clips.entries()) {
      const rate = SPOKEN.test(c.id) ? rate0 * speechRate() : rate0, buf = bufs[k];
      const via = buf ? (c.take ? 'take' : 'file') : hasSpeech() && c.tts ? 'tts' : 'tone';
      onClip(c, via);
      if (buf) {
        const [lead, trail] = clips.length > 1 ? edges(buf) : [0, 0], dur = (buf.duration - lead - (k < clips.length - 1 ? trail : 0)) / rate;
        at ??= ctx.currentTime + (clips.length > 1 ? 0.025 : 0); // a phrase is scheduled 25 ms ahead so its 1st clip can't start late and run into the 2nd
        const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; s.connect(ctx.destination); sources.add(s);
        const e = { id: c.id, via, rate, t: Math.round(now() + (at - ctx.currentTime) * 1000) }; log.push(e);
        s.start(at, lead, dur * rate); at += dur;
        const sched = e.t + dur * 1000; s.__e = e; s.__end = sched; // log the exact scheduled end (onended fires a few ms late on the main thread)
        ends.push(new Promise(r => (s.onended = () => { sources.delete(s); e.end ??= Math.round(sched); r(); })));
      } else { // no buffer: speech / tone, strictly after whatever was scheduled before it
        await Promise.all(ends.splice(0)); at = null; if (my !== gen) return;
        const e = { id: c.id, via, rate, t: Math.round(now()) }; log.push(e);
        await (via === 'tts' ? speak(c.tts, rate) : tone(c.id, rate)); e.end = Math.round(now());
      }
    }
    await Promise.all(ends);
  }

  function tone(id, rate) { // gentle sine blip; pitch varies by clip so sequences are distinguishable
    if (!ctx) return Promise.resolve();
    let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const o = ctx.createOscillator(), g = ctx.createGain(), dur = (id.startsWith('snd-') && id.endsWith('-held') ? 0.6 : 0.22) / rate;
    o.frequency.value = 330 + (h % 12) * 40; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur + 0.02);
    sources.add(o); return new Promise(r => (o.onended = () => { sources.delete(o); r(); }));
  }
  function speak(text, rate) {
    return new Promise(res => {
      const u = new SpeechSynthesisUtterance(text); if (voice) u.voice = voice;
      u.rate = Math.min(2, 0.9 * rate); u.pitch = 1.15;
      const done = () => { clearTimeout(t); res(); }; const t = setTimeout(done, 900 + text.length * 110);
      u.onend = u.onerror = done; speechSynthesis.speak(u);
    });
  }

  const api = {
    manifest, byId,
    // Call from a user gesture (hello screen). Unlocks Web Audio + speech on iOS/Chrome autoplay policies.
    async unlock({ first = ['m-hello'] } = {}) {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      const resumed = ctx.state !== 'running' ? ctx.resume().catch(() => {}) : null; // in parallel with decoding (rc4)
      if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
      // rc3: ~830 recorded takes. Only the sfx + the greeting gate the first play (bytes already fetched at load, rc4); the short, hot clips (letter
      // sounds/names, Kit's lines) warm in the background; words/sentences load per session (warm) or on first play.
      await Promise.all([resumed, ...manifest.clips.filter(c => fileFor(c) && (c.kind === 'sfx' || first.includes(c.id))).map(c => load(c.id))]);
      api.warm(manifest.clips.filter(c => fileFor(c) && HOT.test(c.id)).map(c => c.id));
      return ctx.state;
    },
    preload: ids => Promise.all(ids.map(load)),
    // Background fetch+decode with low concurrency so it never competes with first paint or the clip being played.
    warm(ids) { queue.push(...ids.filter(id => byId.has(id) && !buffers.has(id))); pump(); },
    get loadedCount() { return buffers.size; },
    get earlyPending() { return raw.size; },
    get unlocked() { return ctx?.state === 'running'; },
    // rc5 — ONE SOUND AT A TIME (owner + Uiux): every clip (voice or sfx) goes through one serial queue. A clip never
    // starts while another plays: it waits for the previous one to end, then `gapMs` (default 250 ms when it had to
    // wait, 0 when the queue was idle) and at least `delayMs` from the call. A child's tap calls stop() first, which cuts
    // Kit off and drops everything queued, so rapid taps cannot stack. say() = one phrase, clips joined end-to-start
    // with their edge silence skipped (no gap, no overlap: "Find… t").
    play(id, { rate = 1, delayMs = 0, gapMs } = {}) { return enqueue([id], { rate, delayMs, gapMs }); },
    say(ids, { rate = 1, delayMs = 0, gapMs } = {}) { ids = ids.filter(Boolean); return ids.length ? enqueue(ids, { rate, delayMs, gapMs }) : Promise.resolve(); },
    get busy() { return pending > 0; },
    stop() { // cancel queued + playing audio (new word, interrupting tap)
      gen++; pending = 0; tail = Promise.resolve();
      for (const [t, r] of timers) { clearTimeout(t); r(); } timers.clear();
      const cutAt = Math.round(now()); lastEnd = -Infinity; // a child's tap: the next sound may start at once
      for (const s of sources) { if (s.__e) s.__e.end ??= Math.round(Math.min(cutAt, s.__end ?? cutAt)); /* cut before its start = never heard (end < t) */ try { s.stop(); } catch {} } sources.clear();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    },
  };
  return api;
}
