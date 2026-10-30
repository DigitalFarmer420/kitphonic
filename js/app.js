// Kitphonic boot: hello/audio-unlock -> planned session (session runner) -> all done.
// Dev entries: ?activity= (one letter game), ?direct=1&level=&word= (word screen only), ?progress=N[&due=1] (seeded,
// in-memory progress), ?minutes=5..10.
import { configFromUrl } from './config.js';
import { createStage } from './stage.js';
import { createAudio } from './audio.js';
import { createWordScreen } from './word-screen.js';
import { supportFor } from './support.js';
import { sessionWords, rng } from './word-logic.js';
import { WORDS } from './content.js';
import { createStore, skillState, blendL1Mastered, knownGpcs } from './mastery.js';
import { createSettings } from './settings.js';
import { createLettersScreen } from './letters-screen.js';
import { letterTapMode } from './letter-logic.js';
import { LETTERS } from './core.js';
import { planSession } from './session.js';
import { mapState } from './progress.js';
import { seedProgress, memoryStorage } from './dev-seed.js';
import { createMapScreen } from './map-screen.js';
import { createLessonScreen } from './lesson-screen.js';
import { createStarScreen, createSentenceScreen } from './star-screen.js';
import { createParentScreen } from './parent-screen.js';
import { createSeen } from './seen.js';
import { createFamilyScreen } from './family-screen.js';
import { servableFamilies } from './families.js';
import { allSentences, allStories } from './sentences.js';

const cfg = configFromUrl(location.search);
const $ = id => document.getElementById(id);
const stage = createStage($('stage'), () => { const k = window.kitphonic; k?.screen?.relayout?.(); k?.mapScreen?.relayout?.(); k?.sentenceScreen?.relayout?.(); k?.lesson?.relayout?.(); k?.familyScreen?.relayout?.(); });

const rand = rng(cfg.seed ?? Date.now());
// ?reducedMotion=1 forces the device preference on (testing); the grown-ups setting still decides when it is On/Off.
const settings = createSettings(window.localStorage, undefined, cfg.reducedMotion ? () => ({ matches: true }) : globalThis.matchMedia?.bind(globalThis));
const audio = await createAudio({ base: 'audio/', speechRate: () => settings.audioRate() });
// Reduced motion app-wide: a stage class stops CSS animation/transitions; screens also skip drift, path drawing,
// confetti, the ghost hand and demos via settings.reducedMotion().
const applyMotion = () => $('stage').classList.toggle('rm', settings.reducedMotion());
applyMotion(); settings.onChange(k => (k === 'reducedMotion' || k === '*') && applyMotion());
globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyMotion);
// Local only (spec §3.9). Dev ?progress=N uses a seeded in-memory log so real progress is never touched.
const storage = cfg.progress != null ? memoryStorage({ 'kitphonic.v1.responses': JSON.stringify(seedProgress(cfg.progress, { due: cfg.due })) }) : window.localStorage;
const store = createStore(storage);
const seen = createSeen(storage); // ghost-hand demos: first meetings per activity (in-memory in dev ?progress mode)
let sessionId = null;
const show = id => { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; };
const log = r => store.log({ ...r, sessionId });
const known = () => (session ? knownGpcs(store.all()) : null); // dev direct mode: no taught-GPC filter on word cards

