// Kitphonic audio (browser). Resolution order per clip id (audio/manifest.json):
//   1. recorded take   (audio/takes/<id>.<ext>)        -> Web Audio buffer (hot clips warmed after unlock, the rest per session / on demand)
//   2. placeholder file (e.g. placeholder/sfx-chime.wav) -> Web Audio buffer
//   3. browser speech  (speechSynthesis, manifest `tts` text) — placeholder voice only
//   4. soft tone        (Web Audio) when no voice exists (e.g. headless test browsers)
// Every play is logged to window.__kitAudioLog for tests/debugging.
// speechRate(): the grown-ups 'Kit's talking speed' (0.85 / 1 / 1.15). It applies to spoken words and sentences
// (Kit's lines, words, star words, sentences, picture words) but never to letter sounds or the slider's phonemes,
// whose timing is part of the blending design.
export const SPOKEN = /^(m-|word-|star-|sent-|pic-)/;
export const HOT = /^(snd-|name-|m-|sfx-)/; // small clips warmed right after unlock
export async function createAudio({ base = 'audio/', onClip = () => {}, speechRate = () => 1 } = {}) {
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

  async function load(id) {
    const c = byId.get(id), f = fileFor(c); if (!f || !ctx) return null;
    if (!buffers.has(id)) buffers.set(id, fetch(base + f).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => ctx.decodeAudioData(b)).catch(() => null));
    return buffers.get(id);
  }
  const queue = []; let active = 0;
  function pump() { // at most 4 background loads in flight
    while (active < 4 && queue.length && ctx) { const id = queue.shift(); if (buffers.has(id)) continue; active++; load(id).finally(() => { active--; pump(); }); }
  }
  const wait = ms => new Promise(r => { const t = setTimeout(() => { timers.delete(t); r(); }, ms); timers.set(t, r); });

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
      if (ctx.state !== 'running') await ctx.resume().catch(() => {});
      if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
      // rc3: ~830 recorded takes. Only the sfx + the greeting gate the first play; the short, hot clips (letter
      // sounds/names, Kit's lines) warm in the background; words/sentences load per session (warm) or on first play.
      await Promise.all(manifest.clips.filter(c => fileFor(c) && (c.kind === 'sfx' || first.includes(c.id))).map(c => load(c.id)));
      api.warm(manifest.clips.filter(c => fileFor(c) && HOT.test(c.id)).map(c => c.id));
      return ctx.state;
    },
    preload: ids => Promise.all(ids.map(load)),
    // Background fetch+decode with low concurrency so it never competes with first paint or the clip being played.
    warm(ids) { queue.push(...ids.filter(id => byId.has(id) && !buffers.has(id))); pump(); },
    get loadedCount() { return buffers.size; },
    get unlocked() { return ctx?.state === 'running'; },
    async play(id, { rate = 1, delayMs = 0 } = {}) {
      const my = gen; if (delayMs) await wait(delayMs); if (my !== gen) return;
      const c = byId.get(id); if (!c) { console.warn('unknown clip', id); return; }
      if (SPOKEN.test(id)) rate *= speechRate();
      const buf = await load(id);
      const via = buf ? (c.take ? 'take' : 'file') : hasSpeech() && c.tts ? 'tts' : 'tone';
      log.push({ id, via, rate, t: Math.round(performance.now()) }); onClip(c, via);
      if (buf) {
        const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; s.connect(ctx.destination);
        sources.add(s); s.start();
        return new Promise(r => (s.onended = () => { sources.delete(s); r(); }));
      }
      return via === 'tts' ? speak(c.tts, rate) : tone(id, rate);
    },
    stop() { // cancel queued + playing audio (new word, interrupting tap)
      gen++; for (const [t, r] of timers) { clearTimeout(t); r(); } timers.clear();
      for (const s of sources) { try { s.stop(); } catch {} } sources.clear();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    },
  };
  return api;
}
