// Session runner: progress map + planner (5–10 min, new + spaced review, words unlock after >= 4 sounds incl. a vowel,
// untaught-sound check on every served item).
import test from 'node:test';
import assert from 'node:assert/strict';
import { STOPS, mapState, activeSounds, wordsUnlocked, availableStars } from '../js/progress.js';
import { planSession, planCost, letterPool } from '../js/session.js';
import { seedProgress } from '../js/dev-seed.js';
import { knownGpcs, blendingUnlocked, DAY } from '../js/mastery.js';
import { wordCards, rng } from '../js/word-logic.js';
import { parseIds } from '../js/validate.js';
import { roundLetters } from '../js/letter-logic.js';
import { GPC } from '../js/sequence.js';

const now = Date.UTC(2026, 9, 30, 17);
test('map stops follow the sound sequence with word levels in between', () => {
  assert.equal(STOPS.map(s => s.label).join(' '),
    'm s a t at p mat i n pin o d f dog c k u cup 🍲 g e r h b l bed stop sand ck ff ll ss s duck 🎩 cats j v x y w z zz qu fox 🦊 sh ship ch th th ng nk ring 👑 🧺');
  assert.deepEqual(STOPS.filter(s => s.kind === 'words' && s.level).map(s => s.level), [1, 2, 3, 4, 5, 7, 6]);
  assert.deepEqual(STOPS.filter(s => s.apply).map(s => s.apply), [3, 4, 5, 6, 7, 8]); // a "new words" stop after every later set
  const at = id => STOPS.findIndex(s => s.id === id); // v2 V4a: blends only after l
  assert.ok(at('words:L4') > at('sound:l') && at('words:L5') === at('words:L4') + 1);
  assert.equal(STOPS.filter(s => s.kind === 'sound').length, 38);
});
test('seeded progress N lands on stop N; passed / current / upcoming', () => {
  for (let n = 0; n <= STOPS.length; n++) {
    const m = mapState(seedProgress(n, { now }), now);
    assert.equal(m.index, n);
    assert.equal(m.stops.filter(s => s.status === 'passed').length, n);
    assert.equal(m.stops.filter(s => s.status === 'current').length, n < STOPS.length ? 1 : 0);
  }
});
test('words unlock only after >= 4 secure sounds including a vowel', () => {
  const cons = ['m', 's', 't', 'p'].flatMap((g, k) => Array.from({ length: 6 }, (_, i) => ({ skill: `sound:${g}`, correct: true, firstAttempt: true, timestamp: now - 1e6 + k * 100 + i, sessionId: 'a' })));
  assert.equal(blendingUnlocked(cons, now), false); // 4 consonants, no vowel
  assert.equal(wordsUnlocked(seedProgress(3, { now }), now), false); // m s a
  assert.equal(wordsUnlocked(seedProgress(4, { now }), now), true);  // m s a t
  assert.ok(!planSession(seedProgress(3, { now }), { now, rand: rng(1) }).items.some(i => i.type === 'words'));
  assert.ok(planSession(seedProgress(4, { now }), { now, rand: rng(1) }).items.some(i => i.type === 'words' && i.level === 1 && i.why === 'new'));
});
test('every plan: 5–10 minutes, untaught-sound check, targets on offer, review first when due', () => {
  for (let n = 0; n <= STOPS.length; n++) for (const due of [false, true]) for (const minutes of [5, 7, 10]) for (const seed of [1, 2]) {
    const r = seedProgress(n, { now, due }), p = planSession(r, { now, minutes, rand: rng(seed) }), known = knownGpcs(r, now), active = activeSounds(r, now);
    const tag = `n=${n} due=${due} min=${minutes}`;
    assert.ok(p.cost >= 5 * 60 && p.cost <= Math.max(5, minutes) * 60 + 35, `${tag}: cost ${p.cost}`);
    assert.equal(planCost(p.items), p.cost);
    for (const it of p.items) {
      if (it.type === 'sentence') for (const t of it.sentence.tokens) if (t.kind === 'word') for (const g of parseIds(t.entry)) assert.ok(known.has(g), `${tag}: sentence ${it.sentence.id} uses untaught ${g}`);
      if (it.type === 'family') for (const x of it.family.words) for (const g of x.ids) assert.ok(known.has(g), `${tag}: family ${it.family.rime} uses untaught ${g}`);
      if (it.type === 'words') for (const w of it.words) for (const g of parseIds(w)) assert.ok(known.has(g), `${tag}: ${w.w} uses untaught ${g}`);
      if (it.type === 'letters') {
        assert.ok(it.pool.length >= 3 && it.pool.length <= 6, `${tag}: pool ${it.pool}`);
        for (const t of it.targets ?? []) { assert.ok(it.pool.includes(t), `${tag}: target ${t} not in pool`); assert.ok(active.includes(t), `${tag}: target ${t} not introduced`); }
      }
    }
    if (due && n > 0) assert.equal(p.items[0].why, 'review', `${tag}: review first`);
    if (n < STOPS.length) assert.ok(p.items.some(i => i.why === 'new' || (STOPS[n].kind === 'words' && i.why === 'practice')), `${tag}: current stop served`);
  }
});
test('new sound: letter intro first, then explore, find, trace — the new sound is the main hunt target', () => {
  const p = planSession(seedProgress(5, { now }), { now, rand: rng(3) }); // current = p
  assert.deepEqual(p.items.slice(0, 4).map(i => i.activity), ['intro', 'soundTap', 'hunt', 'trace']);
  assert.equal(p.items[0].gpc, 'p'); assert.deepEqual(p.items[2].targets.slice(0, 2), ['p', 'p']);
});
test('first-ever session is varied (not only hunts): intro, float, find, trace, sound tap', () => {
  const p = planSession([], { now, rand: rng(1) }), acts = p.items.map(i => i.activity);
  for (const a of ['intro', 'float', 'hunt', 'trace', 'soundTap']) assert.ok(acts.includes(a), `${a} in ${acts}`);
  assert.ok(new Set(acts).size >= 5);
  assert.ok(acts.filter(a => a === 'hunt').length <= acts.length / 2, acts.join(' '));
});
test('letter pool: newest introduced sounds; untaught letters only pad below 3', () => {
  assert.deepEqual(letterPool(['m']), ['m', 's', 'a']);
  assert.deepEqual(letterPool(['m', 's', 'a', 't', 'p']), ['m', 's', 'a', 't', 'p']);
  assert.equal(letterPool(['m', 's', 'a', 't', 'p', 'i', 'n', 'o']).length, 6);
});
test('star words: only after their GPCs are known and words are open, <= 2 per level', () => {
  assert.deepEqual(availableStars(seedProgress(3, { now }), now), []);
  const s = availableStars(seedProgress(STOPS.length, { now }), now);
  for (const lv of [2, 3, 4]) assert.ok(s.filter(x => x.level === lv).length <= 2);
  assert.ok(s.some(x => x.w === 'the'));
});
test('word cards: printed minimal pairs (one letter different), taught GPCs only', () => {
  const c = wordCards('at', { rand: rng(1) });
  assert.ok(c.cards && c.length >= 2 && c.some(x => x.w === 'at'));
  for (const x of c) assert.equal([...x.w].filter((ch, i) => ch !== 'at'[i]).length, x.w === 'at' ? 0 : 1);
  const k = new Set(['m', 's', 'a', 't']), ck = wordCards('at', { rand: rng(2), known: k });
  for (const x of ck) assert.ok([...x.w].every(ch => k.has(ch)), x.w);
  assert.equal(wordCards('zzz'), null);
});

