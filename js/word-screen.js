// Word screen controller (spec §3.5): tiles + markers + Blend Slider -> picture check -> reveal.
import { createSweep, attached } from './core.js';
import { guessGuard } from './mastery.js';
import { wordLayout, layoutFor } from './layout.js';
import { markersFor, clipForMarker, clipForTap, clipForBlend, clipForReveal, slideAgainClip,
  makeChoices, reshuffle, needsCheck, caseFor } from './word-logic.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const picHtml = pic => pic?.startsWith('#') ? `<svg viewBox="0 0 120 100"><use href="${pic}"/></svg>` : `<span class="emoji">${pic ?? '⭐'}</span>`;

export function createWordScreen({ audio, cfg, rand, stage, onDone, onHome, record = () => {} }) {
  // R7 scoring for this word: first pick only, unassisted; guess guards on sweep speed and pick latency.
  let trial = null, sweepStart = null, blendEndAt = 0;
  let checkTrial = 0, entry, level, ms, layout, sweep, choices, state = 'idle', mode, dragging = null, words = [], idx = 0, stickers = [];
  const tiles = $('tiles'), mk = $('markers'), handle = $('handle'), fill = $('fill'), track = $('track');
  const caption = (txt, x, y) => { const c = el('div', 'caption', `“${txt}”`); c.style.left = x + 'px'; c.style.top = y + 'px'; $('word').append(c); setTimeout(() => c.remove(), 1300); };
  const say = (bubbleText, clip) => { $('bubble').textContent = bubbleText; return clip ? audio.play(clip.id, clip) : Promise.resolve(); };
  const pulse = n => { n.classList.remove('pulse'); void n.offsetWidth; n.classList.add('pulse'); };
  const trackBox = () => { const l = Math.max(8, layout.track.left - 20), r = Math.min(layout.stageW - 34, layout.track.left + layout.track.width + 20); return { left: l, width: r - l }; };
  const setHandle = f => { const x = layout.knobX(f); handle.style.left = x + 'px'; fill.style.width = Math.max(0, x - trackBox().left) + 'px'; };

  function renderPebbles() {
    $('pebbles').replaceChildren(...words.map((_, i) => el('div', 'peb' + (i < idx ? ' on' : i === idx ? ' now' : ''))));
  }
  function render() {
    const w = entry.w; ms = markersFor(w, level, cfg.markerOpts); layout = wordLayout(w.length, layoutFor(stage.info));
    tiles.replaceChildren(...[...w].map((ch, i) => {
      const t = el('button', 'tile L', caseFor(ch, cfg.tileCase)); t.style.left = layout.tileLeft(i) + 'px'; t.style.width = layout.tileW + 'px'; t.style.fontSize = Math.round(Math.min(92, layout.tileW * 0.8)) + 'px'; t.dataset.i = i;
      t.setAttribute('aria-label', ch); t.onpointerdown = e => { e.stopPropagation(); tapLetter(i); }; return t;
    }));
    mk.replaceChildren(...ms.map((m, i) => {
      const b = layout.markerBox(m), d = el('button', 'marker', m.type === 'dot' ? '<div class="dot"><svg width="34" height="34"><use href="#wave"/></svg></div>' : '<div class="bar"></div>');
      d.style.left = b.left + 'px'; d.style.width = b.width + 'px'; d.dataset.i = i; d.setAttribute('aria-label', `${m.type} ${m.text}`);
      d.onpointerdown = e => { e.stopPropagation(); tapMarker(i); }; return d;
    }));
    const tb = trackBox(); track.style.left = tb.left + 'px'; track.style.width = tb.width + 'px';
    fill.style.left = '0px';
    $('card').className = ''; $('card').innerHTML = '<span class="q">?</span>';
    $('next').hidden = true; $('check').hidden = true;
    sweep = createSweep(ms, { gapMs: cfg.sweepGapMs }); setHandle(0); light([]);
    trial = { picks: 0, assisted: false, scored: true }; sweepStart = null;
    choices = needsCheck(entry, cfg, level) ? makeChoices(w, { rand, n: cfg.choicesPerCheck, strategy: cfg.choiceStrategy[level], trial: checkTrial++ }) : null;
    state = 'slide'; renderPebbles();
    say('Slide your finger under the word.', { id: 'm-slide-intro' });
  }
  function light(lit, glowIdx) {
    const litLetters = new Set(lit.flatMap(i => range(ms[i].start, ms[i].end)));
    [...tiles.children].forEach((t, i) => t.classList.toggle('lit', litLetters.has(i)));
    [...mk.children].forEach((m, i) => { m.classList.toggle('lit', lit.includes(i)); if (i === glowIdx) pulse(m); });
  }
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

  function tapLetter(i) {
    const ch = entry.w[i], clip = clipForTap(mode, 'letter', ch); audio.stop(); audio.play(clip.id, clip);
    const t = tiles.children[i]; pulse(t); caption(audio.byId.get(clip.id)?.text ?? ch, layout.tileLeft(i) + layout.tileW / 2, tiles.offsetTop - 40);
  }
  function tapMarker(i) {
    const m = ms[i], clip = m.type === 'dot' ? clipForTap(mode, 'dot', m.text) : clipForMarker(m, 'normal');
    audio.stop(); audio.play(clip.id, clip); pulse(mk.children[i]);
    const b = layout.markerBox(m); caption(audio.byId.get(clip.id)?.text ?? m.text, b.left + b.width / 2, tiles.offsetTop - 40);
  }

  // --- Blend Slider (pointer events; drift tolerance via core.attached) ---
  const toStage = e => stage.toStage(e);
  const sliderY = () => $('slider').offsetTop + $('slider').offsetHeight / 2; // handle centre, whatever the orientation
  function onDown(e) {
    if (state !== 'slide') return;
    const p = toStage(e), hx = layout.knobX(sweep.position);
    if (Math.abs(p.x - hx) > 70 || !attached(p.y - sliderY(), 70)) return; // must grab the handle (64pt + padding)
    dragging = { id: e.pointerId }; handle.setPointerCapture?.(e.pointerId); e.preventDefault();
  }
  function onMove(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    const p = toStage(e);
    if (!attached(p.y - sliderY())) { sweep.lift(); return; } // drifted >60pt: pause; come back to continue
    sweepStart ??= performance.now();
    handleEvents(sweep.move(layout.fracFromX(p.x), e.timeStamp));
    setHandle(sweep.position);
  }
  function onUp(e) { if (dragging && e.pointerId === dragging.id) { dragging = null; sweep.lift(); } }
  function handleEvents(evs) {
    for (const ev of evs) {
      if (ev.kind === 'play' || ev.kind === 'replay') {
        const clip = clipForMarker(ms[ev.marker], ev.stretch);
        if (ev.kind === 'replay') audio.stop(); // ev.connect: previous sound is not cut; next joins it (R3)
        audio.play(clip.id, { rate: clip.rate, delayMs: ev.delayMs });
        light(sweep.lit, ev.marker);
      } else if (ev.kind === 'blend') {
        state = 'blending'; dragging = null;
        const sweepMs = performance.now() - (sweepStart ?? performance.now());
        if (trial.picks === 0) Object.assign(trial, { sweepMs, scored: guessGuard({ sweepMs, phonemes: ms.length }).scored });
        if (!guessGuard({ sweepMs, phonemes: ms.length }).scored) audio.play('m-slide-slowly'); // gentle prompt; not scored
        const c = clipForBlend(entry.w);
        audio.play(c.id, { delayMs: (ev.delayMs || 0) + 350 }).then(afterBlend);
        light(ms.map((_, i) => i));
      }
    }
  }
  function afterBlend() {
    if (state !== 'blending') return;
    blendEndAt = performance.now();
    if (choices) showCheck(); else reveal();
  }

  // --- Picture check (§3.5.2) ---
  function showCheck() {
    state = 'check'; $('check').hidden = false;
    $('check-word').textContent = caseFor(entry.w, cfg.tileCase);
    $('check-bubble').innerHTML = `Which picture is <i>${entry.w}</i>?`;
    $('choices').replaceChildren(...choices.map(c => {
      const b = el('button', 'choice', picHtml(c.pic)); b.dataset.w = c.w; b.setAttribute('aria-label', c.w);
      b.onclick = () => pick(c, b); return b;
    }));
    audio.play('m-which-picture').then(() => state === 'check' && audio.play(`word-${entry.w}`));
  }
  function pick(c, btn) {
    if (state !== 'check') return; audio.stop();
    const latencyMs = Math.round(performance.now() - blendEndAt), first = trial.picks++ === 0;
    record({ skill: `blend:L${level}`, itemId: entry.w, gpcs: entry.parse?.split(' ') ?? [...entry.w], correct: c.w === entry.w,
      firstAttempt: first, assisted: !first || trial.assisted, scored: trial.scored, fast: guessGuard({ pickLatencyMs: latencyMs }).fast,
      latencyMs, sweepMs: Math.round(trial.sweepMs ?? 0), contrast: choices.contrast ?? null });
    if (c.w === entry.w) { state = 'picked'; btn.classList.add('right'); audio.play('sfx-chime'); setTimeout(reveal, 650); return; }
    // Wrong: gentle replay, reshuffle, never a fail screen.
    state = 'replay'; $('check').hidden = true; const ct = choices.contrast; choices = reshuffle(choices, rand); choices.contrast = ct;
    say("Let's slide it again.", slideAgainClip(cfg.voice)).then(demoSweep);
  }
  function demoSweep() { // the slider replays itself once, then hands back to the child (later picks = assisted)
    trial.assisted = true; sweepStart = null;
    const demo = createSweep(ms, { gapMs: cfg.sweepGapMs }); handle.classList.add('demo'); setHandle(0);
    const t0 = performance.now(), dur = 1600;
    const step = now => {
      const f = Math.min(1, (now - t0) / dur);
      for (const ev of demo.move(f, now)) if (ev.kind === 'play') { const cl = clipForMarker(ms[ev.marker], ev.stretch); audio.play(cl.id, cl); light(demo.lit, ev.marker); }
      setHandle(f);
      if (f < 1) requestAnimationFrame(step);
      else setTimeout(() => { handle.classList.remove('demo'); sweep.reset(); setHandle(0); light([]); state = 'slide'; say('Your turn! Slide your finger under the word.'); }, 500);
    };
    requestAnimationFrame(step);
  }

  // --- Reveal ---
  function reveal() {
    state = 'revealed'; $('check').hidden = true;
    const card = $('card'); card.className = 'revealed'; card.innerHTML = `<div class="pic">${picHtml(entry.pic)}</div>`;
    card.querySelector('.pic').style.fontSize = '96px'; const svg = card.querySelector('svg'); if (svg) { svg.setAttribute('width', 150); svg.setAttribute('height', 125); }
    for (let k = 0; k < 4; k++) { const s = el('div', 'sparkle', '✦'); s.style.left = (20 + k * 55) + 'px'; s.style.top = (20 + (k % 2) * 80) + 'px'; s.style.animationDelay = k * 90 + 'ms'; card.append(s); }
    stickers.push(entry.pic && !entry.pic.startsWith('#') ? entry.pic : '⭐');
    if (!entry.pic) audio.play('sfx-chime');
    const c = clipForReveal(entry.w);
    say(entry.say, c).then(() => { if (state === 'revealed') $('next').hidden = false; });
    setTimeout(() => { if (state === 'revealed') $('next').hidden = false; }, 2500);
  }
  function next() {
    audio.stop(); idx++;
    if (idx >= words.length) { state = 'done'; onDone(stickers); return; }
    entry = words[idx]; render();
  }

  handle.addEventListener('pointerdown', onDown);
  $('slider').addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  $('next').onclick = next;
  $('home').onclick = () => { audio.stop(); onHome(); };
  $('again').onclick = () => { audio.stop(); state === 'check' ? audio.play('m-which-picture').then(() => audio.play(`word-${entry.w}`)) : audio.play(state === 'revealed' ? `reveal-${entry.w}` : 'm-slide-intro'); };

  return {
    relayout() { if (entry && state === 'slide') render(); },
    start(list, lv) { words = list; level = lv; idx = 0; stickers = []; mode = cfg.tapMode[lv]; entry = words[0]; $('word').hidden = false; render(); },
    get state() { return state; }, get entry() { return entry; }, get choices() { return choices; },
    debugShow(what) { // automated layout checks only (tools/check-sizes.py)
      if (what === 'check') { choices ??= makeChoices(entry.w, { rand, n: cfg.choicesPerCheck, trial: 0 }); state = 'check'; showCheck(); }
      if (what === 'revealed') { reveal(); $('next').hidden = false; } },
  };
}
