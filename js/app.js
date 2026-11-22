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
import { planSession, sessionOutcome, planReplay } from './session.js';
import { mapState, progressMarkers } from './progress.js';
import { seedProgress, memoryStorage } from './dev-seed.js';
import { createMapScreen } from './map-screen.js';
import { createLessonScreen } from './lesson-screen.js';
import { createStarScreen, createSentenceScreen } from './star-screen.js';
import { createParentScreen } from './parent-screen.js';
import { createSeen } from './seen.js';
import { createFamilyScreen } from './family-screen.js';
import { servableFamilies } from './families.js';
import { allSentences, allStories } from './sentences.js';
import { MASCOT } from './content.js';
import { createHelloGate } from './hello-gate.js';
import { createHelloVisit } from './hello-visit.js';
import { createSessionLog, observeAudioContexts, sessionLogEnabled, watchStorage } from './session-log.js';
import { registerServiceWorker } from './sw-register.js';
import { createPreviewGate, createPreview, placeBadge } from './preview.js';

const cfg = configFromUrl(location.search);
const $ = id => document.getElementById(id);
// ?sessionlog=1 is the only thing that builds the overlay, listens, or wraps storage / AudioContext.
const sessionLog = sessionLogEnabled(location.search) ? createSessionLog(document) : null;
if (sessionLog) observeAudioContexts(globalThis, sessionLog);
const stage = createStage($('stage'), () => { const k = window.kitphonic; k?.screen?.relayout?.(); k?.mapScreen?.relayout?.(); k?.sentenceScreen?.relayout?.(); k?.lesson?.relayout?.(); k?.familyScreen?.relayout?.(); k?.letters?.relayout?.(); });

const rand = rng(cfg.seed ?? Date.now());
// ?reducedMotion=1 forces the device preference on (testing); the grown-ups setting still decides when it is On/Off.
// Grown-ups lesson preview: every storage the app writes goes through this gate. During a preview all writes land in
// an in-memory overlay that is dropped on exit, so a preview cannot change progress, demos or settings on the device.
const previewGate = createPreviewGate();
const settings = createSettings(previewGate.wrap(sessionLog ? watchStorage(window.localStorage, sessionLog) : window.localStorage), undefined, cfg.reducedMotion ? () => ({ matches: true }) : globalThis.matchMedia?.bind(globalThis));
const audio = await createAudio({ base: 'audio/', speechRate: () => settings.audioRate() });
// Reduced motion app-wide: a stage class stops CSS animation/transitions; screens also skip drift, path drawing,
// confetti, the ghost hand and demos via settings.reducedMotion().
const applyMotion = () => $('stage').classList.toggle('rm', settings.reducedMotion());
applyMotion(); settings.onChange(k => (k === 'reducedMotion' || k === '*') && applyMotion());
globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyMotion);
// Local only (spec §3.9). Dev ?progress=N uses a seeded in-memory log so real progress is never touched.
const storageBacking = cfg.progress != null ? memoryStorage({ 'kitphonic.v1.responses': JSON.stringify(seedProgress(cfg.progress, { due: cfg.due })) }) : window.localStorage;
const storage = previewGate.wrap(sessionLog ? watchStorage(storageBacking, sessionLog) : storageBacking);
const store = createStore(storage);
const seen = createSeen(storage); // ghost-hand demos: first meetings per activity (in-memory in dev ?progress mode)
let sessionId = null;
let afterShow = () => {};
const show = id => { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; afterShow(id); };
// rc7: map high-water marks — every stop passed at any moment gets a marker, so the map never walks back. Boot replays
// the whole saved history once (migration for rc1–rc6 progress), then each response only checks what is new.
let scanned = -Infinity;
function syncProgress() {
  const all = store.all(), add = progressMarkers(all, { since: scanned });
  scanned = Math.max(scanned, ...all.map(r => r.timestamp ?? 0)); if (add.length) store.logMany(add);
  return add;
}
syncProgress();
// After a preview ends, a screen timer still in flight (a blend that finishes, a reveal, a demo count) must not land on
// the real child: until the next session or preview starts, the activity screens' records and demo marks are dropped.
let previewTail = false;
const screenSeen = { count: k => seen.count(k), demo: k => seen.demo(k), mark: k => { if (!previewTail) seen.mark(k); }, reset: () => seen.reset() };
const log = r => {
  if (previewTail) return { timestamp: Date.now(), ...r, dropped: true };
  // Preview: the gate's overlay holds a synthetic child, so the support ladder works and nothing reaches the device.
  if (session?.preview) return store.log({ ...r, sessionId, preview: true });
  // Replay is practice-only: nothing is written, so a miss cannot change mastery, stars, or the current stop.
  if (session?.practice) return { timestamp: Date.now(), sessionId, ...r, scored: false, practice: true, firstAttempt: false };
  const out = store.log({ ...r, sessionId }); syncProgress(); return out;
};
const known = () => (session ? knownGpcs(store.all()) : null); // dev direct mode: no taught-GPC filter on word cards

