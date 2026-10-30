// Error patterns (spec §3.7.1, §3.8.4) over the last 14 days of first-attempt misses (modelled reads excluded):
//  - letter mix-ups: a letter game target vs the letter picked (b/d, m/n …), >= 2 in either direction
//  - blend contrasts: which position the wrong pick differed in (vowel = short vowels, final, onset), >= 3
// Pure; feeds both the planner (extra practice) and the grown-ups "Watch for" note.
import { DAY } from './mastery.js';
export const PATTERN_DAYS = 14, PAIR_MIN = 2, CONTRAST_MIN = 3;
export function errorPatterns(responses, now = Date.now()) {
  const recent = responses.filter(r => r.firstAttempt && !r.correct && !r.modelled && r.timestamp >= now - PATTERN_DAYS * DAY && r.timestamp <= now);
  const pairs = new Map();
  for (const r of recent) if (/^(sound|name):/.test(r.skill ?? '') && r.picked && r.picked !== r.itemId) {
    const [a, b] = [r.itemId, r.picked].sort(), k = `${a}|${b}`;
    pairs.set(k, { a, b, n: (pairs.get(k)?.n ?? 0) + 1 });
  }
  const by = new Map(); for (const r of recent) if (r.skill?.startsWith('blend:') && r.contrast) by.set(r.contrast, (by.get(r.contrast) ?? 0) + 1);
  return {
    pairs: [...pairs.values()].filter(p => p.n >= PAIR_MIN).sort((x, y) => y.n - x.n),
    contrasts: [...by].filter(([, n]) => n >= CONTRAST_MIN).sort((x, y) => y[1] - x[1]).map(([pos, n]) => ({ pos, n })),
  };
}
