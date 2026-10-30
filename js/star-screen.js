// Star words (design/words-board 4, review R6). Two screens:
//  - Star Word: meet a star (tricky) word — the irregular part is marked gold — then find it among printed words.
//    The finds are scored (star:<w>) so star words get mastery + spaced review like everything else.
//  - Sentence: one line of words that wraps like text (tiles only while blending). Star words are gold: tap to hear, no slider. Decodable words use tiles + the
//    slider (one stop per sound; passed sounds turn sage). "Read it all" unlocks at the end: karaoke + picture.
import { STAR_WORDS, WORDS } from './content.js';
import { markers, markerPositions, createSweep, graphemeUnits } from './core.js';
import { wordLayout, layoutFor } from './layout.js';
import { clipForMarker, clipForBlend, shuffle, caseFor } from './word-logic.js';
import { guessGuard } from './mastery.js';
import { createGhostHand, centerIn } from './ghost-hand.js';
import { noSeen } from './seen.js';
import { pictureChoices } from './sentences.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const onePic = pic => (pic?.startsWith('#') ? `<svg width="150" height="110" viewBox="0 0 120 100"><use href="${pic}"/></svg>` : `<span class="emoji">${pic ?? '⭐'}</span>`);
// v2 V7 scenes: 'a+b' = two pictures side by side (the sentence's two content words)
const picHtml = pic => (pic?.includes('+') ? `<span class="scene">${pic.split('+').map(onePic).join('')}</span>` : onePic(pic));
export const STAR_ROUNDS = 3;
// Distractors for "find <star>": other star words + decodable words of similar length, all different in print.
// Distractors are decodable words made only of taught letters (untaught-sound rule), so the only "new" print is the star.
export function starChoices(w, { n = 3, rand = Math.random, known = null } = {}) {
  const all = [...new Set(Object.values(WORDS).flat().map(e => e.w))].filter(x => x !== w && Math.abs(x.length - w.length) <= 1);
  const ok = known ? all.filter(x => [...x].every(ch => known.has(ch))) : all;
  const cands = ok.length >= n - 1 ? ok : all;
  return shuffle([w, ...shuffle(cands, rand).slice(0, n - 1)], rand);
}
export const starHtml = s => s.parse.map(p => typeof p === 'string' ? p : `<span class="irr">${p.g}</span>`).join('');

export function createStarScreen({ audio, stage, rand = Math.random, record = () => {}, onHome, cfg = {}, known = () => null, seen = noSeen, reduced = () => false }) {
  let run = null;
  const hand = createGhostHand({ host: $('star'), reduced }); // hovers over ALL cards in turn — never just the answer
  const say = (t, ...clips) => { $('st-bubble').innerHTML = t; return clips.reduce((p, c) => p.then(() => run && audio.play(c)), Promise.resolve()); };
  function round() {
    const s = run.star, choices = starChoices(s.w, { rand, known: known() });
    $('st-word').classList.add('away'); // find it by its sound, not by matching the shape on screen
    run.first = true; run.shownAt = 0;
    $('st-pebbles').replaceChildren(...Array.from({ length: STAR_ROUNDS }, (_, i) => el('div', 'peb' + (i < run.round ? ' on' : i === run.round ? ' now' : ''))));
    $('st-cards').replaceChildren(...choices.map(c => { const b = el('button', 'wcard2 L', c === 'I' ? 'I' : caseFor(c, cfg.tileCase)); b.dataset.w = c; b.setAttribute('aria-label', c); b.onclick = () => pick(c, b); return b; }));
    say(`Find <b>${s.w}</b>!`, 'm-find-word', `star-${s.w}`).then(() => { if (!run) return; run.shownAt = performance.now();
      hand.start(() => run && !run.busy ? [...$('st-cards').children].map(c => { const [x, y] = centerIn(c, $('star'), stage?.scale ?? 1); return [x, y + 30]; }) : null, { now: run.round === 0 && seen.demo('star') }); });
  }
  function pick(c, b) {
    if (!run || run.busy) return; audio.stop(); hand.hide(); hand.poke();
    const right = c === run.star.w, lat = run.shownAt ? performance.now() - run.shownAt : null;
    if (run.first) record({ skill: `star:${run.star.w}`, itemId: run.star.w, correct: right, firstAttempt: true, assisted: false, latencyMs: lat && Math.round(lat), fast: guessGuard({ pickLatencyMs: lat ?? 9999 }).fast });
    run.first = false;
    if (!right) { b.classList.remove('wob'); void b.offsetWidth; b.classList.add('wob'); audio.play(`word-${c}`).then(() => run && audio.play(`star-${run.star.w}`)); return; }
    run.busy = true; b.classList.add('right'); audio.play('sfx-chime'); $('st-word').classList.remove('away');
    setTimeout(() => { if (!run) return; run.busy = false; run.round++; run.round < STAR_ROUNDS ? round() : finish(); }, 1100);
  }
  function finish() { const r = run; run = null; hand.stop(); seen.mark('star'); audio.stop(); r?.onComplete?.({}); }
  $('st-home').onclick = () => { run = null; hand.stop(); audio.stop(); onHome(); };
  $('st-again').onclick = () => run && (audio.stop(), audio.play(`star-${run.star.w}`));
  return {
    start({ word, onComplete }) {
      const s = STAR_WORDS.find(x => x.w === word); run = { star: s, round: 0, onComplete }; $('star').hidden = false;
      const big = $('st-word'); big.classList.remove('away'); big.innerHTML = starHtml(s); big.setAttribute('aria-label', `star word ${s.w}`);
      big.onclick = () => { audio.stop(); audio.play(`star-${s.w}`); big.classList.remove('sparkle-on'); void big.offsetWidth; big.classList.add('sparkle-on'); };
      $('st-cards').replaceChildren(); run.busy = true;
      say(`This is a star word: <b>${s.w}</b>. We just know it!`, 'm-star-word', `star-${s.w}`, `star-${s.w}-sentence`).then(() => { if (run) { run.busy = false; round(); } });
    },
    get run() { return run; },
  };
}