let session = null; // { plan, i, started, stickers }
// v2 V2: support level per word — forced (?support / ?speakBeforeCheck), else the ladder in a session (dev direct
// screens without a session use S3, the scored default)
const supportLevel = entry => cfg.support ?? (cfg.speakBeforeCheck ? 4 : session && cfg.supportLadder ? supportFor(store.all(), entry, { sessionId }).level : 3);
const screen = createWordScreen({
  known, audio, cfg, rand, stage, record: log, seen, reduced: () => settings.reducedMotion(), support: supportLevel,
  onDone: stickers => allDone(stickers),
  onHome: () => goHome(),
});
const letters = createLettersScreen({ audio, cfg, rand, stage, settings, seen, record: log, onHome: () => goHome() });
const lesson = createLessonScreen({ audio, stage, settings, seen, rand, record: log, onHome: () => goHome() });
const starScreen = createStarScreen({ audio, stage, seen, reduced: () => settings.reducedMotion(), rand, cfg, record: log, onHome: () => goHome(), known: () => known() });
const familyScreen = createFamilyScreen({ audio, stage, settings, seen, rand, cfg, record: log, onHome: () => goHome() });
const sentenceScreen = createSentenceScreen({ audio, stage, seen, reduced: () => settings.reducedMotion(), rand, cfg, record: log, onHome: () => goHome(), support: supportLevel });

const mapScreen = createMapScreen({ audio, stage, settings, seen, getMap: () => mapState(store.all()), getResponses: () => store.all(),
  onGo: () => startSession(), onHome: () => { audio.stop(); show('hello'); }, onParent: () => openParent() });
function showMap(opts) { show('map'); mapScreen.render(opts); }
const parent = createParentScreen({ settings, audio, tip: cfg.silentTip, getResponses: () => store.all(),
  onClose: () => showMap(), onReset: () => { store.clear(); seen.reset(); } });
function openParent() { audio.stop(); show('parent'); parent.open(); }
function goHome() { audio.stop(); letters.stop(); lesson.stop(); familyScreen.stop(); session = null; showMap(); }
function allDone(stickers = session?.stickers ?? []) {
  const before = session?.mapBefore ?? null, after = mapState(store.all());
  session = null;
  if (before != null && after.index > before) { // a stop was passed: level-up moment, then the path draws forward
    show('levelup'); mapScreen.levelUp(after.stops[after.index - 1], { onBack: () => showMap({ drawFrom: before }) }); return;
  }
  $('stickers').textContent = stickers.join(' '); show('done'); audio.play('m-all-done');
}
const tapModeFor = activity => letterTapMode(activity, { blendL1Mastered: blendL1Mastered(store.all()), override: cfg.letterTapMode, floatMode: cfg.floatModeSet ? cfg.floatTapMode : settings.get('floatMode') });

