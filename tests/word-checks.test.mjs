// Every servable word at every word / new-words stop must have a picture check or word cards,
// so a finished read is logged and can count toward mastery. Words that complete in the UI
// with no check used to slip through unlogged (the L4 "stop" stop only checked 7 of 20).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STOPS, servableWords, applyWords, knownForServing, mapState, progressMarkers } from '../js/progress.js';
import { seedProgress } from '../js/dev-seed.js';
import { WORDS, CARD_WORDS } from '../js/content.js';
import { hasWordCheck, needsCheck, wordCards, rng } from '../js/word-logic.js';
import { validateWord, formatErrors, patternOf, parseIds } from '../js/validate.js';
import { GPC, GPCS } from '../js/sequence.js';
import { CONFIG } from '../js/config.js';

const T0 = 1_700_000_000_000;
const cfg = { wordCardCheck: true, checkPictureWords: true, checkAtL1: CONFIG.checkAtL1, choicesPerCheck: 3 };

function logAt(n) {
  const c = seedProgress(n, { now: T0 });
  return [...c, ...progressMarkers(c, { now: T0 })];
}

function servableAtCurrentWordStop(n) {
  const log = logAt(n);
  const m = mapState(log, T0);
  const cur = m.current;
  if (!cur || cur.kind !== 'words') return null;
  const known = knownForServing(log, T0);
  const passedLevels = m.stops.filter(s => s.kind === 'words' && s.level && s.status === 'passed').map(s => s.level);
  const maxLv = Math.max(...passedLevels, 1);
  const ws = cur.apply ? applyWords(cur.apply, known, maxLv) : servableWords(cur.level, known);
  return { cur, known, maxLv, ws, index: n };
}

function cardLevel(e) {
  const ids = parseIds(e), pat = patternOf(ids), last = ids.at(-1);
  const set8 = ids.some(id => GPC[id]?.set === 8);
  if (pat === 'VC') return 1;
  if (pat === 'CVC') return set8 ? 6 : 3;
  if (pat === 'CCVC') return 4;
  if ((pat === 'CVCC' || pat === 'VCC') && (last === 's' || last === 's_z')) return 7;
  if ((pat === 'CVCC' || pat === 'VCC') && set8) return 6;
  if (pat === 'CVCC' || pat === 'VCC') return 5;
  return null;
}

test('CARD_WORDS are decodable printed distractors, not lesson words, and do not collide with WORDS', () => {
  const lesson = new Set(Object.values(WORDS).flat().map(e => e.w));
  const seen = new Set();
  const errs = [];
  for (const e of CARD_WORDS) {
    assert.ok(e.w && e.parse, `${e.text} needs w and parse`);
    assert.equal(e.w, e.text);
    assert.ok(!lesson.has(e.w), `${e.w} is already a lesson word; it does not belong in CARD_WORDS`);
    assert.ok(!seen.has(e.w), `duplicate CARD_WORDS entry ${e.w}`);
    seen.add(e.w);
    const lv = cardLevel(e);
    assert.ok(lv, `${e.w} has no curriculum pattern (${e.pattern})`);
    errs.push(...validateWord({ ...e, level: lv, text: e.text }, { k: GPCS.length }));
  }
  assert.equal(errs.length, 0, formatErrors(errs));
});

test('every servable word at every word stop has a picture check or word cards', () => {
  const missing = [];
  const byStop = [];
  for (let n = 0; n < STOPS.length; n++) {
    const at = servableAtCurrentWordStop(n);
    if (!at) continue;
    const { cur, known, ws, index } = at;
    const none = [];
    for (const e of ws) {
      const ok = hasWordCheck(e, { known, cfg, level: cur.level ?? e.level, rand: () => 0.3 });
      if (!ok) none.push(e.w);
    }
    byStop.push({ id: cur.id, label: cur.label, index: index + 1, total: ws.length, missing: none.length });
    for (const w of none) missing.push(`${cur.id} (${cur.label}): ${w}`);
  }
  assert.ok(byStop.length >= 13, `expected all word/apply stops, got ${byStop.length}`);
  assert.equal(missing.length, 0, `unchecked servable words:\n${missing.join('\n')}\n${JSON.stringify(byStop, null, 2)}`);
});