let session = null; // { plan, i, started, stickers }
// v2 V2: support level per word — forced (?support / ?speakBeforeCheck), else the ladder in a session (dev direct
// screens without a session use S3, the scored default)
const supportLevel = entry => cfg.support ?? (cfg.speakBeforeCheck ? 4 : session && cfg.supportLadder ? supportFor(store.all(), entry, { sessionId }).level : 3);
const guidedWord = entry => cfg.support == null && !cfg.speakBeforeCheck && !!session && cfg.supportLadder && supportFor(store.all(), entry, { sessionId }).guided;
const wordCorrection = entry => (cfg.support == null && !cfg.speakBeforeCheck && session && cfg.supportLadder) ? supportFor(store.all(), entry, { sessionId }) : {};
const screen = createWordScreen({
  known, audio, cfg, rand, stage, record: log, seen: screenSeen, reduced: () => settings.reducedMotion(), support: supportLevel, guided: guidedWord, correction: wordCorrection,
  onDone: stickers => allDone(stickers),
  onHome: () => goHome(),
});
const letters = createLettersScreen({ audio, cfg, rand, stage, settings, seen: screenSeen, record: log, onHome: () => goHome() });
const lesson = createLessonScreen({ audio, stage, settings, seen: screenSeen, rand, record: log, onHome: () => goHome() });
const starScreen = createStarScreen({ audio, stage, seen: screenSeen, reduced: () => settings.reducedMotion(), rand, cfg, record: log, onHome: () => goHome(), known: () => known() });
const familyScreen = createFamilyScreen({ audio, stage, settings, seen: screenSeen, rand, cfg, record: log, onHome: () => goHome() });
const sentenceScreen = createSentenceScreen({ audio, stage, seen: screenSeen, reduced: () => settings.reducedMotion(), rand, cfg, record: log, onHome: () => goHome(), support: supportLevel });

// Map Home is the Kit intro (the front door). Activity Home buttons call goHome() and land on the map.
const mapScreen = createMapScreen({ audio, stage, settings, seen, getMap: () => mapState(store.all()), getResponses: () => store.all(),
  onGo: () => startSession(), onReplay: stop => startReplay(stop), onHome: () => { audio.stop(); show('hello'); }, onParent: () => openParent() });
function showMap(opts) { show('map'); mapScreen.render(opts); }
const parent = createParentScreen({ settings, audio, tip: cfg.silentTip, getResponses: () => store.all(), getMap: () => mapState(store.all()),
  onPreview: i => startPreview(i),
  onClose: () => showMap(), onReset: () => { store.clear(); seen.reset(); scanned = -Infinity; },
  onSkip: () => { const c = mapState(store.all()).current; if (c) store.log({ skill: `stop:${c.id}`, itemId: c.id, marker: true, parent: true, correct: true, firstAttempt: true, scored: false }); } });
