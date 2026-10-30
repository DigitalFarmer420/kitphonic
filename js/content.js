import { GPC } from './sequence.js';
// Kitphonic prototype content (spec §3.3.1, §3.6, §3.7, §3.9). Pure data, no DOM.
// Every target word decodes from the 8-letter prototype set in core.js (LETTERS).
// `pic`: emoji placeholder, or '#id' for an inline SVG symbol in index.html. Placeholder art only.

export const LETTER_INFO = {
  //       name text  name tts   sound text  sound tts  held tts (stretchy only)
  m: { name: 'M', nameTts: 'em',  sound: 'm', soundTts: 'mm',  heldTts: 'mmmmmm' },
  s: { name: 'S', nameTts: 'ess', sound: 's', soundTts: 'ss',  heldTts: 'ssssss' },
  a: { name: 'A', nameTts: 'ay',  sound: 'a (apple)', soundTts: 'aah', heldTts: 'aaaaah' },
  t: { name: 'T', nameTts: 'tee', sound: 't', soundTts: 'tuh' },
  p: { name: 'P', nameTts: 'pee', sound: 'p', soundTts: 'puh' },
  i: { name: 'I', nameTts: 'eye', sound: 'i (itch)', soundTts: 'ih', heldTts: 'iiiih' },
  n: { name: 'N', nameTts: 'en',  sound: 'n', soundTts: 'nn',  heldTts: 'nnnnnn' },
  o: { name: 'O', nameTts: 'oh',  sound: 'o (top)', soundTts: 'aw', heldTts: 'awwww' },
};

// Level ladder (§3.7) — review R5 data model. Each word: text, parse (GPC ids from js/sequence.js, space-separated),
// level, optional pic (picturable + unambiguous), say (Kit's reveal line). `pattern`, `phonemes`, `w` are derived.
// tests/content.test.mjs validates every entry (parse integrity, taught GPCs only, level pattern, audio coverage).
// Words without `pic` skip the picture check and get a spoken sentence instead (spec open question 1).
const W = (text, parse, extra = {}) => ({ text, parse, ...extra });
export const WORDS = {
  1: [ // VC
    W('at', 'a t', { say: 'At! Look at me.' }), W('am', 'a m', { say: 'Am! I am Kit.' }), W('an', 'a n', { say: 'An! An apple.' }),
    W('in', 'i n', { say: 'In! In the box.' }), W('it', 'i t', { say: 'It! I got it.' }), W('on', 'o n', { say: 'On! On the mat.' }),
  ],
  2: [ // CVC (display: onset + rime by default — ⚠️ L2 blend style awaits user decision)
    W('mat', 'm a t', { pic: '#mat' }), W('map', 'm a p', { pic: '🗺️' }), W('tap', 't a p', { pic: '🚰' }),
    W('pan', 'p a n', { pic: '🍳' }), W('man', 'm a n', { pic: '👨' }), W('pin', 'p i n', { pic: '📌' }),
    W('sat', 's a t', { say: 'Sat! The cat sat.' }), W('nap', 'n a p', { say: 'Nap! Time for a nap.' }),
    W('sip', 's i p', { say: 'Sip! Take a sip.' }), W('tin', 't i n', { say: 'Tin! A tin can.' }),
  ],
  3: [ // CVC, all phonemes. map/pan re-read sound-by-sound (spec L3 examples)
    W('pot', 'p o t', { pic: '🍲' }), W('mop', 'm o p', { pic: '🧹' }), W('map', 'm a p', { pic: '🗺️' }), W('pan', 'p a n', { pic: '🍳' }),
    W('sit', 's i t', { say: 'Sit! Sit down.' }), W('pop', 'p o p', { say: 'Pop! Pop the bubble.' }),
    W('top', 't o p', { say: 'Top! Spin the top.' }), W('tip', 't i p', { say: 'Tip! The tip of my nose.' }),
    W('not', 'n o t', { say: 'Not! Not now.' }), W('pit', 'p i t', { say: 'Pit! A big pit.' }),
  ],
  4: [ // CCVC: starting blend; each blend consonant its own dot
    W('stop', 's t o p', { pic: '🛑', say: 'Stop!' }), W('spot', 's p o t', { pic: '🔴', say: 'A red spot!' }), // no minimal-pair pictures yet: reveal without check
    W('snap', 's n a p', { say: 'Snap! Snap your fingers.' }), W('spin', 's p i n', { say: 'Spin! Spin around.' }),
    W('snip', 's n i p', { say: 'Snip! Snip the paper.' }), W('spit', 's p i t', { say: 'Spit! Spit it out.' }),
    W('spat', 's p a t', { say: 'Spat! The cat spat.' }),
  ],
};
for (const [lv, list] of Object.entries(WORDS)) for (const e of list) {
  e.level = +lv; e.w = e.text; e.say ??= `A ${e.text}!`;
  const ids = e.parse.split(' '); e.phonemes = ids.map(id => GPC[id]?.phoneme); e.pattern = ids.map(id => (GPC[id]?.vowel ? 'V' : 'C')).join('');
}

