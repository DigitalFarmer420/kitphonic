// How many times the child has met each activity kind — drives the ghost hand (design notes 13/18): it demonstrates
// the gesture on the first meetings (DEMO_TIMES), and after 5 s idle at any time. Local only.
// Counts follow the storage (re-read when its value changes), so a Grown-ups preview overlay (js/preview.js) sees its
// own counts and the child's counts come back unchanged when the preview ends.
export const DEMO_TIMES = 2;
export function createSeen(storage, key = 'kitphonic.v1.seen') {
  let raw, s = {};
  const cur = () => {
    let r = null; try { r = storage?.getItem(key) ?? null; } catch {}
    if (r !== raw) { raw = r; try { s = JSON.parse(r || '{}') ?? {}; } catch { s = {}; } }
    return s;
  };
  cur();
  return {
    count: kind => cur()[kind] ?? 0,
    demo: kind => (cur()[kind] ?? 0) < DEMO_TIMES,
    mark(kind) {
      const o = cur(); o[kind] = (o[kind] ?? 0) + 1;
      try { const v = JSON.stringify(o); storage?.setItem(key, v); raw = storage?.getItem(key) ?? raw; } catch { /* full storage: keep the count in memory, never block Next */ }
    },
    reset() { s = {}; raw = null; storage?.removeItem(key); },
  };
}
export const noSeen = { count: () => 0, demo: () => false, mark() {}, reset() {} };
