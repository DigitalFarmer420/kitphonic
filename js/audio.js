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
// play() must never hang: onended can be skipped if the context is suspended/interrupted (iPad app switch).
const PLAY_MARGIN_MS = 400, PLAY_TIMEOUT_CAP_MS = 10_000, RESUME_MS = 200, UNLOCK_RESUME_MS = 500;
// Hung decodeAudioData or fetch must not block unlock() or play() — otherwise hello Play never
// reaches the map (resume fallbacks never run). 1500 ms is long enough for a normal decode;
// with UNLOCK_RESUME_MS (500) + play()'s RESUME_MS (200) the hello gate stays under ~2 s.
// A late success is cached for a later play but never auto-plays. A timeout does not store
// null, so a later retry can decode again once the hung attempt settles as a failure.
export const DECODE_MS = 1500;
export function endedWaitMs(durSec) { // missing / NaN / non-finite / negative -> 10 s cap, never NaN
  const n = Number(durSec);
  if (!Number.isFinite(n) || n < 0) return PLAY_TIMEOUT_CAP_MS;
  return Math.min(PLAY_TIMEOUT_CAP_MS, Math.round(n * 1000) + PLAY_MARGIN_MS);
}
const resumers = new Set();
let visHooked = false;
function hookVisibility(fn) { // once per module; each audio instance adds its own resume
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (typeof document.addEventListener !== 'function' || typeof window.addEventListener !== 'function') return;
  resumers.add(fn);
  if (visHooked) return;
  visHooked = true;
  const onShow = ev => {
    if (ev?.type === 'visibilitychange' && document.hidden) return;
    for (const f of resumers) { try { f(); } catch {} }
  };
  document.addEventListener('visibilitychange', onShow);
  window.addEventListener('pageshow', onShow);
}
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
  const now = () => performance.now();
  const wait = ms => new Promise(r => { const t = setTimeout(() => { timers.delete(t); r(); }, ms); timers.set(t, r); });
  // startLoad is unbounded: the in-flight promise stays until it settles. load() races it
  // against DECODE_MS so unlock()/play() can move on; a late success is then cached, and a
  // failure is dropped so a later retry is not stuck on null or a hung promise.
  function startLoad(id) {
    const c = byId.get(id), f = fileFor(c); if (!f || !ctx) return Promise.resolve(null);
    if (buffers.has(id)) return buffers.get(id);
    const p = raw.get(f); raw.delete(f); // raw bytes are single-use (decodeAudioData detaches them)
    let work;
    work = (p ?? bytes(f)).then(b => b && ctx.decodeAudioData(b)).then(buf => buf || null, () => null).then(buf => {
      if (!buf && buffers.get(id) === work) buffers.delete(id); // failed: don't poison the cache
      return buf;
    });
    work.__t0 = now();
    buffers.set(id, work);
    return work;
  }
  function load(id) { // bounded: hung decode/fetch must not block unlock() or play()
    const work = startLoad(id);
    const remaining = work.__t0 != null ? DECODE_MS - (now() - work.__t0) : DECODE_MS;
    if (remaining <= 0) return Promise.race([work, Promise.resolve(null)]);
    let t;
    const timeout = new Promise(r => {
      t = setTimeout(() => { timers.delete(t); r(null); }, remaining);
      timers.set(t, () => r(null)); // stop() clears and resolves so load() cannot hang
    });
    return Promise.race([work, timeout]).finally(() => { if (t) { clearTimeout(t); timers.delete(t); } });
  }
  const queue = []; let active = 0;
  function pump() { // at most 4 background loads in flight
    while (active < 4 && queue.length && ctx) { const id = queue.shift(); if (buffers.has(id)) continue; active++; startLoad(id).finally(() => { active--; pump(); }); }
  }
  const resumeContext = () => { // suspended or interrupted (iOS); never reject
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    try { return Promise.resolve(ctx.resume()).catch(() => {}); } catch { return Promise.resolve(); }
  };
  hookVisibility(resumeContext);
  async function ensureRunning() {
    if (!ctx || ctx.state === 'running') return true;
    if (ctx.state === 'closed') return false;
    const p = resumeContext();
    if (ctx.state === 'running') return true;
    await Promise.race([p || Promise.resolve(), wait(RESUME_MS)]);
    return ctx.state === 'running';
  }
  function waitEnded(s, ms, onDone) { // resolve on onended, stop(), or timeout; s.stop() still runs first
    return new Promise(r => {
      let settled = false, tid = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (tid) { clearTimeout(tid); tid = 0; }
        s.__endTid = 0;
        sources.delete(s);
        try { onDone?.(); } catch {}
        r();
      };
      s.onended = s.__finish = finish;
      tid = setTimeout(finish, ms);
      s.__endTid = tid;
    });
  }
  // --- rc5 serial queue ---
  let tail = Promise.resolve(), pending = 0, lastEnd = -Infinity; // lastEnd: when the last clip finished (a cut = -Infinity)
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
    if (!(await ensureRunning()) || my !== gen) return; // can't resume promptly: resolve, don't hang or schedule
    let at = null; const ends = [];
    for (const [k, c] of clips.entries()) {
      const rate = SPOKEN.test(c.id) ? rate0 * speechRate() : rate0, buf = bufs[k];
      const via = buf ? (c.take ? 'take' : 'file') : hasSpeech() && c.tts ? 'tts' : 'tone';
      onClip(c, via);
      if (buf) {
        const [lead, trail] = clips.length > 1 ? edges(buf) : [0, 0], dur = (buf.duration - lead - (k < clips.length - 1 ? trail : 0)) / rate;
        at ??= ctx.currentTime + (clips.length > 1 ? 0.05 : 0); // a phrase is scheduled 50 ms ahead so its 1st clip can't start late and run into the 2nd
        const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; s.connect(ctx.destination); sources.add(s);
        const e = { id: c.id, via, rate, t: Math.round(now() + (at - ctx.currentTime) * 1000) }; log.push(e);
        const waitMs = endedWaitMs(dur), known = Number.isFinite(dur) && dur >= 0;
        s.start(at, lead, known ? dur * rate : undefined); at += known ? dur : waitMs / 1000;
        const sched = e.t + (known ? dur * 1000 : waitMs); s.__e = e; s.__end = sched; e.a = at * 1000 - (known ? dur * 1000 : waitMs); e.b = at * 1000; // a/b: audio clock (ms)
        ends.push(waitEnded(s, waitMs, () => { const end = Math.round(sched); e.end ??= Number.isFinite(end) ? end : Math.round(now()); }));
      } else { // no buffer: speech / tone, strictly after whatever was scheduled before it
        await Promise.all(ends.splice(0)); at = null; if (my !== gen) return;
        const e = { id: c.id, via, rate, t: Math.round(now()), a: ctx ? ctx.currentTime * 1000 : undefined }; log.push(e);
        await (via === 'tts' ? speak(c.tts, rate) : tone(c.id, rate)); e.end = Math.round(now()); if (ctx) e.b = ctx.currentTime * 1000;
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
    sources.add(o); return waitEnded(o, endedWaitMs(dur + 0.02));
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
      // resume() can hang on a suspended/interrupted context; bound the wait so hello Play cannot stall
      const resumed = ctx.state !== 'running' ? Promise.race([resumeContext() || Promise.resolve(), wait(UNLOCK_RESUME_MS)]) : null; // in parallel with decoding (rc4)
      if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
      // rc3: ~830 recorded takes. Only the sfx + the greeting gate the first play (bytes already fetched at load, rc4); the short, hot clips (letter
      // sounds/names, Kit's lines) warm in the background; words/sentences load per session (warm) or on first play.
      await Promise.all([resumed, ...manifest.clips.filter(c => fileFor(c) && (c.kind === 'sfx' || first.includes(c.id))).map(c => load(c.id))]);
      api.warm(manifest.clips.filter(c => fileFor(c) && HOT.test(c.id)).map(c => c.id));
      return ctx.state;
    },
    preload: ids => Promise.all(ids.map(startLoad)),
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
      for (const s of [...sources]) {
        if (s.__e) {
          const cap = Number.isFinite(s.__end) ? s.__end : cutAt;
          const end = Math.round(Math.min(cutAt, cap));
          s.__e.end ??= Number.isFinite(end) ? end : cutAt; // never log end: NaN
          if (Number.isFinite(s.__e.b) && s.__e.b > ctx.currentTime * 1000) s.__e.b = Math.max(s.__e.a, ctx.currentTime * 1000);
        } /* cut before its start = never heard (end < t) */
        try { s.stop(); } catch {} // stop first so the audio-clock interval is truncated
        if (s.__endTid) { clearTimeout(s.__endTid); s.__endTid = 0; }
        try { s.__finish?.(); } catch {} // if onended never fired, resolve play() now and drop the duration fallback
      } sources.clear();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    },
  };
  return api;
}
