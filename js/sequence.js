// Grapheme–phoneme correspondence (GPC) sequence — literacy review R1. Single source of truth for letter order;
// core.LETTERS / core.STRETCHY and all content validation read from here.
// Phonemes are IPA-ish codes. ⚠️ Accent-dependent vowels (o, a before m/n) await the UK/US decision.
const SETS = [
  ['m', 's', 'a', 't'],                          // 1: blending unlocks here (am, at, sat, mat)
  ['p', 'i', 'n'],                               // 2: a/i contrast
  ['o', 'd', 'f'],                               // 3: third vowel; d well before b
  ['c', 'k', 'e', 'u'],                          // 4
  ['g', 'r', 'h', 'b', 'l'],                     // 5: b is 9 after d
  ['ck', 'ff', 'll', 'ss', 's_z'],               // 6: doubles; s = /z/ (is, as)
  ['j', 'v', 'w', 'x', 'y', 'z', 'zz', 'qu'],    // 7
  ['sh', 'ch', 'th', 'th_v', 'ng', 'nk'],        // 8
];
const INFO = { // id: [grapheme, phoneme, continuous, vowel]
  m: ['m', 'm', 1], s: ['s', 's', 1], a: ['a', 'æ', 1, 1], t: ['t', 't'], p: ['p', 'p'], i: ['i', 'ɪ', 1, 1], n: ['n', 'n', 1],
  o: ['o', 'ɒ', 1, 1], d: ['d', 'd'], f: ['f', 'f', 1], c: ['c', 'k'], k: ['k', 'k'], e: ['e', 'ɛ', 1, 1], u: ['u', 'ʌ', 1, 1],
  g: ['g', 'g'], r: ['r', 'r', 1], h: ['h', 'h'], b: ['b', 'b'], l: ['l', 'l', 1],
  ck: ['ck', 'k'], ff: ['ff', 'f', 1], ll: ['ll', 'l', 1], ss: ['ss', 's', 1], s_z: ['s', 'z', 1],
  j: ['j', 'dʒ'], v: ['v', 'v', 1], w: ['w', 'w'], x: ['x', 'ks'], y: ['y', 'j'], z: ['z', 'z', 1], zz: ['zz', 'z', 1], qu: ['qu', 'kw'],
  sh: ['sh', 'ʃ', 1], ch: ['ch', 'tʃ'], th: ['th', 'θ', 1], th_v: ['th', 'ð', 1], ng: ['ng', 'ŋ', 1], nk: ['nk', 'ŋk'],
};
export const GPCS = SETS.flatMap((ids, si) => ids.map(id => id)).map((id, order) => {
  const [grapheme, phoneme, continuous, vowel] = INFO[id];
  return { id, grapheme, phoneme, set: SETS.findIndex(s => s.includes(id)) + 1, order: order + 1, continuous: !!continuous, vowel: !!vowel };
});
export const GPC = Object.fromEntries(GPCS.map(g => [g.id, g]));
export const PROTOTYPE_SIZE = 8;
export const PROTOTYPE_SET = GPCS.slice(0, PROTOTYPE_SIZE).map(g => g.id);
export const CONTINUOUS = new Set(GPCS.filter(g => g.continuous).map(g => g.id));
export const VOWEL_IDS = new Set(GPCS.filter(g => g.vowel).map(g => g.id));
// Look-alike / sound-alike pairs that must be kept apart (spec §3.3.1). q is introduced as 'qu'.
export const CONFUSABLE_PAIRS = [['b', 'd'], ['p', 'qu'], ['n', 'u'], ['m', 'w'], ['e', 'i']];
export const MIN_CONFUSABLE_GAP = 5;
export const BLENDING_UNLOCK_ORDER = SETS[0].length; // after set 1