function openParent() { audio.stop(); show('parent'); parent.open(); }
function goHome() { if (session?.preview) return endPreview(); $('review-tag').hidden = true; audio.stop(); letters.stop(); lesson.stop(); familyScreen.stop(); syncProgress(); session = null; showMap(); }
function allDone(stickers = session?.stickers ?? []) {
  if (previewTail) return; // a late screen callback after a preview ended: Grown-ups stays open
  if (session?.practice) return finishReplay();
  $('review-tag').hidden = true; syncProgress(); const before = session?.mapBefore ?? null, after = mapState(store.all());
  session = null;
  if (sessionOutcome(before, after.index) === 'unlocked') { // the stop was passed: this is the only step-complete celebration
    show('levelup'); mapScreen.levelUp(after.stops[after.index - 1], { onBack: () => showMap({ drawFrom: before }) }); return;
  }
  // More practice next. Not a failure, and not "you did it": the child can go again or take a break.
  $('done').dataset.kind = 'practice';
  $('done-bubble').textContent = MASCOT['m-read-again'];
  const cur = after.current; $('done-stop').hidden = !cur; if (cur) $('done-stop').textContent = cur.label;
  $('done-again').hidden = false;
  $('stickers').textContent = stickers.join(' '); show('done'); audio.play('m-read-again');
}
const tapModeFor = activity => letterTapMode(activity, { blendL1Mastered: blendL1Mastered(store.all()), override: cfg.letterTapMode, floatMode: cfg.floatModeSet ? cfg.floatTapMode : settings.get('floatMode') });

