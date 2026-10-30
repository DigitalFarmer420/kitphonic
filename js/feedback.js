// rc5 feedback rules (owner Oct 30 + Uiux). Pure data so tests can check them.
// - Correct tap / pick: ONE sound, the chime (spec §3.8.3 "a short warm chime"; Concept "Find It": "a celebration sound
//   and sparkle"). No spoken "Yes!": the green glow + Kit's nod carry the praise. No echo of the letter sound after a
//   correct letter pick (the spec never asks for one there).
// - Spec-required follow-ups stay, strictly AFTER the chime: the word screen's reveal line ("the mascot says the word",
//   §3.5.2; v2 S3 "the check comes first, then the word plays as feedback"), Kit reading the sentence / story after the
//   pick (v2 V1), the traced letter's sound (§3.3 L1 "trace a letter while its sound plays"), the made word in families.
// - After the chime: CHIME_QUIET_MS of quiet, then the next prompt as one phrase.
// - Wrong tap: Kit names what was tapped, no sound effect.
// - Spoken praise only at milestones (activity finished, family made, level up), varied.
export const CORRECT = ['sfx-chime'];
export const CHIME_QUIET_MS = 400;
export const PRAISE = {
  letters: ['m-level-up', 'm-yes'],               // "You did it!" / "Yes!" — end of a letter round
  reading: ['m-you-read-it', 'm-level-up', 'm-yes'], // end of a star-word / sentence round
  levelUp: ['m-level-up', 'm-yes'],
};
export function praise(kind, rand = Math.random, last = null) { // varied: never the same line twice in a row
  const pool = PRAISE[kind] ?? PRAISE.letters, opts = pool.length > 1 ? pool.filter(p => p !== last) : pool;
  return opts[Math.floor(rand() * opts.length) % opts.length];
}
let lastPraise = null;
export const nextPraise = (kind, rand) => (lastPraise = praise(kind, rand, lastPraise));