test('star words are introduced (scored finds) before they appear in sentences', () => {
  const r = seedProgress(STOPS.length, { now }), p = planSession(r, { now, rand: rng(1), minutes: 10 });
  assert.ok(p.items.some(i => i.type === 'star'), 'a new star word is introduced');
  assert.ok(!p.items.some(i => i.type === 'sentence'), 'no sentence before any star word was met');
  const met = [...r, { skill: 'star:the', itemId: 'the', correct: true, firstAttempt: true, timestamp: now - 1000, sessionId: 'x' }];
  const p2 = planSession(met, { now, rand: rng(1), minutes: 10 });
  const sent = p2.items.find(i => i.type === 'sentence'); assert.ok(sent, 'sentence once "the" is introduced');
  assert.ok(sent.sentence.stars.every(w => w === 'the'));
});

test('word families open with CVC words: taught letters only, 2-4 words, fixed rime', async () => {
  const { servableFamilies, allFamilies } = await import('../js/families.js');
  assert.ok(allFamilies().every(f => f.words.every(x => x.w.endsWith(f.rime) && x.w.length === 3)));
  const known = new Set(['m', 's', 'a', 't']);
  const fs = servableFamilies(known); assert.deepEqual(fs.map(f => f.rime), ['at']);
  assert.ok(fs[0].words.every(x => x.ids.every(g => known.has(g))));
  const late = planSession(seedProgress(STOPS.length, { now }), { now, rand: rng(2), minutes: 10 });
  assert.ok(late.items.some(i => i.type === 'family'), 'a family once L2 is open');
  const early = planSession(seedProgress(3, { now }), { now, rand: rng(2), minutes: 10 });
  assert.ok(!early.items.some(i => i.type === 'family'), 'no families before CVC words');
});