// --- Session runner ---
export function startSession() {
  if (cfg.activity) return startActivity(cfg.activity);
  if (cfg.direct) return startDirect();
  sessionId = `s-${Date.now()}`; previewTail = false;
  const plan = planSession(store.all(), { minutes: cfg.minutesSet ? cfg.minutes : settings.get('sessionMinutes'), rand, familyMax: cfg.familyMax, familySecureMax: cfg.familySecureMax });
  session = { plan, i: -1, started: performance.now(), stickers: [], mapBefore: mapState(store.all()).index };
  runNext();
}
function startReplay(stop) {
  if (!stop || stop.status !== 'passed') return;
  sessionId = `p-${Date.now()}`; previewTail = false;
  const plan = planReplay(store.all(), stop, { rand });
  if (!plan.items.length) return showMap();
  session = { plan, i: -1, started: performance.now(), stickers: [], mapBefore: mapState(store.all()).index, practice: true };
  runNext();
}
function finishReplay() {
  if (session?.preview) return endPreview();
  $('review-tag').hidden = true; audio.stop(); letters.stop(); lesson.stop(); familyScreen.stop();
  session = null; showMap();
}
// Grown-ups preview: any stop, locked ones too, played as a synthetic child at that stop. Read-only (js/preview.js).
const preview = createPreview({ gate: previewGate, getResponses: () => store.all(), rand });
let scannedBeforePreview = null;
function startPreview(index) {
  if (previewGate.active) endPreview({ reopen: false });
  audio.stop(); scannedBeforePreview = scanned;
  const plan = preview.start(index, { minutes: settings.get('sessionMinutes') });
  if (!plan?.items.length) { endPreview(); return; }
  sessionId = `v-${Date.now()}`; previewTail = false;
  session = { plan, i: -1, started: performance.now(), stickers: [], mapBefore: null, practice: true, preview: true };
  showPreviewTag(true);
  runNext();
}
// The Preview badge (mockup-preview-badge.html): top-right of #stage under the top bar; the whole pill exits.
let badgeTimer = 0, badgeBand = false, badgeShownAt = 0;
// A board too full for the badge anywhere (a small phone) gets a band under it instead: the screen reflows into the
// smaller board and the badge sits in the band, so it still never covers anything.
const BADGE_BAND = 48;
function badgeFallback(on) {
  const b = $('preview-badge'); if (badgeBand === on) return; badgeBand = on;
  if (on) {
    const bottom = stage.reserveBottom(BADGE_BAND); document.body.append(b);
    Object.assign(b.style, { position: 'fixed', top: 'auto', left: 'auto', bottom: (bottom + Math.max(0, (BADGE_BAND - b.offsetHeight) / 2)) + 'px', right: '1rem' });
    b.dataset.spot = 'band';
  } else {
    stage.reserveBottom(0); $('stage').prepend(b);
    for (const k of ['position', 'top', 'left', 'bottom', 'right']) b.style[k] = ''; delete b.dataset.spot;
  }
}
const placePreviewBadge = () => {
  if (badgeBand) return; // stays in its band for the rest of this preview (no jumping)
  const spot = placeBadge($('preview-badge'), [...document.querySelectorAll('#stage > .screen')].find(x => !x.hidden));
  // nowhere clear: take the band, unless the screen is still building (just shown; its bubble not yet filled)
  if (spot == null && performance.now() - badgeShownAt > 400) badgeFallback(true);
};
function showPreviewTag(on) {
  clearInterval(badgeTimer); badgeShownAt = performance.now(); if (!on) badgeFallback(false);
  $('preview-badge').hidden = !on;
  if (on) { placePreviewBadge(); badgeTimer = setInterval(placePreviewBadge, 250); } // screens change as the lesson runs
}
$('preview-badge').onclick = () => { if (session?.preview || previewGate.active) endPreview(); };
function endPreview({ reopen = true } = {}) {
  showPreviewTag(false); $('review-tag').hidden = true;
  audio.stop(); letters.stop(); lesson.stop(); familyScreen.stop();
  session = null; previewTail = true; preview.end(); settings.reload?.();
  if (scannedBeforePreview != null) scanned = scannedBeforePreview; scannedBeforePreview = null;
  if (reopen) openParent();
}
function runNext() {
  if (!session) return;
  session.i++;
  const it = session.plan.items[session.i], overTime = performance.now() - session.started > 10 * 60e3; // hard 10-min cap
  $('review-tag').hidden = !(it && !overTime && it.why === 'review' && !session.preview); // rc7: spaced / slipped review is labelled, never a step back
  if (!it || overTime) return session?.practice ? finishReplay() : allDone();
  if (it.type === 'letters') {
    show('letters');
    letters.start({ activity: it.activity, pool: it.pool, targets: it.targets, rounds: it.rounds, mode: tapModeFor(it.activity), newSound: it.newSound, assist: it.assist, n: it.n,
      onComplete: r => { if (r?.score) session && session.stickers.push('⭐'); runNext(); } });
  } else if (it.type === 'words') {
    show('word'); screen.start(it.words, it.level, { apply: it.apply, assist: it.assist, stepBackFor: it.stepBackFor, focus: it.focus, onDone: st => { session?.stickers.push(...st); runNext(); } });
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
  previewTail = false;
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
  const lv = cfg.startLevel; sessionId = `s-${Date.now()}`; previewTail = false;
  let list = sessionWords(lv, { rand });
  if (cfg.word) { const e = Object.values(WORDS).flat().find(x => x.w === cfg.word); if (e) list = [e, ...list.filter(x => x.w !== e.w)].slice(0, list.length); }
  show('word'); screen.start(list, lv);
}

// Hello: one big play button; the tap unlocks audio (autoplay policies / iOS) and plays Kit's greeting once.
// rc4: the tap registers instantly (pressed button, Kit waves, bubble text) before any audio work.
// A second tap in the same visit must not enqueue another greeting (it would keep playing over the map).
// Map Home shows this screen again, so every hello show arms one new visit and clears Play's accepted state.
const helloGate = createHelloGate(sessionLog ? { onPhase: (next, from) => sessionLog.phase(from, next) } : undefined);
const helloVisit = createHelloVisit({ gate: helloGate, play: $('play') });
const helloLine = $('hello-bubble').textContent;
const armHello = () => {
  helloVisit.beginVisit();
  $('hello').classList.remove('go');
  $('play').classList.remove('pressed');
  $('hello-bubble').textContent = helloLine;
};
afterShow = id => { if (id === 'hello') armHello(); sessionLog?.screen(id); if (session?.preview) { badgeShownAt = performance.now(); placePreviewBadge(); } };
$('play').addEventListener('pointerdown', () => { $('play').classList.add('pressed'); $('hello').classList.add('go'); $('hello-bubble').textContent = "Hi! I'm Kit. Let's read together!"; });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('play').addEventListener(ev, () => $('play').classList.remove('pressed'));
$('play').onclick = () => {
  $('hello').classList.add('go'); $('hello-bubble').textContent = "Hi! I'm Kit. Let's read together!"; // keyboard activation has no pointerdown
  helloVisit.press({
    unlock: () => audio.unlock({ first: [cfg.hello.greetingClip] }), // still inside this gesture, before the first await
    play: () => audio.play(cfg.hello.greetingClip),
    go: () => { cfg.activity || cfg.direct ? startSession() : showMap(); },
  }).catch(() => {}); // a failed unlock/play re-enables Play; a second tap in this visit does not start another greeting
};
$('speaker').onclick = async () => { // sound check + silent-mode tip
  await audio.unlock(); audio.play('sfx-chime');
  const tip = $('tip'); tip.textContent = cfg.silentTip; tip.hidden = !tip.hidden;
};
$('done-again').onclick = () => { audio.stop(); startSession(); }; // more practice, same stop until it is actually passed
$('done-home').onclick = () => { // take a break. The recorded session-end line matches the caption, then the map.
  if ($('done').dataset.kind === 'break') { audio.stop(); showMap(); return; }
  $('done').dataset.kind = 'break'; $('done-again').hidden = true; $('done-stop').hidden = true;
  $('done-bubble').textContent = MASCOT['m-all-done'];
  audio.stop(); audio.play('m-all-done').then(() => { if ($('done').dataset.kind === 'break') showMap(); });
};

window.kitphonic = { cfg, audio, preview, startPreview, endPreview, previewGate, screen, letters, lesson, starScreen, sentenceScreen, familyScreen, parent, openParent, settings, mapScreen, showMap, startSession, startActivity, store, helloGate, sessionLog, get session() { return session; },
  map: () => mapState(store.all()), skillState: skill => skillState(store.all(), skill) }; // debugging / automated checks
if (cfg.parent) openParent(); // dev: ?parent=1 skips the gate
else if (cfg.levelup) { const m = mapState(store.all()); if (m.index > 0) { show('levelup'); mapScreen.levelUp(m.stops[m.index - 1], { onBack: () => showMap({ drawFrom: m.index - 1 }) }); } else showMap(); } // dev
else if (cfg.practiceEnd) { // dev: the session-end screen, with the same copy the child gets (layout gate)
  const cur = mapState(store.all()).current;
  $('stickers').textContent = '⭐ ⭐ ⭐ ⭐ ⭐ ⭐ ⭐ ⭐';
  if (cfg.practiceEnd === 'break') {
    $('done').dataset.kind = 'break'; $('done-again').hidden = true; $('done-stop').hidden = true;
    $('done-bubble').textContent = MASCOT['m-all-done'];
  } else {
    $('done').dataset.kind = 'practice'; $('done-again').hidden = false;
    $('done-bubble').textContent = MASCOT['m-read-again'];
    $('done-stop').hidden = !cur; if (cur) $('done-stop').textContent = cur.label;
  }
  show('done');
}
else if (!cfg.hello.show) cfg.activity || cfg.direct ? startSession() : showMap();
else show('hello');
// After load, and only for the static site. Local harnesses stay unregistered unless ?sw=1.
const startWorker = () => registerServiceWorker();
if (document.readyState === 'complete') startWorker();
else window.addEventListener('load', startWorker, { once: true });
