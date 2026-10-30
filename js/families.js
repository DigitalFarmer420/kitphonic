// Word families (design/words-board 2): a fixed rime ("at") and onset tiles the child places in front of it.
// Built only from words the app can already read aloud (WORDS), and only with taught letters (untaught-sound rule).
import { WORDS } from './content.js';
import { GPC } from './sequence.js';

export const FAMILY_MAX = 4, FAMILY_MIN = 2;
export const RIME_TTS = { at: 'at', am: 'am', an: 'an', ap: 'app', ab: 'ab', ad: 'add', ag: 'ag', in: 'in', it: 'it', ip: 'ip', ig: 'ig', id: 'id',
  ock: 'ock', ess: 'ess', uck: 'uck', ell: 'ell', ep: 'ep', ill: 'ill', op: 'opp', ot: 'ot', og: 'og', on: 'on', en: 'en', et: 'et', eg: 'egg', ed: 'ed', un: 'un', ug: 'ug', ut: 'ut', up: 'up', ub: 'ub', ud: 'ud' };
// CVC words whose three graphemes are single letters: onset + 2-letter rime
const cvc = () => {
  const seen = new Set(), out = [];
  for (const e of Object.values(WORDS).flat()) {
    const ids = e.parse.split(' ');
    if (ids.length !== 3 || seen.has(e.w) || !GPC[ids[1]]?.vowel || ids.some(id => GPC[id]?.grapheme.length !== 1)) continue;
    seen.add(e.w); out.push({ w: e.w, onset: ids[0], rime: e.w.slice(1), entry: e, ids });
  }
  return out;
};
export function allFamilies() {
  const by = new Map(); for (const x of cvc()) { if (!by.has(x.rime)) by.set(x.rime, []); by.get(x.rime).push(x); }
  return [...by].map(([rime, words]) => ({ rime, words })).filter(f => f.words.length >= FAMILY_MIN);
}
export function servableFamilies(known, max = FAMILY_MAX) {
  return allFamilies().map(f => ({ ...f, words: f.words.filter(x => !known || x.ids.every(id => known.has(id))).slice(0, max) }))
    .filter(f => f.words.length >= FAMILY_MIN);
}
export const familyClips = () => allFamilies().map(f => ({ id: `rime-${f.rime}`, text: f.rime, tts: RIME_TTS[f.rime] ?? f.rime }));
