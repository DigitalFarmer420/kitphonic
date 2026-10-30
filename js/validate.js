// Decodability validator — literacy review R5. Pure; tests/content.test.mjs runs it in `npm test` (CI-blocking).
import { GPC, PROTOTYPE_SIZE } from './sequence.js';

export const parseIds = e => (Array.isArray(e.parse) ? e.parse : e.parse.trim().split(/\s+/));
export const expand = e => parseIds(e).map(id => [GPC[id]?.grapheme, GPC[id]?.phoneme]); // [[grapheme, phoneme]]
export const patternOf = ids => ids.map(id => (GPC[id]?.vowel ? 'V' : 'C')).join('');
export const LEVEL_PATTERNS = { 1: ['VC'], 2: ['CVC'], 3: ['CVC'], 4: ['CCVC'], 5: ['CVCC'], 6: ['CVC', 'CVCC'] }; // 6 = digraph words (sh i p is CVC by sound)
// How far into the sequence each level's words may reach. L2 (onset + rime) stays on the prototype set; L1, L3–L5 grow
// with sets 3–7 (served only once known); L6 = set 8 digraphs (sh ch th ng nk) and must use one.
const BEFORE_SET8 = GPC.sh.order - 1;
export const LEVEL_K = { 1: BEFORE_SET8, 3: BEFORE_SET8, 4: BEFORE_SET8, 5: BEFORE_SET8, 6: GPC.nk.order };
export const earliestLegalK = e => Math.max(...parseIds(e).map(id => GPC[id]?.order ?? Infinity));

// Rules 1, 2, 4 (+ pictures). k = sequence position taught so far (prototype: 8).
export function validateWord(e, { k = LEVEL_K[e.level] ?? PROTOTYPE_SIZE } = {}) {
  const errs = [], ids = parseIds(e), bad = (rule, msg, gpc) => errs.push({ word: e.text, rule, gpc, msg });
  for (const id of ids) if (!GPC[id]) bad('parse', `unknown GPC "${id}"`, id);
  if (errs.length) return errs;
  const joined = ids.map(id => GPC[id].grapheme).join('');
  if (joined !== e.text) bad('parse', `parse spells "${joined}", not "${e.text}"`);
  for (const id of ids) if (GPC[id].order > k) bad('untaught', `GPC "${id}" (/${GPC[id].phoneme}/, order ${GPC[id].order}) not taught by position ${k}`, id);
  const pat = patternOf(ids), allowed = LEVEL_PATTERNS[e.level];
  if (allowed && !allowed.includes(pat)) bad('pattern', `L${e.level} needs ${allowed.join('/')}, got ${pat}`);
  if (/[A-Z]/.test(e.text)) bad('capital', 'capitals only for names / "I" once taught');
  return errs;
}
export function validateContent(words, { k = null, where = () => '' } = {}) {
  return words.flatMap(e => validateWord(e, k ? { k } : {}).map(x => ({ ...x, where: where(e) })));
}
export const formatErrors = errs => errs.map(e => `${e.where ? e.where + ': ' : ''}"${e.word}" [${e.rule}${e.gpc ? ' ' + e.gpc : ''}] ${e.msg}`).join('\n');

// Rule 3 (runtime): serve a word only if every GPC is secure/mastered for this child.
export const servable = (e, childKnown) => parseIds(e).every(id => childKnown.has(id));
