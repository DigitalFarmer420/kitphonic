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
  checkAtL1: false,
  supportLadder: true, // v2 V2 slider fade-out S4 -> S1 per pattern (js/support.js); ?ladder=0 = always S3; ?support=1..4 forces a level
  speakBeforeCheck: false, // v2 V1: Kit never says the target word / sentence before a scored pick (?speakBeforeCheck=1 = old model, logged unscored)
  wordCardCheck: true,          // no picture check -> printed minimal-pair word cards so the read is still scored (?cards=0)             //                                                  (?checkL1=1)
  choicesPerCheck: 3,           // 2–3 per spec
  // Distractors (review R8): 'minimal' = differ by exactly one phoneme, contrast position rotates onset/vowel/final.
  // Legacy: 'rhyme' = same rime, first sound differs (hat/mat/cat); 'vowel' = middle vowel first.  (?choices=)
  choiceStrategy: { 1: 'minimal', 2: 'minimal', 3: 'minimal', 4: 'minimal', 5: 'minimal', 6: 'minimal', 7: 'minimal' },
  tapMode: { 1: 'sound', 2: 'nameDot', 3: 'nameDot', 4: 'nameDot', 5: 'nameDot', 6: 'nameDot', 7: 'nameDot' }, // until mastery tracking exists (?mode=)
  markerOpts: { l1: 'dots', l4: 'dots' }, // L1 sound-by-sound (R2); 'bar' = one-bar 'at' (?l1=bar, ?l4=blendBar)
  hello: { show: true, greetingClip: 'm-hello' },                                   // (?skipHello=1)
  silentTip: 'No sound? Turn up the volume and check the silent switch.',
  familyMax: 4,                 // word family letter choices per family (Uiux rc1: <= 5 early on); ?familyMax=2..7
  sweepGapMs: 180,
  minutes: 7,                   // session length target, clamped 5–10 (?minutes=)
  progress: undefined,          // dev: start with N map stops passed, in-memory log (?progress=N, ?due=1)
  floatTapMode: 'sound',        // Floating Letters: 'sound' (default, spec: early taps = sound) | 'name'   (?floatMode=)
  letterTapMode: undefined,     // Phase 2 letter activities: undefined = automatic (sound -> nameDot after L1 mastery)  (?letterMode=)
};

export function configFromUrl(search = '') {
  const q = new URLSearchParams(search), c = structuredClone(CONFIG);
  if (q.get('case')) c.tileCase = q.get('case');
  if (q.get('level')) c.startLevel = Math.min(7, Math.max(1, +q.get('level') || c.startLevel));
  if (q.get('voice')) c.voice = q.get('voice');
  if (q.get('check') === '0') c.checkPictureWords = false;
  if (q.get('checkL1') === '1') c.checkAtL1 = true;
  if (q.get('cards') === '0') c.wordCardCheck = false;
  if (q.get('minutes')) { c.minutes = +q.get('minutes'); c.minutesSet = true; }
  if (q.get('progress')) c.progress = +q.get('progress');
  if (q.get('due') === '1') c.due = true;
  if (q.get('levelup') === '1') c.levelup = true; // dev: show the level-up moment for the last passed stop
  c.sentence = q.get('sentence') || undefined;
  c.story = q.get('story') || undefined;
  if (q.get('reread') === '1') c.reread = true; // dev: ?activity=story&story=pot&reread=1
  if (q.get('ladder') === '0') c.supportLadder = false;
  if (/^[1-4]$/.test(q.get('support') ?? '')) c.support = +q.get('support');
  if (q.get('speakBeforeCheck')) c.speakBeforeCheck = q.get('speakBeforeCheck') === '1';
  c.pool = q.get('pool')?.split(',').filter(Boolean) || undefined; // letter activities: ?pool=x,qu,sh (GPC ids)
  if (q.get('parent') === '1') c.parent = true;
  if (q.get('reducedMotion') === '1') c.reducedMotion = true;
  c.rime = q.get('rime') || undefined;
  if (q.get('familyMax')) c.familyMax = Math.min(7, Math.max(2, +q.get('familyMax') || c.familyMax));
  if (q.get('direct') === '1' || ((q.get('word') || q.get('level')) && !c.activity)) c.direct = true; // dev: word screen only
  if (q.get('choices')) for (const k in c.choiceStrategy) c.choiceStrategy[k] = q.get('choices');
  if (q.get('mode')) for (const k in c.tapMode) c.tapMode[k] = q.get('mode');
  if (q.get('l1')) c.markerOpts.l1 = q.get('l1');
  if (q.get('l4')) c.markerOpts.l4 = q.get('l4');
  if (q.get('skipHello') === '1') c.hello.show = false;
  c.seed = q.get('seed') ? +q.get('seed') : undefined;
  c.word = q.get('word') || undefined;
  c.activity = q.get('activity') || undefined;
  c.gpc = q.get('gpc') || undefined;
  if (q.get('floatMode')) { c.floatTapMode = q.get('floatMode'); c.floatModeSet = true; }
  if (q.get('letterMode')) c.letterTapMode = q.get('letterMode');
  return c;
}
