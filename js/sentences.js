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

// Scored read (comprehension check): after "read it all" the child picks the picture that shows the sentence from 3.
// Distractors come from other sentences whose picture differs AND that share no decodable word with this one
// (so "the mop is in the pot" is never paired with a pot picture). Returns shuffled pics incl. the answer.
export function pictureChoices(sent, all = allSentences(), rand = Math.random, n = 3) {
  const mine = new Set(sent.tokens.filter(t => t.kind === 'word').map(t => t.entry.w));
  const ok = all.filter(o => o.id !== sent.id && o.pic !== sent.pic && !o.tokens.some(t => t.kind === 'word' && mine.has(t.entry.w)));
  const pics = [];
  for (const o of [...ok].sort(() => rand() - 0.5)) if (!pics.includes(o.pic)) pics.push(o.pic);
  const out = [sent.pic, ...pics.slice(0, n - 1)];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
