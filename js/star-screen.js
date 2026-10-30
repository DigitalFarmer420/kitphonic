// Star words (design/words-board 4, review R6). Two screens:
//  - Star Word: meet a star (tricky) word — the irregular part is marked gold — then find it among printed words.
//    The finds are scored (star:<w>) so star words get mastery + spaced review like everything else.
//  - Sentence: a strip of word chips. Star words are gold: tap to hear, no slider. Decodable words use tiles + the
//    slider (one stop per sound; passed sounds turn sage). "Read it all" unlocks at the end: karaoke + picture.
import { STAR_WORDS, WORDS } from './content.js';
import { markers, createSweep } from './core.js';
import { wordLayout, layoutFor } from './layout.js';
import { clipForMarker, clipForBlend, shuffle, caseFor } from './word-logic.js';
import { guessGuard } from './mastery.js';

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

export function createStarScreen({ audio, rand = Math.random, record = () => {}, onHome, cfg = {}, known = () => null }) {
  let run = null;
  const say = (t, ...clips) => { $('st-bubble').innerHTML = t; return clips.reduce((p, c) => p.then(() => run && audio.play(c)), Promise.resolve()); };
  function round() {
    const s = run.star, choices = starChoices(s.w, { rand, known: known() });
    $('st-word').classList.add('away'); // find it by its sound, not by matching the shape on screen
    run.first = true; run.shownAt = 0;
    $('st-pebbles').replaceChildren(...Array.from({ length: STAR_ROUNDS }, (_, i) => el('div', 'peb' + (i < run.round ? ' on' : i === run.round ? ' now' : ''))));
    $('st-cards').replaceChildren(...choices.map(c => { const b = el('button', 'wcard2 L', c === 'I' ? 'I' : caseFor(c, cfg.tileCase)); b.dataset.w = c; b.setAttribute('aria-label', c); b.onclick = () => pick(c, b); return b; }));
    say(`Find <b>${s.w}</b>!`, 'm-find-word', `star-${s.w}`).then(() => run && (run.shownAt = performance.now()));
  }
  function pick(c, b) {
    if (!run || run.busy) return; audio.stop();
    const right = c === run.star.w, lat = run.shownAt ? performance.now() - run.shownAt : null;
    if (run.first) record({ skill: `star:${run.star.w}`, itemId: run.star.w, correct: right, firstAttempt: true, assisted: false, latencyMs: lat && Math.round(lat), fast: guessGuard({ pickLatencyMs: lat ?? 9999 }).fast });
    run.first = false;
    if (!right) { b.classList.remove('wob'); void b.offsetWidth; b.classList.add('wob'); audio.play(`word-${c}`).then(() => run && audio.play(`star-${run.star.w}`)); return; }
    run.busy = true; b.classList.add('right'); audio.play('sfx-chime'); $('st-word').classList.remove('away');
    setTimeout(() => { if (!run) return; run.busy = false; run.round++; run.round < STAR_ROUNDS ? round() : finish(); }, 1100);
  }
  function finish() { const r = run; run = null; audio.stop(); r?.onComplete?.({}); }
  $('st-home').onclick = () => { run = null; audio.stop(); onHome(); };
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

export function createSentenceScreen({ audio, stage, rand = Math.random, record = () => {}, onHome, cfg = {} }) {
  let run = null, dragging = null;
  const say = (t, ...clips) => { $('sn-bubble').innerHTML = t; return clips.reduce((p, c) => p.then(() => run && audio.play(c)), Promise.resolve()); };
  const chips = () => [...$('sn-strip').children];
  function paint() { chips().forEach((c, i) => { c.classList.toggle('cur', i === run.i); c.classList.toggle('done', i < run.i && run.tokens[i].kind === 'word'); }); }
  function next() {
    paint(); const t = run.tokens[run.i];
    if (!t) return allRead();
    if (t.kind === 'star') { // gold, tap to hear, no slider
      $('sn-tiles').innerHTML = `<div class="stari">⭐ tap the star word</div>`; $('sn-slider').hidden = true; run.ms = null;
      say('Star word! Tap it.', 'm-star-tap');
    } else blendWord(t);
  }
  // Never a lone chip on the last row: narrow the strip until the rows balance (or stop if that adds a row).
  function balanceStrip() {
    const st = $('sn-strip'); st.style.maxWidth = ''; st.style.marginInline = '';
    const rows = () => { const m = new Map(); chips().forEach(c => m.set(c.offsetTop, (m.get(c.offsetTop) ?? 0) + 1)); return [...m.values()]; };
    const even = r => Math.max(...r) - Math.min(...r) <= 1;
    let r = rows(); if (r.length < 2 || even(r)) return;
    const n = r.length; st.style.marginInline = 'auto'; let best = '';
    for (let w = st.offsetWidth - 10; w > 200; w -= 10) { st.style.maxWidth = w + 'px'; r = rows(); if (r.length > n) break; if (even(r)) { best = st.style.maxWidth; break; } }
    st.style.maxWidth = best;
  }
  function blendWord(t) {
    $('sn-bubble').innerHTML = 'Slide to read it!';
    const w = t.entry.w; run.ms = markers(w, 3); run.layout = wordLayout(w.length, layoutFor(stage.info)); run.sweep = createSweep(run.ms, { gapMs: cfg.sweepGapMs ?? 180 }); run.t0 = null;
    const L = run.layout, tiles = $('sn-tiles'); tiles.replaceChildren();
    [...w].forEach((ch, i) => { const d = el('div', 'tile L', caseFor(ch, cfg.tileCase)); d.style.left = L.tileLeft(i) + 'px'; d.style.width = L.tileW + 'px'; d.style.fontSize = Math.round(Math.min(84, L.tileW * .78)) + 'px'; tiles.append(d); });
    const tr = $('sn-track'), l = Math.max(8, L.track.left - 20), r = Math.min(L.stageW - 34, L.track.left + L.track.width + 20);
    tr.style.left = l + 'px'; tr.style.width = r - l + 'px'; run.trackLeft = l;
    tr.querySelectorAll('.tdot').forEach(d => d.remove());
    run.ms.forEach((m, i) => { const d = el('div', 'tdot'); d.style.left = (L.xFromFrac((i + .5) / run.ms.length) - l) + 'px'; tr.append(d); });
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
    $('sn-tiles').replaceChildren(); $('sn-slider').hidden = true; const b = $('sn-read'); b.disabled = false;
    say('Now read it all!', 'm-read-all');
  }
  async function readAll() {
    const b = $('sn-read'); if (b.disabled || !run || run.reading) return; run.reading = true; b.disabled = true;
    for (const [i, t] of run.tokens.entries()) { if (!run) return; const c = chips()[i]; c.classList.add('lit'); await audio.play(t.clip); c.classList.remove('lit'); c.classList.add('done'); }
    $('sn-card').className = 'revealed'; $('sn-card').innerHTML = picHtml(run.sent.pic); audio.play('sfx-chime');
    record({ skill: `sentence:${run.sent.id}`, itemId: run.sent.id, correct: true, firstAttempt: true, scored: false });
    await audio.play(`sent-${run.sent.id}`);
    setTimeout(() => { const r = run; run = null; r?.onComplete?.({}); }, 900);
  }
  $('sn-handle').addEventListener('pointerdown', e => { if (run?.ms) { dragging = { id: e.pointerId }; $('sn-handle').setPointerCapture?.(e.pointerId); e.preventDefault(); } });
  addEventListener('pointermove', onMove); addEventListener('pointerup', () => { dragging = null; run?.sweep?.lift?.(); });
  $('sn-read').onclick = readAll;
  $('sn-home').onclick = () => { run = null; audio.stop(); onHome(); };
  $('sn-again').onclick = () => run && (audio.stop(), audio.play(run.tokens[run.i]?.clip ?? `sent-${run.sent.id}`));
  return {
    start({ sentence, onComplete }) {
      run = { sent: sentence, tokens: sentence.tokens, i: 0, onComplete }; $('sentence').hidden = false;
      $('sn-card').className = ''; $('sn-card').innerHTML = '<span class="q">?</span>'; $('sn-read').disabled = true;
      $('sn-pebbles').replaceChildren();
      $('sn-strip').replaceChildren(...sentence.tokens.map((t, i) => {
        const c = el('button', 'chip L' + (t.kind === 'star' ? ' star' : ''), (t.kind === 'star' ? t.w : caseFor(t.w, cfg.tileCase)) + (t.punct ? `<span>${t.punct}</span>` : ''));
        c.setAttribute('aria-label', t.w);
        c.onclick = () => { if (!run) return; audio.stop(); audio.play(t.clip); if (i === run.i && t.kind === 'star') { c.classList.add('done'); run.i++; setTimeout(next, 700); } };
        return c;
      }));
      balanceStrip();
      say("Let's read it together!", 'm-read-together').then(() => run && next());
    },
    get run() { return run; },
    relayout() { if (!run) return; balanceStrip(); if (run.ms) blendWord(run.tokens[run.i]); },
  };
}