// --- Session runner ---
export function startSession() {
  if (cfg.activity) return startActivity(cfg.activity);
  if (cfg.direct) return startDirect();
  sessionId = `s-${Date.now()}`;
  const plan = planSession(store.all(), { minutes: cfg.minutesSet ? cfg.minutes : settings.get('sessionMinutes'), rand, familyMax: cfg.familyMax, familySecureMax: cfg.familySecureMax });
  session = { plan, i: -1, started: performance.now(), stickers: [], mapBefore: mapState(store.all()).index };
  runNext();
}
function runNext() {
  if (!session) return;
  session.i++;
  const it = session.plan.items[session.i], overTime = performance.now() - session.started > 10 * 60e3; // hard 10-min cap
  if (!it || overTime) return allDone();
  if (it.type === 'letters') {
    show('letters');
    letters.start({ activity: it.activity, pool: it.pool, targets: it.targets, rounds: it.rounds, mode: tapModeFor(it.activity), newSound: it.newSound, assist: it.assist, n: it.n,
      onComplete: r => { if (r?.score) session && session.stickers.push('⭐'); runNext(); } });
  } else if (it.type === 'words') {
    show('word'); screen.start(it.words, it.level, { apply: it.apply, assist: it.assist, focus: it.focus, onDone: st => { session?.stickers.push(...st); runNext(); } });
  } else if (it.type === 'story') {
    show('sentence'); sentenceScreen.start({ story: it.story, reread: it.reread, onComplete: () => { session?.stickers.push('📚'); runNext(); } });
  } else if (it.type === 'lesson') {
    show('lesson'); lesson.start({ activity: it.activity, gpc: it.gpc, onComplete: () => { session?.stickers.push(it.activity === 'trace' ? '✏️' : '🔤'); runNext(); } });
  } else if (it.type === 'star') {
    show('star'); starScreen.start({ word: it.word, onComplete: () => { session?.stickers.push('⭐'); runNext(); } });
  } else if (it.type === 'family') {
    show('family'); familyScreen.start({ family: it.family, onComplete: () => { session?.stickers.push('⭐'); runNext(); } });
  } else if (it.type === 'sentence') {
    show('sentence'); sentenceScreen.start({ sentence: it.sentence, onComplete: () => { session?.stickers.push('📖'); runNext(); } });
  } else runNext();
}
function startActivity(activity) { // dev: one letter game (or ?activity=intro|trace&gpc=s)
  sessionId ??= `s-${Date.now()}`;
  if (activity === 'star') { show('star'); return starScreen.start({ word: cfg.word ?? 'the', onComplete: () => allDone([]) }); }
  if (activity === 'family') { show('family'); const fs = servableFamilies(undefined, cfg.familyMax); return familyScreen.start({ family: fs.find(f => f.rime === cfg.rime) ?? fs[0], // capped at FAMILY_MAX like a real session
    onComplete: () => allDone([]) }); }
  if (activity === 'story') { show('sentence'); const ss = allStories(); return sentenceScreen.start({ story: ss.find(x => x.id === cfg.story) ?? ss[0], reread: cfg.reread, onComplete: () => allDone([]) }); }
  if (activity === 'sentence') { show('sentence'); const ss = allSentences(); return sentenceScreen.start({ sentence: ss.find(x => x.id === cfg.sentence) ?? ss[0], onComplete: () => allDone([]) }); }
  if (activity === 'intro' || activity === 'trace') { show('lesson'); return lesson.start({ activity, gpc: cfg.gpc ?? 's', onComplete: () => allDone([]) }); }
  show('letters');
  letters.start({ activity, pool: cfg.pool ?? LETTERS.slice(0, 6), rounds: 4, mode: tapModeFor(activity), onComplete: () => allDone([]) });
}
function startDirect() { // dev: word screen at ?level (and ?word first)
  const lv = cfg.startLevel; sessionId = `s-${Date.now()}`;
  let list = sessionWords(lv, { rand });
  if (cfg.word) { const e = Object.values(WORDS).flat().find(x => x.w === cfg.word); if (e) list = [e, ...list.filter(x => x.w !== e.w)].slice(0, list.length); }
  show('word'); screen.start(list, lv);
}

// Hello: one big play button; the tap unlocks audio (autoplay policies / iOS) and plays Kit's greeting.
$('play').onclick = async () => {
  await audio.unlock({ first: [cfg.hello.greetingClip] });
  $('hello-bubble').textContent = "Hi! I'm Kit. Let's read together!";
  await audio.play(cfg.hello.greetingClip);
  cfg.activity || cfg.direct ? startSession() : showMap(); // the map is home
};
$('speaker').onclick = async () => { // sound check + silent-mode tip
  await audio.unlock(); audio.play('sfx-chime');
  const tip = $('tip'); tip.textContent = cfg.silentTip; tip.hidden = !tip.hidden;
};
$('done-home').onclick = () => showMap();

window.kitphonic = { cfg, audio, screen, letters, lesson, starScreen, sentenceScreen, familyScreen, parent, openParent, settings, mapScreen, showMap, startSession, startActivity, store, get session() { return session; },
  map: () => mapState(store.all()), skillState: skill => skillState(store.all(), skill) }; // debugging / automated checks
if (cfg.parent) openParent(); // dev: ?parent=1 skips the gate
else if (cfg.levelup) { const m = mapState(store.all()); if (m.index > 0) { show('levelup'); mapScreen.levelUp(m.stops[m.index - 1], { onBack: () => showMap({ drawFrom: m.index - 1 }) }); } else showMap(); } // dev
else if (!cfg.hello.show) cfg.activity || cfg.direct ? startSession() : showMap();
else show('hello');
