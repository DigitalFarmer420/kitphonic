// Grown-ups view data (spec §3.8.4): a plain summary of the local response log. Pure, so it is testable.
import { skillState, skills, DAY } from './mastery.js';
import { mapState } from './progress.js';

const STATE_LABEL = { new: 'not yet', practicing: 'practicing', secure: 'secure', mastered: 'mastered', 'review-due': 'review due' };
export { STATE_LABEL };
export function parentSummary(responses, now = Date.now()) {
  const map = mapState(responses, now), all = skills(responses);
  const of = prefix => all.filter(s => s.startsWith(prefix)).map(s => ({ id: s.slice(prefix.length), ...skillState(responses, s, now) }));
  const sounds = of('sound:'), stars = of('star:'), blends = of('blend:');
  const sessions = new Map();
  for (const r of responses) { if (!r.sessionId) continue; const s = sessions.get(r.sessionId) ?? { a: r.timestamp, b: r.timestamp }; s.a = Math.min(s.a, r.timestamp); s.b = Math.max(s.b, r.timestamp); sessions.set(r.sessionId, s); }
  const week = [...sessions.values()].filter(s => s.b >= now - 7 * DAY);
  const wordsRead = new Set(responses.filter(r => r.skill?.startsWith('blend:') && r.correct).map(r => r.itemId)).size;
  const cur = map.stops[map.index];
  return {
    stop: cur ? { label: cur.label, index: map.index + 1, of: map.stops.length } : { label: 'all done', index: map.stops.length, of: map.stops.length },
    sounds, stars, blends, wordsRead,
    sentences: new Set(responses.filter(r => r.skill?.startsWith('sentence:')).map(r => r.itemId)).size,
    sessionsThisWeek: week.length,
    minutesThisWeek: Math.round(week.reduce((t, s) => t + (s.b - s.a), 0) / 6e4),
    needsPractice: [...sounds, ...stars, ...blends].filter(s => s.state === 'review-due' || (s.state === 'practicing' && s.trials >= 3 && s.accuracy < 0.6)).map(s => s.skill),
  };
}