test('word families start at 4 choices and grow to 5 only once that family is secure (Research + Uiux, Oct 30)', async () => {
  const base = seedProgress(STOPS.length, { now });
  const fam = rs => planSession(rs, { now, rand: rng(2), minutes: 10 }).items.find(i => i.type === 'family');
  const first = fam(base); assert.ok(first && first.family.words.length <= 4, 'a new family offers at most 4 letters');
  const { servableFamilies } = await import('../js/families.js');
  const big = servableFamilies(undefined, 7).filter(f => f.words.length >= 5).map(f => f.rime);
  assert.ok(big.length, 'some family has 5+ words to grow into');
  const done = (r, t) => ({ skill: `family:${r}`, itemId: r, correct: true, firstAttempt: true, scored: false, timestamp: t, sessionId: `f${t}` });
  const once = [...base, ...big.map(r => done(r, now - DAY))]; // made once: still new, still 4
  const all = servableFamilies(undefined, 7).map(f => f.rime);
  const onlyBig = rs => [...rs, ...all.filter(r => !big.includes(r)).flatMap(r => [done(r, now - 3 * DAY), done(r, now - 2 * DAY), done(r, now - DAY)])];
  const f1 = fam(onlyBig(once)); assert.ok(big.includes(f1.family.rime)); assert.equal(f1.family.words.length, 4, 'made on one day only: 4');
  const twice = onlyBig([...once, ...big.map(r => done(r, now - 2 * DAY))]);
  const f2 = fam(twice); assert.ok(big.includes(f2.family.rime)); assert.equal(f2.family.words.length, 5, 'made on 2 days: grows to 5');
});

