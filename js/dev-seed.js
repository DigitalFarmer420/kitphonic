// Dev/testing only: fabricate a response log so the app opens at a given map stop (?progress=N stops passed,
// ?due=1 makes the passed stops' spaced review due today). Never used in normal runs.
import { STOPS } from './progress.js';
import { DAY, RULES } from './mastery.js';
export function seedProgress(passed, { now = Date.now(), due = false, stops = STOPS } = {}) {
  const out = [], days = due ? [3, 2] : [1, 0]; // mastered 2 days ago -> review due (1-day step); yesterday+today -> not due
  for (const s of stops.slice(0, passed)) {
    const n = s.skill.startsWith('blend:') ? RULES.masterMinTrialsBlend : RULES.masterMinTrials;
    days.forEach((d, si) => { for (let i = 0; i < n; i++) out.push({ skill: s.skill, itemId: s.gpc ?? s.label, correct: true, firstAttempt: true,
      assisted: false, scored: true, timestamp: now - d * DAY - (passed - out.length % 50) * 1000 - (n - i) * 2000 - (d === 0 ? 60000 : 0), sessionId: `seed-${d}-${si}`, seeded: true }); });
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}
export function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