// Picture-only distractors for the check (pictured + spoken, never printed, so untaught GPCs are fine).
// `ph` = GPC ids of the spoken phonemes; R8: each distractor differs from its target by exactly one phoneme.
export const PICTURE_POOL = [
  { text: 'hat', pic: '#hat', ph: 'h a t' }, { text: 'cat', pic: '#cat', ph: 'c a t' }, { text: 'bat', pic: '🦇', ph: 'b a t' },
  { text: 'rat', pic: '🐀', ph: 'r a t' }, { text: 'mitt', pic: '🧤', ph: 'm i t' }, { text: 'cap', pic: '🧢', ph: 'c a p' },
  { text: 'fan', pic: '🪭', ph: 'f a n' }, { text: 'van', pic: '🚐', ph: 'v a n' }, { text: 'pen', pic: '🖊️', ph: 'p e n' },
  { text: 'fin', pic: '🦈', ph: 'f i n' }, { text: 'bin', pic: '🗑️', ph: 'b i n' }, { text: 'pig', pic: '🐷', ph: 'p i g' },
  { text: 'tag', pic: '🏷️', ph: 't a g' }, { text: 'shop', pic: '🏪', ph: 'sh o p' }, { text: 'dot', pic: '⚫', ph: 'd o t' },
];
for (const p of PICTURE_POOL) p.phonemes = p.ph.split(' ').map(id => GPC[id].phoneme);

// Star (tricky) words — literacy review R6 (⚠️ list still an open user decision; spec §3.6 had was/said/of/to/you).
// parse: GPC ids for regular parts; { g, ph, irregular: true } marks the "tricky part" (heart grapheme).
// introAfter: GPC ids that must be taught first, plus optional prerequisite star word.
const IRR = (g, ph) => ({ g, ph, irregular: true });
export const STAR_WORDS = [
  { w: 'I',    level: 2, parse: [IRR('I', 'aɪ')],              introAfter: { gpcs: ['i'] }, say: 'I can see Kit.', capital: true },
  { w: 'the',  level: 2, parse: [IRR('th', 'ð'), IRR('e', 'ə')], introAfter: { gpcs: ['m', 's', 'a', 't'] }, say: 'The cat sat on the mat.' }, // at blending unlock
  { w: 'is',   level: 3, parse: ['i', IRR('s', 'z')],          introAfter: { gpcs: ['s', 'i'] }, say: 'It is a map.' },
  { w: 'to',   level: 3, parse: ['t', IRR('o', 'uː')],         introAfter: { gpcs: ['t', 'o'] }, say: 'Go to the top.' },
  { w: 'no',   level: 4, parse: ['n', IRR('o', 'oʊ')],         introAfter: { gpcs: ['n', 'o'] }, say: 'No, not now.', note: '⚠️ o = /oʊ/ (US) or /əʊ/ (UK)' },
  { w: 'into', level: 4, parse: ['i', 'n', 't', IRR('o', 'uː')], introAfter: { gpcs: ['i', 'n', 't', 'o'], star: 'to' }, say: 'Pop it into the pot.' },
];
for (const s of STAR_WORDS) s.tricky = s.parse.filter(p => p.irregular).map(p => p.g).join('+');
export const MAX_NEW_STAR_PER_LEVEL = 2;

// Mascot lines. Two takes of "Let's slide it again": calm (default) and upbeat; neither sounds disappointed.
export const MASCOT = {
  'm-hello': "Hi! I'm Kit. Let's read together!",
  'm-slide-intro': 'Slide your finger under the word.',
  'm-tap-hint': 'Tap a letter to hear its name. Tap a dot to hear its sound!',
  'm-tap-hint-sound': 'Tap a letter or a dot to hear its sound!',
  'm-which-picture': 'Which picture is…',
  'm-slide-again-calm': "Let's slide it again.",
  'm-slide-again-upbeat': "Ooh, so close! Let's slide it again!",
  'm-you-read-it': 'You read it!',
  'm-slide-slowly': "Let's slide slowly, so we hear every sound.",
  'm-next-word': 'Ready for the next word?',
  'm-all-done': 'All done for today. Great reading!',
  'm-demo-rule': 'Now letters say their names, and dots say their sounds!',
  'm-find-letter': 'Can you find…',
  'm-thats': "That's…",
};

export const SFX = {
  'sfx-chime': { text: 'soft warm chime (success, under 1 s)', file: 'placeholder/sfx-chime.wav' },
  'sfx-tap': { text: 'soft tap tick', file: 'placeholder/sfx-tap.wav' },
};

export const SESSION_WORDS = 5; // pebbles in the top bar
