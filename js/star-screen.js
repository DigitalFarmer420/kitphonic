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
import { pictureChoices, allSentences } from './sentences.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const picHtml = pic => (pic?.startsWith('#') ? `<svg width="150" height="110"><use href="${pic}"/></svg>` : `<span class="emoji">${pic ?? '⭐'}</span>`);
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

export function createSentenceScreen({ audio, stage, rand = Math.random, record = () => {}, onHome, cfg = {}, seen = noSeen, reduced = () => false }) {
  let run = null, dragging = null;
  const hand = createGhostHand({ host: $('sentence'), reduced });
  const handPath = () => { if (!run || run.reading || dragging) return null; const at = n => centerIn(n, $('sentence'), stage.scale), t = run.tokens[run.i];
    if (!t) return $('sn-read').disabled ? null : [at($('sn-read')), at($('sn-read'))];
    if (t.kind === 'star') { const c = at(chips()[run.i]); return [c, [c[0], c[1] + 10]]; }
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
    paint(); const t = run.tokens[run.i]; hand.hide(); hand.poke();
    if (!t) return allRead();
    if (t.kind === 'star') { // gold, tap to hear, no slider
      blending(false); $('sn-tiles').innerHTML = `<div class="stari">⭐ tap the star word</div>`; $('sn-slider').hidden = true; run.ms = null;
      say('Star word! Tap it.', 'm-star-tap');
    } else blendWord(t);
  }
  function blendWord(t) {
    $('sn-bubble').innerHTML = 'Slide to read it!'; blending(true);
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
        const c = clipForMarker(run.ms[ev.marker], ev.stretch); if (ev.kind === 'replay') audio.stop(); audio.play(c.id, { rate: c.rate, delayMs: ev.delayMs });
        [...$('sn-tiles').children][ev.marker]?.classList.add('passed'); $('sn-track').querySelectorAll('.tdot')[ev.marker]?.classList.add('on');
      } else if (ev.kind === 'blend') {
        dragging = null; const t = run.tokens[run.i], ok = guessGuard({ sweepMs: performance.now() - run.t0, phonemes: run.ms.length }).scored;
        run.ms = null; audio.play(clipForBlend(t.entry.w).id, { delayMs: (ev.delayMs || 0) + 300 }).then(() => {
          if (!run) return; if (!ok) audio.play('m-slide-slowly'); run.i++; next(); });
      }
    }
    if (run.ms) setKnob(run.sweep.position);
  }
  function allRead() { // "read it all" unlocks
    blending(false); $('sn-tiles').replaceChildren(); $('sn-slider').hidden = true; const b = $('sn-read'); b.disabled = false;
    say('Now read it all!', 'm-read-all');
  }
  async function readAll() {
    const b = $('sn-read'); if (b.disabled || !run || run.reading) return; run.reading = true; b.disabled = true;
    for (const [i, t] of run.tokens.entries()) { if (!run) return; const c = chips()[i]; c.classList.add('lit'); await audio.play(t.clip); c.classList.remove('lit'); c.classList.add('done'); }
    run.reading = false; askPicture();
  }
  // Scored read: which picture shows it? First pick is the scored response; a miss rereads the sentence, then retry.
  function askPicture() {
    const pics = pictureChoices(run.sent, allSentences(), rand); run.tries = 0; $('sentence').classList.add('choosing');
    $('sn-choices').replaceChildren(...pics.map(pic => { const b = el('button', 'pc', picHtml(pic)); b.dataset.pic = pic; b.onclick = () => pick(b, pic); return b; }));
    $('sn-choices').hidden = false; say('Which picture shows it?', 'm-which-shows');
    hand.start(() => run && !run.reading ? [...$('sn-choices').children].filter(b => !b.disabled).map(b => centerIn(b, $('sentence'), stage.scale)) : null, { now: false });
  }
  async function pick(b, pic) {
    if (!run || run.reading || b.disabled) return; hand.hide(); hand.poke(); audio.stop();
    const correct = pic === run.sent.pic, first = run.tries++ === 0;
    record({ skill: `sentence:L${run.sent.level}`, itemId: run.sent.id, gpcs: [...new Set(run.tokens.filter(t => t.kind === 'word').flatMap(t => t.entry.parse?.split(' ') ?? [...t.entry.w]))],
      correct, firstAttempt: first, scored: first });
    if (!correct) { b.disabled = true; b.classList.add('no'); run.reading = true; await say("Let's read it again.", 'm-read-again'); await audio.play(`sent-${run.sent.id}`); if (run) { run.reading = false; say('Which picture shows it?'); } return; }
    run.reading = true; b.classList.add('yes'); $('sn-choices').hidden = true; $('sentence').classList.remove('choosing'); hand.stop();
    $('sn-card').className = 'revealed'; $('sn-card').innerHTML = picHtml(run.sent.pic); audio.play('sfx-chime'); say('Yes!');
    await audio.play(`sent-${run.sent.id}`);
    setTimeout(() => { const r = run; run = null; hand.stop(); seen.mark('sentence'); r?.onComplete?.({ correct: first }); }, 900);
  }
  $('sn-handle').addEventListener('pointerdown', e => { hand.hide(); hand.poke(); if (run?.ms) { dragging = { id: e.pointerId }; $('sn-handle').setPointerCapture?.(e.pointerId); e.preventDefault(); } });
  addEventListener('pointermove', onMove); addEventListener('pointerup', () => { dragging = null; run?.sweep?.lift?.(); });
  $('sn-read').onclick = readAll;
  $('sn-home').onclick = () => { run = null; hand.stop(); audio.stop(); onHome(); };
  $('sn-again').onclick = () => run && (audio.stop(), audio.play(run.tokens[run.i]?.clip ?? `sent-${run.sent.id}`));
  return {
    start({ sentence, onComplete }) {
      run = { sent: sentence, tokens: sentence.tokens, i: 0, onComplete }; $('sentence').hidden = false;
      $('sn-card').className = ''; $('sn-card').innerHTML = '<span class="q">?</span>'; $('sn-read').disabled = true;
      $('sn-pebbles').replaceChildren(); $('sn-choices').hidden = true; $('sn-choices').replaceChildren(); $('sentence').classList.remove('choosing');
      $('sn-strip').replaceChildren(...sentence.tokens.map((t, i) => {
        const c = el('button', 'wd L' + (t.kind === 'star' ? ' star' : ''), (t.kind === 'star' ? t.w : caseFor(t.w, cfg.tileCase)) + (t.punct ? `<span class="p">${t.punct}</span>` : ''));
        c.setAttribute('aria-label', t.w);
        c.onclick = () => { if (!run) return; audio.stop(); audio.play(t.clip); if (i === run.i && t.kind === 'star') { c.classList.add('done'); run.i++; setTimeout(next, 700); } };
        return c;
      }));
      blending(false); fitLine();
      say("Let's read it together!", 'm-read-together').then(() => { if (!run) return; next(); hand.start(handPath, { now: seen.demo('sentence') }); });
    },
    get run() { return run; },
    debugAsk() { if (!run) return; run.i = run.tokens.length; paint(); blending(false); $('sn-tiles').replaceChildren(); $('sn-slider').hidden = true; askPicture(); }, // tests/check-sizes only
    relayout() { if (!run) return; fitLine(); if (run.ms) blendWord(run.tokens[run.i]); },
  };
}