// Full sequence (sets 1–8): every stop is reachable in normal play — the session at each stop exercises that stop's
// skill, and the letter rounds always have exactly one tile that makes the target sound.
test('normal play reaches every stop through L5 (sand) and L6 (ship): each session works on its current stop', () => {
  const at = id => STOPS.findIndex(s => s.id === id);
  assert.ok(at('words:L5') > at('sound:l') && at('words:L6') === at('sound:sh') + 1);
  for (let n = 0; n < STOPS.length; n++) {
    const cur = STOPS[n];
    for (const seed of [1, 2, 3]) {
      const p = planSession(seedProgress(n, { now }), { now, rand: rng(seed), minutes: 7 });
      if (cur.kind === 'sound') {
        const hunts = p.items.filter(i => i.activity === 'hunt' && i.targets?.includes(cur.gpc));
        assert.ok(hunts.length, `stop ${n} ${cur.id}: no scored hunt for /${cur.gpc}/`);
        for (const h of hunts) for (let k = 0; k < 8; k++) {
          const ls = roundLetters(cur.gpc, h.pool, { n: 3, rand: rng(k) });
          assert.ok(ls.length >= 3, `${cur.id}: only ${ls.length} tiles from ${h.pool}`);
          assert.equal(ls.filter(l => GPC[l].phoneme === GPC[cur.gpc].phoneme).length, 1, `${cur.id}: two tiles say /${GPC[cur.gpc].phoneme}/ (${ls})`);
          assert.equal(new Set(ls.map(l => GPC[l].grapheme)).size, ls.length, `${cur.id}: two tiles look the same (${ls})`);
        }
      } else if (cur.kind === 'story') {
        // missing star words are introduced first (<= 2 for the story, plus the usual one new star); after those sessions the story itself is served
        let q = p, log = seedProgress(n, { now });
        for (let k = 0; k < 4 && !q.items.some(i => i.type === 'story'); k++) {
          const intro = q.items.filter(i => i.type === 'star').map(i => i.word); assert.ok(intro.length, `stop ${n} ${cur.id}: no story, no star intro`);
          log = [...log, ...intro.flatMap(w => [0, 1, 2].map(j => ({ skill: `star:${w}`, itemId: w, correct: true, firstAttempt: true, scored: true, timestamp: now - 864e5 + j, sessionId: `st${k}` })))];
          q = planSession(log, { now, rand: rng(seed), minutes: 7 });
        }
        assert.ok(q.items.some(i => i.type === 'story' && i.story.id === cur.story), `stop ${n} ${cur.id}: no story`);
      } else if (cur.apply) {
        const w = p.items.find(i => i.type === 'words' && i.apply === cur.apply && i.why === 'new');
        assert.ok(w && w.words.length >= 2, `stop ${n} ${cur.id}: no new-words item`);
        for (const e of w.words) assert.ok(parseIds(e).some(g => GPC[g].set === cur.apply), `${cur.id}: ${e.w} has no set-${cur.apply} sound`);
      } else {
        const w = p.items.find(i => i.type === 'words' && i.level === cur.level && i.why === 'new');
        assert.ok(w && w.words.length >= 2, `stop ${n} ${cur.id}: no L${cur.level} words`);
      }
    }
  }
});
test('due reviews of old sounds still get a hunt once they fall out of the newest-6 pool', () => {
  const p = planSession(seedProgress(STOPS.findIndex(s => s.id === 'sound:j'), { now, due: true }), { now: now + 3 * 864e5, rand: rng(1) });
  const rev = p.items.find(i => i.why === 'review' && i.activity === 'hunt');
  assert.ok(rev, 'review hunt'); for (const t of rev.targets) assert.ok(rev.pool.includes(t), t);
});
test('v2 V8: every words stop from L3 on has >= 12 servable words (L1 / L2 open with only 4–5 letters known: at, am / 6 CVC)', async () => {
  const { applyWords, servableWords } = await import('../js/progress.js');
  const known = new Set(), passed = [];
  for (const s of STOPS) {
    if (s.kind === 'sound') { known.add(s.gpc); continue; }
    if (s.kind !== 'words') continue;
    const ws = s.apply ? applyWords(s.apply, known, Math.max(...passed, 1)) : servableWords(s.level, known);
    if (s.level) passed.push(s.level);
    if (s.level === 1 || s.level === 2) { assert.ok(ws.length >= 2, s.id); continue; }
    assert.ok(new Set(ws.map(w => w.w)).size >= 12, `${s.id}: ${ws.length} words (${ws.map(w => w.w)})`);
  }
});
test('v2 V4: at most one new sound per session — no plan, at any stop, introduces or targets two untaught GPCs', () => {
  for (let n = 0; n < STOPS.length; n++) for (const seed of [1, 2]) {
    const log = seedProgress(n, { now }), met = new Set(log.filter(r => r.skill?.startsWith('sound:')).map(r => r.skill.slice(6)));
    const p = planSession(log, { now, rand: rng(seed), minutes: 7 });
    const fresh = new Set();
    for (const it of p.items) {
      for (const g of [it.gpc, it.newSound, ...(it.targets ?? [])]) if (g && !met.has(g)) fresh.add(g);
      for (const w of it.words ?? []) for (const g of parseIds(w)) if (!met.has(g)) fresh.add(g);
    }
    assert.ok(fresh.size <= 1, `stop ${n} ${STOPS[n].id}: new sounds ${[...fresh]}`);
  }
});

