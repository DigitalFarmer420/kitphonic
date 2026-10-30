// Sentence model (pure): tokens are star words (tap to hear, no slider) or decodable words (tiles + slider).
import { SENTENCES, STAR_WORDS, WORDS, STORIES, scenePic } from './content.js';
import { parseIds } from './validate.js';

const byWord = () => { const m = new Map(); for (const [lv, list] of Object.entries(WORDS)) for (const e of list) if (!m.has(e.w)) m.set(e.w, { ...e, level: +lv }); return m; };
const STAR = new Map(STAR_WORDS.map(s => [s.w.toLowerCase(), s]));
export const tokenize = text => text.split(/\s+/).map(t => ({ raw: t, w: t.replace(/[^A-Za-z]/g, ''), punct: t.replace(/[A-Za-z]/g, '') })).filter(t => t.w);
// known: the child's known GPCs. A star word whose tricky part has since been taught (v2 V4e: 'is' after s = /z/) is
// resolved as a decodable word (slider) instead.
export function resolveSentence(sent, known = null) {
  const words = byWord();
  const tokens = tokenize(sent.text).map(t => {
    const star = STAR.get(t.w.toLowerCase());
    const grad = star?.graduates && known?.has(star.graduates) && words.get(t.w.toLowerCase());
    if (star && !grad && (star.w !== 'I' || t.w === 'I')) return { ...t, kind: 'star', star, clip: `star-${star.w}` };
    const e = words.get(t.w.toLowerCase());
    return e ? { ...t, kind: 'word', entry: e, clip: `word-${e.w}` } : { ...t, kind: 'unknown' };
  });
  const level = Math.max(1, ...tokens.filter(t => t.kind === 'word').map(t => t.entry.level));
  return { ...sent, tokens, level, stars: [...new Set(tokens.filter(t => t.kind === 'star').map(t => t.star.w))] };
}
export const allSentences = (known = null) => SENTENCES.map(s => resolveSentence(s, known));
// Servable: every decodable word uses known GPCs; every star word has been introduced (in `stars`).
const readable = (s, known, introducedStars) => s.tokens.every(t => t.kind === 'word' ? parseIds(t.entry).every(g => known.has(g)) : t.kind === 'star' ? introducedStars.has(t.star.w) : false);
export function servableSentences(known, introducedStars) {
  return allSentences(known).filter(s => readable(s, known, introducedStars));
}
// Stories: every page resolved like a sentence; servable only when every page is (same untaught-sound check).
export const resolveStory = (st, known = null) => ({ ...st, pages: st.pages.map(p => resolveSentence(p, known)), titleTokens: resolveSentence({ text: st.title }, known).tokens });
export const allStories = (known = null) => STORIES.map(s => resolveStory(s, known));
export function servableStory(id, known, introducedStars) {
  const st = allStories(known).find(s => s.id === id); return st && st.pages.every(p => readable(p, known, introducedStars)) ? st : null;
}

// Scored read (comprehension check, v2 V7): after reading, the child picks the picture that shows the sentence from
// 3. Distractors swap exactly one of the sentence's two scene words (pig in the mud / dog in the mud / pig in the box),
// so reading a single noun is not enough. Returns shuffled pics incl. the answer.
export function sentenceDistractors(sent) {
  return Object.entries(sent.alts ?? {}).map(([word, [alt, pic]]) => ({
    swaps: word, word: alt, pic: scenePic({ ...sent.scene, [word]: pic }),
    text: sent.text.replace(new RegExp(`\\b${word}\\b`), alt) }));
}
export function pictureChoices(sent, rand = Math.random, n = 3) {
  const alts = sentenceDistractors(sent).sort(() => rand() - 0.5).slice(0, n - 1).map(d => d.pic);
  const out = [sent.pic, ...alts];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