// v2 V2: each decodable token is served at its pattern's support level (support(entry): 4 model, 3 blend, 2 silent
// dots, 1 read it = no slider). Any S4 token makes the read modelled (Kit said a word), so the pick is not scored.
export function createSentenceScreen({ audio, stage, rand = Math.random, record = () => {}, onHome, cfg = {}, seen = noSeen, reduced = () => false, support = () => (cfg.speakBeforeCheck ? 4 : 3) }) {
  let run = null, dragging = null;
  const hand = createGhostHand({ host: $('sentence'), reduced });
  const handPath = () => { if (!run || run.reading || dragging) return null; const at = n => centerIn(n, $('sentence'), stage.scale), t = run.tokens[run.i];
    if (!t) return $('sn-read').disabled ? null : [at($('sn-read')), at($('sn-read'))];
    if (t.kind === 'star') { const c = at(chips()[run.i]); return [c, [c[0], c[1] + 10]]; }
    if (!$('sn-next').hidden) { const c = at($('sn-next')); return [c, [c[0], c[1] + 10]]; }
    if (!run.ms) return null; const [x, y] = at($('sn-handle')); return [[x, y + 20], [run.layout.knobX(0.5), y + 20], [run.layout.knobX(1), y + 20]]; };
  const say = (t, ...clips) => { $('sn-bubble').innerHTML = t; return clips.reduce((p, c) => p.then(() => run && audio.play(c)), Promise.resolve()); };
  const chips = () => [...$('sn-strip').children];
  function paint() { chips().forEach((c, i) => { c.classList.toggle('cur', i === run.i); c.classList.toggle('done', i < run.i); }); }
  // Landscape keeps the sentence on one centred line: shrink the type (not the 72 px tap height) until it fits.
  function fitLine() {
    const st = $('sn-strip'); chips().forEach(c => (c.style.fontSize = '')); if (stage.info.mode === 'portrait') return;
    for (let fs = 44; fs >= 26 && st.scrollWidth > st.clientWidth + 1; fs -= 2) chips().forEach(c => (c.style.fontSize = fs + 'px'));
  }
  const blending = on => $('sentence').classList.toggle('blending', on);
  function next() {
    paint(); const t = run.tokens[run.i]; hand.hide(); hand.poke(); $('sn-next').hidden = true; $('sentence').classList.remove('tapon');
    if (!t) return allRead();
    if (t.kind === 'star') { // gold, tap to hear, no slider
      blending(false); $('sn-tiles').innerHTML = `<div class="stari">⭐ tap the star word</div>`; $('sn-slider').hidden = true; run.ms = null;
      say('Star word! Tap it.', 'm-star-tap');
    } else {
      const lv = run.tokSupport = Math.max(1, Math.min(4, support(t.entry) ?? 3)); run.levels.push(lv); if (lv === 4) run.modelled = true;
      // S1: no slider; the child reads the word in their head and taps on (never a timer: known issue 7)
      if (lv === 1) { blending(false); $('sn-tiles').replaceChildren(); $('sn-slider').hidden = true; run.ms = null; $('sn-next').hidden = false; $('sentence').classList.add('tapon'); say('Read it, then tap the arrow!', 'm-read-tap-on'); }
      else blendWord(t);
    }
  }
  function blendWord(t) {
    $('sn-bubble').innerHTML = run.tokSupport === 2 ? 'Say the sounds!' : 'Slide to read it!'; blending(true);
    const w = t.entry.w, ids = t.entry.parse?.split(' '); run.ms = markers(w, 3, { ids }); run.layout = wordLayout(w.length, layoutFor(stage.info)); run.sweep = createSweep(run.ms, { gapMs: cfg.sweepGapMs ?? 180 }); run.t0 = null;
    const L = run.layout, tiles = $('sn-tiles'); tiles.replaceChildren();
    graphemeUnits(w, ids).forEach(u => { const d = el('div', 'tile L' + (u.b - u.a > 1 ? ' dg' : ''), caseFor(u.text, cfg.tileCase)); d.style.left = L.tileLeft(u.a) + 'px'; d.style.width = (u.b - u.a) * L.cell - L.gap + 'px'; d.style.fontSize = Math.round(Math.min(84, L.tileW * .78)) + 'px'; tiles.append(d); });
    const tr = $('sn-track'), l = Math.max(8, L.track.left - 20), r = Math.min(L.stageW - 34, L.track.left + L.track.width + 20);
    tr.style.left = l + 'px'; tr.style.width = r - l + 'px'; run.trackLeft = l;
    tr.querySelectorAll('.tdot').forEach(d => d.remove());
    markerPositions(run.ms).forEach(f => { const d = el('div', 'tdot'); d.style.left = (L.xFromFrac(f) - l) + 'px'; tr.append(d); }); // one stop per sound
    $('sn-slider').hidden = false; setKnob(0);
  }
  const setKnob = f => { const x = run.layout.knobX(f); $('sn-handle').style.left = x + 'px'; $('sn-fill').style.width = Math.max(0, x - run.trackLeft) + 'px'; };
  function onMove(e) {
    if (!dragging || !run?.ms) return;
    const p = stage.toStage(e); run.t0 ??= performance.now();
    for (const ev of run.sweep.move(run.layout.fracFromX(p.x), e.timeStamp)) {
      if (ev.kind === 'play' || ev.kind === 'replay') {
        const c = clipForMarker(run.ms[ev.marker], ev.stretch); if (ev.kind === 'replay') audio.stop(); if (run.tokSupport !== 2) audio.play(c.id, { rate: c.rate, delayMs: ev.delayMs }); // S2: silent dots
        [...$('sn-tiles').children][ev.marker]?.classList.add('passed'); $('sn-track').querySelectorAll('.tdot')[ev.marker]?.classList.add('on');
      } else if (ev.kind === 'blend') {
        dragging = null; const t = run.tokens[run.i], ok = guessGuard({ sweepMs: performance.now() - run.t0, phonemes: run.ms.length }).scored;
        // v2 V1: the whole word is NOT spoken before the scored picture pick (the child blends it); ?speakBeforeCheck=1 = old model
        run.ms = null; const after = () => { if (!run) return; if (!ok) audio.play('m-slide-slowly'); run.i++; next(); };
        if (cfg.speakBeforeCheck || run.tokSupport === 4) audio.play(clipForBlend(t.entry.w).id, { delayMs: (ev.delayMs || 0) + 300 }).then(after); else setTimeout(after, 500);
      }
    }
    if (run.ms) setKnob(run.sweep.position);
  }
  function allRead() { // every word swept: scored mode goes straight to the question; model mode unlocks "read it all"
    blending(false); $('sn-tiles').replaceChildren(); $('sn-slider').hidden = true;
    if (!cfg.speakBeforeCheck) return afterRead();
    const b = $('sn-read'); b.disabled = false; say('Now read it all!', 'm-read-all');
  }
  async function karaoke(tokens = run.tokens) { // Kit reads the line, lighting each word (model / reward)
    for (const [i, t] of tokens.entries()) { if (!run) return; const c = chips()[i]; c?.classList.add('lit'); await audio.play(t.clip); c?.classList.remove('lit'); c?.classList.add('done'); }
  }
  async function readAll() {
    const b = $('sn-read'); if (b.disabled || !run || run.reading) return; run.reading = true; b.disabled = true; run.modelled = true;
    await karaoke(); if (run) { run.reading = false; afterRead(); }
  }
  async function afterRead() {
    if (run.story && run.page < run.story.pages.length - 1) { // story: reveal this page's picture, then turn the page
      run.reading = true; $('sn-card').className = 'revealed'; $('sn-card').innerHTML = picHtml(run.sent.pic); audio.play('sfx-chime');
      if (cfg.speakBeforeCheck) await audio.play(`sent-${run.sent.id}`); else await new Promise(r => setTimeout(r, 1200)); if (!run) return;
      setTimeout(() => { if (!run) return; run.page++; loadSentence(run.story.pages[run.page]); say('Next page!').then(() => { if (run) { next(); } }); }, 700);
      return;
    }
    askPicture(); // story: the last page's picture stays hidden (it would give the answer away)
  }
  // Scored read: which picture shows it? First pick is the scored response; a miss rereads the sentence, then retry.
  function askPicture() {
    const st = run.story, pics = st ? shuffle([st.ask.answer, ...st.ask.others], rand) : pictureChoices(run.sent, rand); run.tries = 0; $('sentence').classList.add('choosing');
    $('sn-choices').replaceChildren(...pics.map(pic => { const b = el('button', 'pc', picHtml(pic)); b.dataset.pic = pic; b.onclick = () => pick(b, pic); return b; }));
    $('sn-choices').hidden = false; run.askAt = performance.now(); if (st) say(st.ask.text, `story-${st.id}-ask`); else say('Which picture shows it?', 'm-which-shows');
    hand.start(() => run && !run.reading ? [...$('sn-choices').children].filter(b => !b.disabled).map(b => centerIn(b, $('sentence'), stage.scale)) : null, { now: false });
  }
  async function pick(b, pic) {
    if (!run || run.reading || b.disabled) return; hand.hide(); hand.poke(); audio.stop();
    const st = run.story, correct = pic === (st ? st.ask.answer : run.sent.pic), first = run.tries++ === 0;
    record({ ...(run.reread ? { reread: true } : {}), skill: st ? `${run.reread ? 'reread' : 'story'}:${st.id}` : `sentence:L${run.sent.level}`, itemId: st ? st.id : run.sent.id, gpcs: [...new Set(run.tokens.filter(t => t.kind === 'word').flatMap(t => t.entry.parse?.split(' ') ?? [...t.entry.w]))],
      correct, firstAttempt: first, scored: first && !run.modelled, ...(run.modelled ? { modelled: true } : {}), // v2 V1: read aloud first = modelled, not scored
      support: run.levels.length ? Math.max(...run.levels) : null, tokenSupport: run.levels, hints: run.hints, latencyFromOnsetMs: run.askAt ? Math.round(performance.now() - run.askAt) : null });
    if (!correct) { b.disabled = true; b.classList.add('no'); run.reading = true; await say("Let's read it again.", 'm-read-again');
      if (st) { for (const p of st.pages) { if (!run) return; await audio.play(`sent-${p.id}`); } } else await audio.play(`sent-${run.sent.id}`);
      if (run) { run.reading = false; say(st ? st.ask.text : 'Which picture shows it?'); } return; }
    run.reading = true; b.classList.add('yes'); $('sn-choices').hidden = true; $('sentence').classList.remove('choosing'); hand.stop();
    $('sn-card').className = 'revealed'; $('sn-card').innerHTML = picHtml(st ? st.ask.answer : run.sent.pic); audio.play('sfx-chime'); say(st ? 'Yes! The end.' : 'Yes!');
    // after the pick, Kit reads it aloud as the reward / model (never before a scored pick)
    if (!st) { if (run.modelled) await audio.play(`sent-${run.sent.id}`); else { await new Promise(r => setTimeout(r, 500)); await karaoke(); } }
    else { for (const p of st.pages) { if (!run) return; await audio.play(`sent-${p.id}`); } }
    setTimeout(() => { const r = run; run = null; hand.stop(); seen.mark('sentence'); r?.onComplete?.({ correct: first }); }, 900);
  }
  function loadSentence(sentence) { // one sentence (or story page) on screen, nothing read yet
    run.sent = sentence; run.tokens = sentence.tokens; run.i = 0; run.ms = null; run.reading = false;
    $('sn-card').className = ''; $('sn-card').innerHTML = '<span class="q">?</span>'; $('sn-read').disabled = true;
    $('sn-pebbles').replaceChildren(...(run.story ? run.story.pages.map((_, i) => el('div', 'peb' + (i < run.page ? ' on' : i === run.page ? ' now' : ''))) : []));
    $('sn-choices').hidden = true; $('sn-choices').replaceChildren(); $('sentence').classList.remove('choosing');
      $('sn-strip').replaceChildren(...sentence.tokens.map((t, i) => {
        const c = el('button', 'wd L' + (t.kind === 'star' ? ' star' : ''), (t.kind === 'star' ? t.w : caseFor(t.w, cfg.tileCase)) + (t.punct ? `<span class="p">${t.punct}</span>` : ''));
        c.setAttribute('aria-label', t.w);
        c.onclick = () => { if (!run) return; audio.stop(); audio.play(t.clip); if (t.kind === 'word' && !run.reading) run.hints++; // hearing a decodable word = a hint
          if (i === run.i && t.kind === 'star') { c.classList.add('done'); run.i++; setTimeout(next, 700); } };
        return c;
      }));
    blending(false); fitLine();
  }
  $('sn-handle').addEventListener('pointerdown', e => { hand.hide(); hand.poke(); if (run?.ms) { dragging = { id: e.pointerId }; $('sn-handle').setPointerCapture?.(e.pointerId); e.preventDefault(); } });
  addEventListener('pointermove', onMove); addEventListener('pointerup', () => { dragging = null; run?.sweep?.lift?.(); });
  // rc4 (Uiux): locked words stay inert (pointer-events none), but a tap on one makes the current word bounce + a soft
  // tap, pointing the child back. Reduced motion: a still glow instead of the bounce.
  let nudgedAt = 0;
  $('sn-strip').addEventListener('click', e => {
    if (!run || run.reading || e.target.closest?.('.wd.cur')) return;
    const cur = $('sn-strip').querySelector('.wd.cur'); if (!cur) return;
    const hit = chips().some(c => c !== cur && !c.classList.contains('done') && (r => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)(c.getBoundingClientRect()));
    if (!hit || performance.now() - nudgedAt < 450) return;
    nudgedAt = performance.now(); run.nudges = (run.nudges ?? 0) + 1;
    cur.classList.remove('nudge', 'nudge-still'); void cur.offsetWidth; cur.classList.add(reduced() ? 'nudge-still' : 'nudge');
    setTimeout(() => cur.classList.remove('nudge', 'nudge-still'), 500); audio.play('sfx-tap');
  });
  $('sn-read').onclick = readAll;
  $('sn-next').onclick = () => { if (!run || $('sn-next').hidden || run.reading) return; hand.poke(); audio.stop(); $('sn-next').hidden = true; run.i++; next(); };
  $('sn-home').onclick = () => { run = null; hand.stop(); audio.stop(); onHome(); };
  $('sn-again').onclick = () => run && (audio.stop(), audio.play(run.tokens[run.i]?.clip ?? `sent-${run.sent.id}`));
  return {
    // a sentence, or a story ({ story }): its pages are read one by one like sentences (page dots in the top bar)
    start({ sentence, story, reread = false, onComplete }) {
      run = { story, reread: !!(story && reread), page: 0, onComplete, levels: [], hints: 0 }; $('sentence').hidden = false; loadSentence(story ? story.pages[0] : sentence);
      say(run.reread ? "This story again! You know this one." : story ? `A story: <b>${story.title}</b>. Let's read it together!` : "Let's read it together!", run.reread ? 'm-reread' : 'm-read-together').then(() => { if (!run) return; next(); hand.start(handPath, { now: seen.demo('sentence') }); });
    },
    get run() { return run; },
    debugAsk() { if (!run) return; $('sn-next').hidden = true; run.i = run.tokens.length; paint(); blending(false); $('sn-tiles').replaceChildren(); $('sn-slider').hidden = true; askPicture(); }, // tests/check-sizes only
    relayout() { if (!run) return; fitLine(); if (run.ms) blendWord(run.tokens[run.i]); },
  };
}
