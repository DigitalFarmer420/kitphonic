// Session planner (pure). A 5–10 minute lesson that always starts with spaced review that is due, then the current
// map stop (a new sound, or a new word level once >= 4 sounds incl. a vowel are secure), then practice of shaky items,
// then mixed review to fill the time, ending on the all-done screen. The child never picks a level.
// Item shapes:
//   { type: 'letters', activity: 'float'|'soundTap'|'find'|'hunt', pool, targets?, rounds?, why }
//   { type: 'words', level, words: [entry], why }
//   { type: 'star', word, why }   (only when opts.stars: Star Word screen)
import { GPC, GPCS } from './sequence.js';
import { skillState, atLeast, knownGpcs, dueItems, blendingUnlocked, pacingFor, DAY } from './mastery.js';
import { errorPatterns } from './patterns.js';
import { mapState, activeSounds, servableWords, applyWords, availableStars, STOPS, MIN_WORDS } from './progress.js';
import { servableStory, allStories } from './sentences.js';
import { shuffle, minimalPairs, wordCards } from './word-logic.js';
import { hasStrokes } from './trace.js';
import { servableSentences } from './sentences.js';
import { servableFamilies } from './families.js';

export const COST = { storyPage: 45, explore: 40, roundIntro: 10, round: 12, word: 35, star: 50, sentence: 70, family: 70, intro: 30, trace: 60 }; // seconds (estimates; tune in playtest)
const CONFUSABLE = new Set(['bd', 'pq', 'bp', 'dq', 'mn', 'nu', 'mw', 'ft', 'il', 'hn']); // letter pairs that look alike
export const MIN_MIN = 5, MAX_MIN = 10, DEFAULT_MIN = 7;
export function itemCost(it) {
  if (it.type === 'words') return it.words.length * COST.word;
  if (it.type === 'star') return COST.star;
  if (it.type === 'sentence') return COST.sentence;
  if (it.type === 'story') return it.story.pages.length * COST.storyPage + 30;
  if (it.type === 'family') return COST.family;
  if (it.type === 'lesson') return COST[it.activity] ?? 40;
  return it.targets ? COST.roundIntro + it.rounds * COST.round : COST.explore;
}
export const planCost = items => items.reduce((s, it) => s + itemCost(it), 0);

// Letters on offer: the newest introduced sounds (single-letter graphemes, <= 6). Untaught letters only pad the pool
// when fewer than 3 are known (then from the set being taught, which is introduced together). Targets are always
// introduced sounds.
export function letterPool(active, { size = 6, min = 3 } = {}) {
  const single = () => true; // digraphs (sh, ck, qu) and s = /z/ are tiles too; letter-logic keeps same-sound tiles apart
  const act = active.filter(single), pool = act.slice(-size);
  if (pool.length < min) {
    const set = GPC[act.at(-1)]?.set ?? 1;
    for (const g of [...GPCS.filter(g => g.set === set), ...GPCS].map(g => g.id)) { if (pool.length >= min) break; if (single(g) && !pool.includes(g)) pool.push(g); }
  }
  return pool;
}