test('L4 "stop" and L5 "sand" can check every servable word at that stop', () => {
  for (const want of ['words:L4', 'words:L5']) {
    const n = STOPS.findIndex(s => s.id === want);
    assert.ok(n >= 0, want);
    const at = servableAtCurrentWordStop(n);
    assert.equal(at.cur.id, want);
    assert.ok(at.ws.length >= 5, `${want} should serve a full set (got ${at.ws.length})`);
    for (const e of at.ws) {
      const pic = needsCheck(e, cfg, at.cur.level ?? e.level);
      const cards = wordCards(e.w, { n: 3, rand: () => 0.3, known: at.known });
      assert.ok(pic || cards, `${want} ${e.w} has no picture check and no word cards`);
      if (!pic && cards) {
        assert.ok(cards.some(c => c.w === e.w));
        assert.ok(cards.filter(c => c.w !== e.w).length >= 1);
        for (const c of cards) {
          if (c.w === e.w) continue;
          const src = [...Object.values(WORDS).flat(), ...CARD_WORDS].find(x => x.w === c.w);
          assert.ok(src, `${e.w} card ${c.w} is not in WORDS or CARD_WORDS`);
          assert.ok(src.parse.split(' ').every(g => at.known.has(g)), `${e.w} card ${c.w} uses an untaught GPC`);
        }
      }
    }
  }
});

test('word cards never print an untaught GPC when known is set', () => {
  const known = new Set('m s a t p i n o d f c k u g e r h b l'.split(' '));
  const servable = e => e.parse.split(' ').every(g => known.has(g));
  for (const e of WORDS[4].filter(servable)) {
    const cards = wordCards(e.w, { known, n: 3, rand: () => 0.4 });
    assert.ok(cards, `${e.w} should have word cards at the L4 known set`);
    for (const c of cards) {
      const src = [...Object.values(WORDS).flat(), ...CARD_WORDS].find(x => x.w === c.w);
      assert.ok(src, `${e.w} card ${c.w} is missing a parse`);
      assert.ok(src.parse.split(' ').every(g => known.has(g)), `${e.w} -> ${c.w} uses an untaught GPC`);
    }
  }
});

// Rare, archaic, odd grammatical, or unfortunate words that must not appear on a printed card
// for a 4–7 year old (Education Researcher, 2026-11-21).
const UNFAMILIAR_OR_ODD = [
  'dram', 'drub', 'oft', 'ifs', 'ins', 'tench', 'shad', 'shod',
  'gun', 'flog', 'clad', 'plat', 'asp', 'yen', 'kill', 'shun', 'lurch', 'ruff', 'shuck',
  'flan', 'swig', 'swum', 'jab', 'muff', 'runt', 'bunt',
];

function isMirrorOnly(a, b) {
  if (a.length !== b.length) return false;
  const diffs = [...a].map((c, i) => (c !== b[i] ? c + b[i] : null)).filter(Boolean);
  return diffs.length === 1 && (diffs[0] === 'bd' || diffs[0] === 'db' || diffs[0] === 'pq' || diffs[0] === 'qp');
}

function letterDiffs(a, b) {
  return a.length !== b.length ? Infinity : [...a].filter((c, i) => c !== b[i]).length;
}

test('CARD_WORDS stay familiar: no rare, archaic, odd, or unfortunate foils', () => {
  const words = new Set(CARD_WORDS.map(e => e.w));
  const hits = UNFAMILIAR_OR_ODD.filter(w => words.has(w));
  assert.equal(hits.length, 0, `unfamiliar or unfortunate CARD_WORDS: ${hits.join(', ')}`);
});

