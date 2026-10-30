// Phase 1–2 letter activities UI: Floating Letters, Find the Letter, Sound Tap, Sound Hunt (spec §3.3–3.4, mockup 1).
import { tileText, ACTIVITIES, letterClip, roundLetters, roundTargets, staticLayout, floatInit, floatStep, hitTest, FLOAT } from './letter-logic.js';
import { caseFor } from './word-logic.js';
import { LETTER_INFO } from './content.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const WAVE = '<svg width="30" height="30"><use href="#wave"/></svg>';

import { createGhostHand } from './ghost-hand.js';
import { noSeen } from './seen.js';
export function createLettersScreen({ audio, cfg, rand, stage, settings, record = () => {}, onHome, seen = noSeen }) {
  const hand = createGhostHand({ host: document.getElementById('letters'), reduced: () => settings.reducedMotion() });
  const arena = $('l-arena'), bubble = $('l-bubble');
  let run = null, raf = 0;
  const pulse = n => { n.classList.remove('pulse'); void n.offsetWidth; n.classList.add('pulse'); };
  const say = (text, ...clips) => { bubble.textContent = text; return clips.reduce((p, c) => p.then(() => run && audio.play(c.id ?? c, c)), Promise.resolve()); };
  // Arena per stage mode (item = tile centred on (x,y), sound dot below it: y-68 .. y+152).
  const box = () => { const s = stage.info, m = s.mode;
    const top = m === 'short' ? 130 : m === 'portrait' ? 220 : 170, bottom = m === 'short' ? s.h - 16 : s.h - (m === 'portrait' ? 130 : 120);
    return { left: 20, right: s.w - 20, top, bottom }; };
  const cellW = n => { const s = stage.info, per = s.w < 700 ? 3 : 6; return Math.min(150, Math.floor((s.w - 40) / Math.min(per, n))); };
  const tileHalf = () => { const m = stage.info.mode, pt = m === 'portrait' && stage.info.w < 600; return m === 'short' || pt ? [55, 62] : [60, 68]; };
  // --- design 1a: big ear (replays the sound only), 3 tiles below it, star tray, ghost hand ---
  const soundClip = g => (audio.byId?.has?.(`snd-${g}-held`) ? `snd-${g}-held` : `snd-${g}`);
  function earPos() { const s = stage.info; return s.mode === 'short' ? { x: Math.round(s.w * 0.22) + 40, y: 240 } : { x: s.w / 2, y: s.mode === 'portrait' ? Math.max(310, s.h * 0.36) : 250 }; }
  function earLayout(letters) {
    const s = stage.info, e = earPos(), n = letters.length;
    if (s.mode === 'short') { const x0 = e.x + 130, cw = Math.min(140, (s.w - x0 - 30) / n); return letters.map((l, i) => ({ l, x: x0 + cw * (i + .5), y: 230 })); }
    const cw = Math.min(150, (s.w - 40) / n), y = e.y + (s.mode === 'portrait' ? 200 : 185);
    return letters.map((l, i) => ({ l, x: s.w / 2 + (i - (n - 1) / 2) * cw, y }));
  }
  function addEar() {
    const e = earPos(), b = el('button', 'ear emoji', '👂'); b.id = 'l-ear'; b.setAttribute('aria-label', 'Hear the sound again');
    b.style.left = e.x + 'px'; b.style.top = e.y + 'px'; b.onpointerdown = ev => { ev.stopPropagation(); audio.stop(); audio.play(`snd-${run.target}`); idleHand(); };
    arena.append(b);
  }
  function tray() { const t = $('l-tray'); t.hidden = false; t.replaceChildren(...run.targets.map((_, i) => el('span', 'emoji' + (i < (run.stars ?? 0) ? '' : ' off'), '⭐'))); }
  let handT = 0;
  const hideHand = () => $('l-hand')?.remove();
  function showHand() { // ghost hand: taps the ear, then hovers the tiles (not the answer). First item + after 5 s idle.
    if (!run || run.busy || !run.def.ear) return; hideHand();
    const h = el('div', 'ghosthand emoji', '👆'); h.id = 'l-hand'; const e = earPos(); h.style.left = e.x + 'px'; h.style.top = e.y + 'px'; $('letters').append(h);
    if (settings.reducedMotion()) { setTimeout(hideHand, 1500); return; }
    run.items.forEach((it, i) => setTimeout(() => { if (h.isConnected) { h.style.left = it.x + 'px'; h.style.top = it.y + 40 + 'px'; } }, 1000 + i * 900));
    setTimeout(hideHand, 1200 + run.items.length * 900);
  }
  function idleHand() { clearTimeout(handT); if (run && run.def.ear && run.round === 0 && !run.handShown && seen.demo('hunt')) { run.handShown = true; showHand(); } handT = setTimeout(showHand, 5000); }
  const caption = (txt, x, y) => { const c = el('div', 'caption', `“${txt}”`); c.style.left = x + 'px'; c.style.top = y + 'px'; $('letters').append(c); setTimeout(() => c.remove(), 1300); };

  function renderPebbles() {
    const n = run.targets.length; $('l-pebbles').replaceChildren(...Array.from({ length: n }, (_, i) => el('div', 'peb' + (i < run.round ? ' on' : i === run.round ? ' now' : ''))));
  }
  function place(items) {
    arena.replaceChildren(...items.map(it => {
      const n = el('div', 'ltr'); n.dataset.l = it.l;
      const tx = it.l === 'I' ? 'I' : tileText(it.l), t = el('button', 'tile L' + (tx.length > 1 ? ' two' : ''), caseFor(tx, run.case)); t.setAttribute('aria-label', tx);
      t.onpointerdown = e => { e.stopPropagation(); tap(it, 'letter', n); };
      n.append(t);
      if (run.dots) { const d = el('button', 'ldot', WAVE); d.setAttribute('aria-label', `${it.l} sound`); d.onpointerdown = e => { e.stopPropagation(); tap(it, 'dot', n); }; n.append(d); }
      it.node = n; return n;
    }));
    move();
  }
  const move = () => { for (const it of run.items) { it.node.style.left = it.x + 'px'; it.node.style.top = it.y + 'px'; } };

  function setupRound() {
    const target = run.targets[run.round];
    const letters = run.def.drift || run.activity === 'soundTap' ? run.pool.slice(0, 6) : roundLetters(target, run.pool, { n: run.def.n ?? run.n, rand });
    const b = box();
    $('letters').classList.toggle('hunt', !!run.def.ear);
    if (run.def.ear) run.items = earLayout(letters);
    else if (run.def.drift && !settings.reducedMotion()) run.items = floatInit(letters, { box: b, rand, half: tileHalf() });
    else { const pos = staticLayout(letters.length, { w: stage.info.w, top: b.top, cellW: cellW(letters.length), cellH: stage.info.mode === 'short' ? 220 : stage.info.mode === 'portrait' ? 232 : 210 }); run.items = letters.map((l, i) => ({ l, ...pos[i] })); }
    run.target = target; run.firstTry = true; run.misses = 0; run.promptEnd = 0; place(run.items); renderPebbles(); if (run.def.ear) { addEar(); tray(); }
    const p = prompt();
    if (!run.def.ear) p?.then(() => run && hand.start(() => { // explore: taps two tiles; find: hovers every tile (never just the answer)
      if (!run || run.busy || !run.items?.length) return null; const its = run.def.scored ? run.items : run.items.slice(0, 2);
      return its.map(it => [it.x, it.y + 40]); }, { now: run.round === 0 && seen.demo(run.activity) }));
  }
  function prompt() {
    const t = run.target;
    if (run.activity === 'find') { // target shown lowercase in the tile font (Uiux r2: no caps, no l/I ambiguity)
      const p = say('', 'm-find-letter', `name-${t}`).then(() => (run.promptEnd = performance.now()));
      bubble.innerHTML = `Can you find <span class="L btile">${caseFor(tileText(t), run.case)}</span>?`; return p; }
    if (run.activity === 'hunt') { // design 1a: "sss… find sss!" — the sound only, never the name
      const p = say('', soundClip(t), 'm-find-sound', `snd-${t}`).then(() => { run && (run.promptEnd = performance.now()); idleHand(); });
      bubble.innerHTML = `Find <b>“${LETTER_INFO[t]?.sound ?? t}”</b>!`; return p; }
    if (run.activity === 'float') return run.mode === 'name' ? say('Tap a letter to hear its name!', 'm-tap-names') : say('Tap a letter to hear its sound!', 'm-tap-sounds');
    return say(run.mode === 'nameDot' ? 'Tap a letter to hear its name. Tap a dot to hear its sound!' : 'Tap a letter or a dot to hear its sound!', run.mode === 'nameDot' ? 'm-tap-hint' : 'm-tap-hint-sound');
  }
  function tap(it, target, node) {
    if (!run || run.busy) return; hand.hide(); hand.poke();
    if (run.def.drift) it.pausedUntil = performance.now() + FLOAT.pauseMs;
    pulse(node.querySelector(target === 'dot' ? '.ldot' : '.tile'));
    if (!run.def.scored) { // exploration
      const c = letterClip(run.mode, target, it.l); audio.stop(); audio.play(c.id, c);
      caption(audio.byId.get(c.id)?.text ?? it.l, it.x, it.y - 110);
      run.taps++; if (run.taps >= run.minTaps) $('l-next').hidden = false;
      return;
    }
    const right = it.l === run.target, latencyMs = run.promptEnd ? Math.round(performance.now() - run.promptEnd) : null;
    if (run.firstTry) record({ skill: `${run.def.scored}:${run.target}`, itemId: run.target, gpcs: [run.target], correct: right, firstAttempt: true,
      assisted: false, latencyMs, activity: run.activity, picked: it.l }); // picked: trouble spots (b/d) in the parent view
    run.firstTry = false;
    audio.stop();
    if (right) {
      run.busy = true; node.classList.add('right'); run.score++; run.stars = (run.stars ?? 0) + 1; hideHand(); if (run.def.ear) tray();
      audio.play('sfx-chime'); say('Yes!', ...(run.def.ear ? [soundClip(run.target), 'm-yes'] : ['m-yes']));
      setTimeout(() => { if (!run) return; run.busy = false; run.round++; run.round < run.targets.length ? setupRound() : finish(); }, run.def.ear ? 1200 : 900);
    } else { // never a fail state: the tapped letter says what it is, then the prompt repeats
      const c = run.activity === 'find' ? `name-${it.l}` : `snd-${it.l}`, what = run.activity === 'find' ? LETTER_INFO[it.l].name : `“${LETTER_INFO[it.l].sound}”`;
      run.misses++; node.classList.remove('wob'); void node.offsetWidth; node.classList.add('wob'); // soft wobble, no red / buzzer
      if (run.misses >= (run.assist ? 1 : 2)) run.items.find(i => i.l === run.target)?.node.classList.add('hint'); // after 2 misses (1 in a step-back round) the right tile glows
      run.busy = true; say(`That's ${what}.`, 'm-thats', c).then(() => { if (!run) return; run.busy = false; prompt(); });
    }
  }
  function loop(t0) {
    let last = t0;
    const step = now => { if (!run || !run.def.drift || settings.reducedMotion()) return; floatStep(run.items, Math.min(50, now - last), box(), now); last = now; move(); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }
  function finish() { const r = run; seen.mark(r.activity); stop(); $('letters').classList.remove('hunt'); $('l-tray').hidden = true; r.onComplete?.({ activity: r.activity, score: r.score, rounds: r.targets.length }); }
  function stop() { cancelAnimationFrame(raf); clearTimeout(handT); hideHand(); hand.stop(); run = null; audio.stop(); }

  $('l-next').onclick = () => run && finish();
  $('l-home').onclick = () => { stop(); onHome(); };
  $('l-again').onclick = () => run && (audio.stop(), prompt());

  return {
    // opts: { activity, pool (letters on offer), targets (scored items), rounds, mode, n, onComplete }
    start(opts) {
      stop();
      const def = ACTIVITIES[opts.activity];
      run = { ...opts, def, round: 0, score: 0, taps: 0, minTaps: opts.minTaps ?? 4, n: opts.n ?? 4, case: cfg.letterCase ?? cfg.tileCase,
        dots: def.dots, mode: opts.mode, targets: def.scored ? roundTargets(opts.targets ?? opts.pool, opts.rounds ?? 4, rand) : [null] };
      $('l-next').hidden = true; $('letters').hidden = false;
      setupRound(); if (def.drift) loop(performance.now());
      if (!def.scored) setTimeout(() => run && run.activity === opts.activity && ($('l-next').hidden = false), 15000);
    },
    stop, get run() { return run; },
  };
}
