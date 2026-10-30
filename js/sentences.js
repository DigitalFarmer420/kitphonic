// Sentence model (pure): tokens are star words (tap to hear, no slider) or decodable words (tiles + slider).
import { SENTENCES, STAR_WORDS, WORDS } from './content.js';
import { parseIds } from './validate.js';

const byWord = () => { const m = new Map(); for (const [lv, list] of Object.entries(WORDS)) for (const e of list) if (!m.has(e.w)) m.set(e.w, { ...e, level: +lv }); return m; };
const STAR = new Map(STAR_WORDS.map(s => [s.w.toLowerCase(), s]));
export const tokenize = text => text.split(/\s+/).map(t => ({ raw: t, w: t.replace(/[^A-Za-z]/g, ''), punct: t.replace(/[A-Za-z]/g, '') })).filter(t => t.w);
export function resolveSentence(sent) {
  const words = byWord();
  const tokens = tokenize(sent.text).map(t => {
    const star = STAR.get(t.w.toLowerCase());
    if (star && (star.w !== 'I' || t.w === 'I')) return { ...t, kind: 'star', star, clip: `star-${star.w}` };
    const e = words.get(t.w.toLowerCase());
    return e ? { ...t, kind: 'word', entry: e, clip: `word-${e.w}` } : { ...t, kind: 'unknown' };
  });
  const level = Math.max(1, ...tokens.filter(t => t.kind === 'word').map(t => t.entry.level));
  return { ...sent, tokens, level, stars: [...new Set(tokens.filter(t => t.kind === 'star').map(t => t.star.w))] };
}
export const allSentences = () => SENTENCES.map(resolveSentence);
// Servable: every decodable word uses known GPCs; every star word has been introduced (in `stars`).
export function servableSentences(known, introducedStars) {
  return allSentences().filter(s => s.tokens.every(t => t.kind === 'word' ? parseIds(t.entry).every(g => known.has(g)) : t.kind === 'star' ? introducedStars.has(t.star.w) : false));
}
