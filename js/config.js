// Kitphonic design defaults (pending product decisions). Change here; most can be overridden per run via
// URL params, e.g. index.html?level=3&case=upper&voice=upbeat&choices=rhyme&seed=7&skipHello=1
export const CONFIG = {
  mascot: { name: 'Kit', kind: 'honey kitten' },
  tileCase: 'lower',            // word screen letters: 'lower' | 'upper'            (?case=)
  startLevel: 2,                // (?level=1..4)
  voice: 'calm',                // "Let's slide it again" take: 'calm' | 'upbeat'    (?voice=)
  // Picture check (§3.5.2): only picturable words with a minimal-pair picture get one; others (sat, top…) get a
  // spoken sentence. Never at L1 unless checkAtL1 (review R8 / spec open question 1).
  checkPictureWords: true,      // false = never show the check                     (?check=0)
  checkAtL1: false,             //                                                  (?checkL1=1)
  choicesPerCheck: 3,           // 2–3 per spec
  // Distractors (review R8): 'minimal' = differ by exactly one phoneme, contrast position rotates onset/vowel/final.
  // Legacy: 'rhyme' = same rime, first sound differs (hat/mat/cat); 'vowel' = middle vowel first.  (?choices=)
  choiceStrategy: { 1: 'minimal', 2: 'minimal', 3: 'minimal', 4: 'minimal' },
  tapMode: { 1: 'sound', 2: 'nameDot', 3: 'nameDot', 4: 'nameDot' }, // until mastery tracking exists (?mode=)
  markerOpts: { l1: 'dots', l4: 'dots' }, // L1 sound-by-sound (R2); 'bar' = one-bar 'at' (?l1=bar, ?l4=blendBar)
  hello: { show: true, greetingClip: 'm-hello' },                                   // (?skipHello=1)
  silentTip: 'No sound? Turn up the volume and check the silent switch.',
  sweepGapMs: 180,
};

export function configFromUrl(search = '') {
  const q = new URLSearchParams(search), c = structuredClone(CONFIG);
  if (q.get('case')) c.tileCase = q.get('case');
  if (q.get('level')) c.startLevel = Math.min(4, Math.max(1, +q.get('level') || c.startLevel));
  if (q.get('voice')) c.voice = q.get('voice');
  if (q.get('check') === '0') c.checkPictureWords = false;
  if (q.get('checkL1') === '1') c.checkAtL1 = true;
  if (q.get('choices')) for (const k in c.choiceStrategy) c.choiceStrategy[k] = q.get('choices');
  if (q.get('mode')) for (const k in c.tapMode) c.tapMode[k] = q.get('mode');
  if (q.get('l1')) c.markerOpts.l1 = q.get('l1');
  if (q.get('l4')) c.markerOpts.l4 = q.get('l4');
  if (q.get('skipHello') === '1') c.hello.show = false;
  c.seed = q.get('seed') ? +q.get('seed') : undefined;
  c.word = q.get('word') || undefined;
  return c;
}
