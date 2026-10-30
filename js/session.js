// Session planner (pure). A 5–10 minute lesson that always starts with spaced review that is due, then the current
// map stop (a new sound, or a new word level once >= 4 sounds incl. a vowel are secure), then practice of shaky items,
// then mixed review to fill the time, ending on the all-done screen. The child never picks a level.
// Item shapes:
//   { type: 'letters', activity: 'float'|'soundTap'|'find'|'hunt', pool, targets?, rounds?, why }
//   { type: 'words', level, words: [entry], why }
//   { type: 'star', word, why }   (only when opts.stars: Star Word screen)
import { GPC, GPCS } from './sequence.js';
import { skillState, atLeast, knownGpcs, dueItems, blendingUnlocked } from './mastery.js';
import { mapState, activeSounds, servableWords, availableStars, STOPS, MIN_WORDS } from './progress.js';
import { shuffle } from './word-logic.js';

export const COST = { explore: 40, roundIntro: 10, round: 12, word: 35, star: 40 }; // seconds (estimates; tune in playtest)
export const MIN_MIN = 5, MAX_MIN = 10, DEFAULT_MIN = 7;
export function itemCost(it) {
  if (it.type === 'words') return it.words.length * COST.word;
  if (it.type === 'star') return COST.star;
  return it.targets ? COST.roundIntro + it.rounds * COST.round : COST.explore;
}
export const planCost = items => items.reduce((s, it) => s + itemCost(it), 0);

// Letters on offer: the newest introduced sounds (single-letter graphemes, <= 6). Untaught letters only pad the pool
// when fewer than 3 are known (then from the set being taught, which is introduced together). Targets are always
// introduced sounds.
export function letterPool(active, { size = 6, min = 3 } = {}) {
  const single = g => GPC[g]?.grapheme.length === 1 && g !== 's_z';
  const act = active.filter(single), pool = act.slice(-size);
  if (pool.length < min) {
    const set = GPC[act.at(-1)]?.set ?? 1;
    for (const g of [...GPCS.filter(g => g.set === set), ...GPCS].map(g => g.id)) { if (pool.length >= min) break; if (single(g) && !pool.includes(g)) pool.push(g); }
  }
  return pool;
}

export function planSession(responses, { now = Date.now(), minutes = DEFAULT_MIN, rand = Math.random, stars = false } = {}) {
  const budget = Math.max(MIN_MIN, Math.min(MAX_MIN, minutes)) * 60, minBudget = MIN_MIN * 60;
  const map = mapState(responses, now), cur = map.current, active = activeSounds(responses, now);
  const known = knownGpcs(responses, now), items = [];
  const st = s => skillState(responses, s, now);
  const room = it => planCost(items) + itemCost(it) <= budget;
  const push = it => { if (room(it)) { items.push(it); return true; } return false; };
  const pool = letterPool(active.length ? active : [GPCS[0].id]);
  const wordsAt = (lv, n) => { const ws = servableWords(lv, known); return ws.length >= MIN_WORDS ? shuffle(ws, rand).slice(0, n) : []; };
  const passedLevels = map.stops.filter(s => s.kind === 'words' && s.status === 'passed').map(s => s.level);

  // 1. Spaced review that is due (oldest first).
  const due = dueItems(responses, now), reviewCap = budget * 0.4; // review never crowds out the current stop
  const pushReview = it => planCost(items) + itemCost(it) <= reviewCap && push(it);
  const dueSounds = due.filter(d => d.skill.startsWith('sound:')).map(d => d.skill.slice(6)).filter(g => pool.includes(g));
  if (dueSounds.length) pushReview({ type: 'letters', activity: 'hunt', pool, targets: dueSounds, rounds: Math.max(3, Math.min(6, dueSounds.length)), why: 'review' });
  for (const d of due.filter(d => d.skill.startsWith('blend:'))) {
    const ws = wordsAt(+d.skill.slice(7), 2); if (ws.length) pushReview({ type: 'words', level: +d.skill.slice(7), words: ws, why: 'review' });
  }
  if (stars) for (const d of due.filter(d => d.skill.startsWith('star:'))) pushReview({ type: 'star', word: d.skill.slice(5), why: 'review' });

  // 2. The current stop.
  if (cur?.kind === 'sound') {
    const g = cur.gpc, fresh = !responses.some(r => r.skill === `sound:${g}`);
    if (fresh) push({ type: 'letters', activity: map.index === 0 ? 'float' : 'soundTap', pool, newSound: g, why: 'new' });
    push({ type: 'letters', activity: 'hunt', pool, targets: [g, g, ...active.filter(x => x !== g && pool.includes(x) && !atLeast(st(`sound:${x}`), 'secure'))].slice(0, 4), rounds: 5, why: 'new' });
  } else if (cur?.kind === 'words') {
    let lv = cur.level, ws = wordsAt(lv, 5);
    if (!ws.length && passedLevels.length) { lv = passedLevels.at(-1); ws = wordsAt(lv, 5); }
    if (ws.length && blendingUnlocked(responses, now)) push({ type: 'words', level: lv, words: ws, why: 'new' });
    else push({ type: 'letters', activity: 'hunt', pool, targets: active.filter(g => pool.includes(g)), rounds: 5, why: 'practice' }); // sounds not yet secure enough
  }
  if (stars) for (const s of availableStars(responses, now).filter(s => !atLeast(st(`star:${s.w}`), 'secure')).slice(0, 1))
    push({ type: 'star', word: s.w, why: 'new' });

  // 3. Practice: introduced sounds that are not secure yet.
  const shaky = active.filter(g => pool.includes(g) && !atLeast(st(`sound:${g}`), 'secure') && g !== cur?.gpc);
  if (shaky.length) push({ type: 'letters', activity: 'hunt', pool, targets: shaky, rounds: 4, why: 'practice' });

  // 4. Fill to >= 5 minutes with mixed review: words at passed levels, then mixed sound hunts.
  for (let k = 0; planCost(items) < minBudget && k < 8; k++) {
    const lv = passedLevels.length ? passedLevels[k % passedLevels.length] : null, ws = lv ? wordsAt(lv, 3) : [];
    const it = ws.length && k % 2 === 0 ? { type: 'words', level: lv, words: ws, why: 'mixed' }
      : { type: 'letters', activity: 'hunt', pool, targets: shuffle(active.filter(g => pool.includes(g)).length ? active.filter(g => pool.includes(g)) : pool.slice(0, 1), rand).slice(0, 4), rounds: 4, why: 'mixed' };
    if (!push(it)) break;
  }
  // Top up to the 5-minute floor with extra rounds on the letter games (may overshoot the budget by < 1 round).
  for (let k = 0; planCost(items) < minBudget && k < 40; k++) {
    const it = items.filter(i => i.targets && i.rounds < 10)[k % Math.max(1, items.filter(i => i.targets && i.rounds < 10).length)];
    if (!it) break; it.rounds++;
  }
  if (planCost(items) < minBudget) { // only word items: a short mixed sound hunt closes the gap
    const t = active.filter(g => pool.includes(g));
    items.push({ type: 'letters', activity: 'hunt', pool, targets: shuffle(t.length ? t : pool.slice(0, 1), rand).slice(0, 4),
      rounds: Math.max(2, Math.ceil((minBudget - planCost(items) - COST.roundIntro) / COST.round)), why: 'mixed' });
  }
  return { items, cost: planCost(items), stop: cur, minutes: budget / 60 };
}
export { STOPS };