export function planSession(responses, { now = Date.now(), minutes = DEFAULT_MIN, rand = Math.random, stars = true, familyMax = 4, familySecureMax = 5 } = {}) {
  const budget = Math.max(MIN_MIN, Math.min(MAX_MIN, minutes)) * 60, minBudget = MIN_MIN * 60;
  const map = mapState(responses, now), cur = map.current, active = activeSounds(responses, now);
  const known = knownGpcs(responses, now), items = [];
  const st = s => skillState(responses, s, now);
  const room = it => planCost(items) + itemCost(it) <= budget;
  const push = it => { if (room(it)) { items.push(it); return true; } return false; };
  const pool = letterPool(active.length ? active : [GPCS[0].id]);
  const wordsAt = (lv, n) => { const ws = servableWords(lv, known); return ws.length >= MIN_WORDS ? shuffle(ws, rand).slice(0, n) : []; };
  const stepBack = skill => pacingFor(responses, skill) === 'stepBack';
  // an easy pool for a step-back round: the sound + two secure letters that sound and look different
  const easyPool = g => { const far = x => x !== g && GPC[x]?.phoneme !== GPC[g]?.phoneme && !CONFUSABLE.has([g, x].sort().join(''));
    return [...new Set([g, ...active.filter(x => far(x) && atLeast(st(`sound:${x}`), 'secure')), ...pool.filter(far)])].slice(0, 3); };
  const passedLevels = map.stops.filter(s => s.kind === 'words' && s.level && s.status === 'passed').map(s => s.level);

  // 1. Spaced review that is due (oldest first).
  const due = dueItems(responses, now), reviewCap = budget * 0.4; // review never crowds out the current stop
  const pushReview = it => planCost(items) + itemCost(it) <= reviewCap && push(it);
  const dueSounds = due.filter(d => d.skill.startsWith('sound:')).map(d => d.skill.slice(6)).filter(g => active.includes(g)).slice(0, 4);
  const reviewPool = [...new Set([...dueSounds, ...pool])].slice(0, Math.max(pool.length, dueSounds.length + 2)); // old sounds fall out of the newest-6 pool, so due ones are added back
  if (dueSounds.length) pushReview({ type: 'letters', activity: 'hunt', pool: reviewPool, targets: dueSounds, rounds: Math.max(3, Math.min(6, dueSounds.length)), why: 'review' });
  for (const d of due.filter(d => d.skill.startsWith('blend:'))) {
    const ws = wordsAt(+d.skill.slice(7), 2); if (ws.length) pushReview({ type: 'words', level: +d.skill.slice(7), words: ws, why: 'review' });
  }
  if (stars) for (const d of due.filter(d => d.skill.startsWith('star:'))) pushReview({ type: 'star', word: d.skill.slice(5), why: 'review' });

  // 2. The current stop.
  if (cur?.kind === 'sound') {
    const g = cur.gpc, fresh = !responses.some(r => r.skill === `sound:${g}`);
    const hunt = rounds => ({ type: 'letters', activity: 'hunt', pool, targets: [g, g, ...active.filter(x => x !== g && pool.includes(x) && !atLeast(st(`sound:${x}`), 'secure'))].slice(0, 4), rounds, why: 'new' });
    const canTrace = hasStrokes(GPC[g]?.grapheme);
    if (fresh) { // a varied first meeting with a sound: see + hear it, explore, find it, trace it, find it again
      push({ type: 'lesson', activity: 'intro', gpc: g, why: 'new' });
      push({ type: 'letters', activity: map.index === 0 ? 'float' : 'soundTap', pool, newSound: g, why: 'new' });
      push(hunt(3));
      if (canTrace) push({ type: 'lesson', activity: 'trace', gpc: g, why: 'new' });
      if (map.index === 0) push({ type: 'letters', activity: 'soundTap', pool, newSound: g, why: 'new' });
      push(hunt(4));
    } else if (stepBack(`sound:${g}`)) { // §3.7.1: < 60 % two sessions running -> an easier game with extra hints, no message
      push({ type: 'letters', activity: 'soundTap', pool, newSound: g, why: 'easier' });
      push({ type: 'letters', activity: 'hunt', pool: easyPool(g), targets: [g, g, g], rounds: 4, n: 3, assist: true, why: 'easier' });
      if (canTrace) push({ type: 'lesson', activity: 'trace', gpc: g, why: 'easier' });
    } else {
      push(hunt(5));
      if (canTrace && responses.filter(r => r.skill === `trace:${GPC[g].grapheme}`).length < 6) push({ type: 'lesson', activity: 'trace', gpc: g, why: 'new' });
    }
  } else if (cur?.kind === 'words' && cur.apply) { // "new words" stop: words that use this set's sounds, mixed levels
    const ws = shuffle(applyWords(cur.apply, known, Math.max(...passedLevels, 1)), rand).slice(0, 5);
    if (ws.length >= MIN_WORDS) push({ type: 'words', level: null, apply: cur.apply, words: ws, why: 'new' });
    else push({ type: 'letters', activity: 'hunt', pool, targets: active.filter(g => pool.includes(g)), rounds: 5, why: 'practice' });
  } else if (cur?.kind === 'story') { // tiny decodable story (final map stops)
    // star words the story (pages + title) needs but the child has not met yet come first (<= 2 per session); the story
    // itself is served once none is missing, so it always fits the session (a 5-page story is ~4 minutes)
    const met = new Set(responses.filter(r => r.skill?.startsWith('star:')).map(r => r.skill.slice(5)));
    const story = allStories(known).find(x => x.id === cur.story);
    const need = [...new Set([...(story?.pages.flatMap(p => p.stars) ?? []), ...(story?.titleTokens.filter(t => t.kind === 'star').map(t => t.star.w) ?? [])])].filter(w => !met.has(w));
    for (const w of need.slice(0, 2)) push({ type: 'star', word: w, why: 'new' });
    const s = !need.length && servableStory(cur.story, known, met);
    if (s) push({ type: 'story', story: s, why: 'new' });
    else if (!need.length) push({ type: 'letters', activity: 'hunt', pool, targets: active.filter(g => pool.includes(g)), rounds: 5, why: 'practice' });
  } else if (cur?.kind === 'words') {
    let lv = cur.level, ws = wordsAt(lv, 5), easier = false;
    if (!ws.length && passedLevels.length) { lv = passedLevels.at(-1); ws = wordsAt(lv, 5); }
    if (ws.length && stepBack(`blend:L${lv}`)) { // §3.7.1 step back: the last easier level passed, S3+ support and the hand demo
      const down = passedLevels.filter(l => l < lv).at(-1), dws = down ? wordsAt(down, 4) : [];
      if (dws.length) { lv = down; ws = dws; } else ws = ws.slice(0, 4);
      easier = true;
    }
    if (ws.length && blendingUnlocked(responses, now)) push({ type: 'words', level: lv, words: ws, why: easier ? 'easier' : 'new', ...(easier ? { assist: true } : {}) });
    else push({ type: 'letters', activity: 'hunt', pool, targets: active.filter(g => pool.includes(g)), rounds: 5, why: 'practice' }); // sounds not yet secure enough
  }
  // v2 V9 rule 5: the session after a story is read offers one re-read (scored separately as reread:<id>); the most
  // recently read story first, never the story the current stop is about. Only when it fits (a story is a few minutes).
  const lastAt = id => Math.max(...responses.filter(r => r.skill === `story:${id}`).map(r => r.timestamp));
  const toReread = [...new Set(responses.filter(r => r.skill?.startsWith('story:')).map(r => r.skill.slice(6)))]
    .filter(id => id !== cur?.story && !responses.some(r => r.skill === `reread:${id}`)).sort((a, b) => lastAt(b) - lastAt(a));
  if (toReread.length && stars) {
    const met = new Set(responses.filter(r => r.skill?.startsWith('star:')).map(r => r.skill.slice(5)));
    const s = servableStory(toReread[0], known, met); if (s) push({ type: 'story', story: s, reread: true, why: 'reread' });
  }

  // Error patterns (§3.7.1): one short practice item for the strongest pattern of the last 14 days.
  const pat = errorPatterns(responses, now), pair = pat.pairs.find(p => active.includes(p.a) && active.includes(p.b));
  if (pair) { // both letters always on screen (3 tiles), alternating targets
    const third = pool.find(g => g !== pair.a && g !== pair.b && GPC[g]?.phoneme !== GPC[pair.a]?.phoneme && GPC[g]?.phoneme !== GPC[pair.b]?.phoneme);
    push({ type: 'letters', activity: 'hunt', pool: [pair.a, pair.b, ...(third ? [third] : [])], targets: [pair.a, pair.b, pair.b, pair.a], rounds: 4, n: 3, why: 'pattern', pattern: `${pair.a}/${pair.b}` });
  }
  const con = pat.contrasts[0], plv = cur?.kind === 'words' && cur.level ? cur.level : passedLevels.at(-1);
  if (con && plv && blendingUnlocked(responses, now)) { // words whose picture check can lead with that contrast
    const ws = shuffle(servableWords(plv, known).filter(e => minimalPairs(e.w).some(c => c.contrast === con.pos) || wordCards(e.w, { known, focus: con.pos, rand: () => .5 })?.contrast === con.pos), rand).slice(0, 3);
    if (ws.length >= 2) push({ type: 'words', level: plv, words: ws, focus: con.pos, why: 'pattern', pattern: con.pos });
  }

  if (stars) for (const s of availableStars(responses, now).filter(s => !atLeast(st(`star:${s.w}`), 'secure')).slice(0, 1))
    push({ type: 'star', word: s.w, why: 'new' });

  // Word families (design/words-board 2): once CVC words (L2) are open, one family per session, least-made first.
  if ((cur?.kind === 'words' && cur.level >= 2) || passedLevels.some(l => l >= 2)) {
    const made = r => responses.filter(x => x.skill === `family:${r}`).length;
    // Research + Uiux (Oct 30): a new family starts at familyMax (4) letter choices; only once that family is secure
    // does it grow to familySecureMax (5). Every choice is still a taught letter (servableFamilies filters by known).
    // Families are unscored builds, so "secure" here = the whole family made on 2+ different days.
    const familySecure = r => new Set(responses.filter(x => x.skill === `family:${r}`).map(x => Math.floor(x.timestamp / DAY))).size >= 2;
    const capFor = r => familySecure(r) ? Math.max(familyMax, familySecureMax) : familyMax;
    const fs = servableFamilies(known, Math.max(familyMax, familySecureMax)).map(f => ({ ...f, words: f.words.slice(0, capFor(f.rime)) })).sort((a, b) => made(a.rime) - made(b.rime) || rand() - .5);
    if (fs.length && blendingUnlocked(responses, now)) push({ type: 'family', family: fs[0], why: made(fs[0].rime) ? 'mixed' : 'new' });
  }

  // Sentences (design/words-board 4): one per session once a sentence decodes with known sounds + introduced stars.
  if (stars) {
    const introduced = new Set(responses.filter(r => r.skill?.startsWith('star:')).map(r => r.skill.slice(5)));
    const reads = id => responses.filter(r => r.skill?.startsWith('sentence:') && r.itemId === id && r.firstAttempt);
    const missed = id => reads(id).at(-1)?.correct === false; // last scored read picked the wrong picture: read it again
    const ss = servableSentences(known, introduced).sort((a, b) => missed(b.id) - missed(a.id) || reads(a.id).length - reads(b.id).length || rand() - .5);
    if (ss.length) push({ type: 'sentence', sentence: ss[0], why: missed(ss[0].id) ? 'retry' : reads(ss[0].id).length ? 'mixed' : 'new' });
  }

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