test('word cards never use b/d or p/q as the only difference', () => {
  for (const e of Object.values(WORDS).flat()) {
    for (const seed of [1, 2, 3, 5, 8, 13, 21]) {
      const cards = wordCards(e.w, { n: 3, rand: rng(seed) });
      if (!cards) continue;
      for (const c of cards) {
        if (c.w === e.w) continue;
        assert.ok(!isMirrorOnly(e.w, c.w), `${e.w} must not pair with ${c.w} (b/d or p/q only)`);
      }
    }
  }
  for (const [w, banned] of [['big', 'dig'], ['dig', 'big'], ['bump', 'dump'], ['duck', 'buck']]) {
    for (let i = 0; i < 20; i++) {
      const cards = wordCards(w, { n: 3, rand: rng(i + 1) });
      assert.ok(cards, `${w} should still have word cards`);
      assert.ok(!cards.some(c => c.w === banned), `${w} must not pair with ${banned}`);
    }
  }
});

test('word cards fall back to a familiar two-letter contrast when no one-letter neighbour is suitable', () => {
  const cases = [
    { id: 'words:L4', word: 'drum', expect: ['drop', 'drip'] },
    { id: 'words:set6', word: 'off', expect: ['old', 'odd', 'elf'] },
    { id: 'words:L7', word: 'its', expect: ['ink', 'his', 'has', 'bus'] },
    { id: 'words:L4', word: 'frog', expect: ['flag', 'drop'] },
    { id: 'words:L4', word: 'glad', expect: ['flag', 'clap', 'plan'] },
  ];
  for (const { id, word, expect } of cases) {
    const n = STOPS.findIndex(s => s.id === id);
    assert.ok(n >= 0, id);
    const at = servableAtCurrentWordStop(n);
    assert.equal(at.cur.id, id);
    const cards = wordCards(word, { n: 3, rand: () => 0.3, known: at.known });
    assert.ok(cards, `${word} should have word cards at ${id}`);
    const foils = cards.filter(c => c.w !== word).map(c => c.w);
    assert.ok(foils.length >= 1, `${word} has no foils`);
    for (const f of foils) {
      const d = letterDiffs(word, f);
      assert.ok(d === 1 || d === 2, `${word} vs ${f} differs by ${d} letters`);
      assert.equal(f.length, word.length, `${word} vs ${f} length`);
    }
    const seen = new Set();
    for (let i = 1; i <= 30; i++) {
      const c = wordCards(word, { n: 3, rand: rng(i), known: at.known });
      for (const f of c.filter(x => x.w !== word)) seen.add(f.w);
    }
    assert.ok(expect.some(w => seen.has(w)), `${word} at ${id} never showed a familiar foil among ${expect.join(', ')} (got ${[...seen].join(', ')})`);
  }
});

test('word cards never print an untaught GPC at any word stop', () => {
  for (let n = 0; n < STOPS.length; n++) {
    const at = servableAtCurrentWordStop(n);
    if (!at) continue;
    for (const e of at.ws) {
      const cards = wordCards(e.w, { known: at.known, n: 3, rand: () => 0.4 });
      if (!cards) continue;
      for (const c of cards) {
        if (c.w === e.w) continue;
        const src = [...Object.values(WORDS).flat(), ...CARD_WORDS].find(x => x.w === c.w);
        assert.ok(src, `${at.cur.id} ${e.w} card ${c.w} is not in WORDS or CARD_WORDS`);
        assert.ok(src.parse.split(' ').every(g => at.known.has(g)), `${at.cur.id} ${e.w} -> ${c.w} uses an untaught GPC (${src.parse})`);
        assert.equal(c.w.length, e.w.length, `${at.cur.id} ${e.w} -> ${c.w} changes length`);
        const d = letterDiffs(e.w, c.w);
        assert.ok(d === 1 || d === 2, `${at.cur.id} ${e.w} -> ${c.w} differs by ${d}`);
        assert.ok(!isMirrorOnly(e.w, c.w), `${at.cur.id} ${e.w} -> ${c.w} is a mirror-letter pair`);
      }
    }
  }
});
