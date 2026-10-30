// Kitphonic boot: hello/audio-unlock screen -> word session -> all done.
import { configFromUrl } from './config.js';
import { createStage } from './stage.js';
import { createAudio } from './audio.js';
import { createWordScreen } from './word-screen.js';
import { sessionWords, rng } from './word-logic.js';
import { WORDS } from './content.js';
import { createStore, skillState, blendL1Mastered } from './mastery.js';
import { createSettings } from './settings.js';
import { createLettersScreen } from './letters-screen.js';
import { letterTapMode } from './letter-logic.js';
import { LETTERS } from './core.js';

const cfg = configFromUrl(location.search);
const $ = id => document.getElementById(id);
const stage = createStage($('stage'), () => window.kitphonic?.screen?.relayout?.());

const rand = rng(cfg.seed ?? Date.now());
const audio = await createAudio({ base: 'audio/' });
const store = createStore(window.localStorage); // local only (spec §3.9)
let sessionId = null;
const settings = createSettings(window.localStorage);
const show = id => { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; };

const screen = createWordScreen({
  audio, cfg, rand, stage,
  record: r => store.log({ ...r, sessionId }),
  onDone: stickers => { $('stickers').textContent = stickers.join(' '); show('done'); audio.play('m-all-done'); },
  onHome: () => show('hello'),
});
const letters = createLettersScreen({ audio, cfg, rand, stage, settings, record: r => store.log({ ...r, sessionId }), onHome: () => show('hello') });
function startActivity(activity) { // dev/testing entry: ?activity=float|find|soundTap|hunt
  sessionId ??= `s-${Date.now()}`; show('letters');
  letters.start({ activity, pool: LETTERS.slice(0, 6), rounds: 4, mode: letterTapMode(activity, { blendL1Mastered: blendL1Mastered(store.all()), override: cfg.letterTapMode }),
    onComplete: () => { show('done'); audio.play('m-all-done'); } });
}
function startSession() {
  if (cfg.activity) return startActivity(cfg.activity);
  const lv = cfg.startLevel; sessionId = `s-${Date.now()}`;
  let list = sessionWords(lv, { rand });
  if (cfg.word) { const e = Object.values(WORDS).flat().find(x => x.w === cfg.word); if (e) list = [e, ...list.filter(x => x.w !== e.w)].slice(0, list.length); }
  show('word'); screen.start(list, lv);
}

// Hello: one big play button; the tap unlocks audio (autoplay policies / iOS) and plays Kit's greeting.
$('play').onclick = async () => {
  await audio.unlock();
  $('hello-bubble').textContent = "Hi! I'm Kit. Let's read together!";
  await audio.play(cfg.hello.greetingClip);
  startSession();
};
$('speaker').onclick = async () => { // sound check + silent-mode tip
  await audio.unlock(); audio.play('sfx-chime');
  const tip = $('tip'); tip.textContent = cfg.silentTip; tip.hidden = !tip.hidden;
};
$('done-home').onclick = () => show('hello');

window.kitphonic = { cfg, audio, screen, letters, settings, startSession, startActivity, store, skillState: skill => skillState(store.all(), skill) }; // debugging / automated checks
if (!cfg.hello.show) { show('word'); startSession(); } else show('hello');