test('known issue 6: every words stop from L3 on has >= 5 pictured words the child can be served', async () => {
  const { applyWords, servableWords } = await import('../js/progress.js');
  for (const [i, s] of STOPS.entries()) {
    if (s.kind !== 'words' || (s.level && s.level < 3)) continue;
    const log = seedProgress(i, { now }), k = knownGpcs(log, now), m = mapState(log, now);
    const passed = m.stops.filter(x => x.kind === 'words' && x.level && x.status === 'passed').map(x => x.level);
    const ws = s.apply ? applyWords(s.apply, k, Math.max(...passed, 1)) : servableWords(s.level, k);
    assert.ok(ws.filter(e => e.pic).length >= 5, `stop ${i} (${s.apply ? 'set ' + s.apply : 'L' + s.level}): ${ws.filter(e => e.pic).map(e => e.w)}`);
  }
});
test('L7 plurals: two-of pictures; the singular is a final-sound distractor, never the reverse', async () => {
  const L = await import('../js/word-logic.js'), { WORDS } = await import('../js/content.js');
  for (const e of WORDS[7].filter(e => e.pic)) {
    assert.ok(e.pic.startsWith('2x'), e.w);
    assert.ok(L.minimalPairs(e.w).some(c => c.w === e.stem && c.contrast === 'final'), `${e.w} offers ${e.stem}`);
  }
  for (const w of ['cat', 'hat', 'pig', 'dog', 'hen']) assert.ok(!L.minimalPairs(w).some(c => c.w.endsWith('s') && c.w.length === w.length + 1), w);
});

test('v2 V9 rule 5: a story read in an earlier session is offered once as a re-read (its own reread:<id> skill)', async () => {
  const { allStories } = await import('../js/sentences.js');
  const i = STOPS.findIndex(s => s.kind === 'story'), id = STOPS[i].story, st = allStories().find(x => x.id === id);
  const stars = [...new Set([...st.pages.flatMap(p => p.stars), ...st.titleTokens.filter(t => t.kind === 'star').map(t => t.star.w)])];
  const base = [...seedProgress(i + 1, { now }), ...stars.map((w, k) => ({ skill: `star:${w}`, itemId: w, correct: true, firstAttempt: true, scored: true, timestamp: now - 2 * DAY + k, sessionId: 'st' }))]; // read after meeting its star words
  const p = planSession(base, { now, rand: rng(4), minutes: 10 });
  const it = p.items.find(x => x.type === 'story' && x.reread);
  assert.ok(it, `re-read of ${id} offered`); assert.equal(it.story.id, id); assert.equal(it.why, 'reread');
  const done = [...base, { skill: `reread:${id}`, itemId: id, correct: true, firstAttempt: true, scored: true, timestamp: now - 1000, sessionId: 'r' }];
  assert.ok(!planSession(done, { now, rand: rng(4), minutes: 10 }).items.some(x => x.reread), 'offered once');
  assert.equal(mapState(done, now).index, mapState(base, now).index, 're-reads never move the map');
});
