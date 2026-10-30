// Parent settings (spec §3.8.4), saved on this device only.
export const DEFAULT_SETTINGS = {
  sessionMinutes: 7,         // 5 | 7 | 10 (spec §3.8.2: 5–10 minute sessions); 7 = the prototype default
  audioSpeed: 'normal',      // 'slow' | 'normal' | 'fast' (spec §3.8.3 adjustable audio speed)
  reducedMotion: 'auto',     // 'auto' (follow the device) | 'on' | 'off' — on stops drifting letters + animations
  speechRecognition: false,  // out of prototype scope (§3.9); shown disabled
  floatMode: 'sound',        // Floating Letters taps say the sound (default) or the letter name
  childName: '',
};
export const AUDIO_RATES = { slow: 0.85, normal: 1, fast: 1.15 };
export function createSettings(storage, key = 'kitphonic.v1.settings', media = globalThis.matchMedia) {
  let s = { ...DEFAULT_SETTINGS };
  try { Object.assign(s, JSON.parse(storage?.getItem(key) || '{}')); } catch {}
  const listeners = new Set();
  const api = {
    get: k => s[k], all: () => ({ ...s }),
    set(k, v) { if (!(k in DEFAULT_SETTINGS)) throw new Error(`unknown setting ${k}`); s[k] = v; storage?.setItem(key, JSON.stringify(s)); listeners.forEach(f => f(k, v)); },
    onChange: f => (listeners.add(f), () => listeners.delete(f)),
    reducedMotion: () => s.reducedMotion === 'on' || (s.reducedMotion === 'auto' && !!media?.('(prefers-reduced-motion: reduce)')?.matches),
    audioRate: () => AUDIO_RATES[s.audioSpeed] ?? 1,
    sessionMs: () => ([5, 7, 10].includes(s.sessionMinutes) ? s.sessionMinutes : 7) * 60e3,
    reset() { s = { ...DEFAULT_SETTINGS }; storage?.removeItem(key); listeners.forEach(f => f('*')); },
  };
  return api;
}
