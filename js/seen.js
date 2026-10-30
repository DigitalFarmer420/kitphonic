// How many times the child has met each activity kind — drives the ghost hand (design notes 13/18): it demonstrates
// the gesture on the first meetings (DEMO_TIMES), and after 5 s idle at any time. Local only.
export const DEMO_TIMES = 2;
export function createSeen(storage, key = 'kitphonic.v1.seen') {
  let s = {}; try { s = JSON.parse(storage?.getItem(key) || '{}'); } catch {}
  return {
    count: kind => s[kind] ?? 0,
    demo: kind => (s[kind] ?? 0) < DEMO_TIMES,
    mark(kind) { s[kind] = (s[kind] ?? 0) + 1; storage?.setItem(key, JSON.stringify(s)); },
    reset() { s = {}; storage?.removeItem(key); },
  };
}
export const noSeen = { count: () => 0, demo: () => false, mark() {}, reset() {} };
