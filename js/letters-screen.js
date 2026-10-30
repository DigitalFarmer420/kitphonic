// Phase 1–2 letter activities UI: Floating Letters, Find the Letter, Sound Tap, Sound Hunt (spec §3.3–3.4, mockup 1).
import { ACTIVITIES, letterClip, roundLetters, roundTargets, staticLayout, floatInit, floatStep, hitTest, FLOAT } from './letter-logic.js';
import { caseFor } from './word-logic.js';
import { LETTER_INFO } from './content.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const WAVE = '<svg width="30" height="30"><use href="#wave"/></svg>';

export function createLettersScreen({ audio, cfg, rand, stage, settings, record = () => {}, onHome }) {
  const arena = $('l-arena'), bubble = $('l-bubble');
  let run = null, raf = 0;
  const pulse = n => { n.classList.remove('pulse'); void n.offsetWidth; n.classList.add('pulse'); };
  const say = (text, ...clips) => { bubble.textContent = text; return clips.reduce((p, c) => p.then(() => run && audio.play(c.id ?? c, c)), Promise.resolve()); };
  // Arena per stage mode (item = tile centred on (x,y), sound dot below it: y-68 .. y+152).
  const box = () => { const s = stage.info, m = s.mode;
    const top = m === 'short' ? 130 : m === 'portrait' ? 220 : 170, bottom = m === 'short' ? s.h - 16 : s.h - (m === 'portrait' ? 130 : 120);
    return { left: 20, right: s.w - 20, top, bottom }; };
  const cellW = n => { const s = stage.info, per = s.w < 700 ? 3 : 6; return Math.min(150, Math.floor((s.w - 40) / Math.min(per, n))); };
  const caption = (txt, x, y) => { const c = el('div', 'caption', `“${txt}”`); c.style.left = x + 'px'; c.style.top = y + 'px'; $('letters').append(c); setTimeout(() => c.remove(), 1300); };

  function renderPebbles() {
    const n = run.targets.length; $('l-pebbles').replaceChildren(...Array.from({ length: n }, (_, i) => el('div', 'peb' + (i < run.round ? ' on' : i === run.round ? ' now' : ''))));
  }
  function place(items) {
    arena.replaceChildren(...items.map(it => {
      const n = el('div', 'ltr'); n.dataset.l = it.l;
      const t = el('button', 'tile L', caseFor(it.l === 'I' ? 'I' : it.l, run.case)); t.setAttribute('aria-label', it.l);
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
    const letters = run.def.drift || run.activity === 'soundTap' ? run.pool.slice(0, 6) : roundLetters(target, run.pool, { n: run.n, rand });
    const b = box();
    if (run.def.drift && !settings.reducedMotion()) run.items = floatInit(letters, { box: b, rand });
    else { const pos = staticLayout(letters.length, { w: stage.info.w, top: b.top, cellW: cellW(letters.length), cellH: stage.info.mode === 'short' ? 220 : stage.info.mode === 'portrait' ? 232 : 210 }); run.items = letters.map((l, i) => ({ l, ...pos[i] })); }
    run.target = target; run.firstTry = true; run.promptEnd = 0; place(run.items); renderPebbles();
    prompt();
  }
  function prompt() {
    const t = run.target;
    if (run.activity === 'find') return say(`Can you find ${LETTER_INFO[t].name}?`, 'm-find-letter', `name-${t}`).then(() => (run.promptEnd = performance.now()));
    if (run.activity === 'hunt') return say(`Find the letter that says “${LETTER_INFO[t].sound}”.`, 'm-hunt-sound', `snd-${t}`).then(() => (run.promptEnd = performance.now()));
    if (run.activity === 'float') return say('Tap a letter to hear its name!', 'm-tap-names');
    return say(run.mode === 'nameDot' ? 'Tap a letter to hear its name. Tap a dot to hear its sound!' : 'Tap a letter or a dot to hear its sound!', run.mode === 'nameDot' ? 'm-tap-hint' : 'm-tap-hint-sound');
  }
  function tap(it, target, node) {
    if (!run || run.busy) return;
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
      assisted: false, latencyMs, activity: run.activity });
    run.firstTry = false;
    audio.stop();
    if (right) {
      run.busy = true; node.classList.add('right'); run.score++;
      audio.play('sfx-chime'); say('Yes!', 'm-yes');
      setTimeout(() => { run.busy = false; run.round++; run.round < run.targets.length ? setupRound() : finish(); }, 900);
    } else { // never a fail state: the tapped letter says what it is, then the prompt repeats
      const c = run.activity === 'find' ? `name-${it.l}` : `snd-${it.l}`, what = run.activity === 'find' ? LETTER_INFO[it.l].name : `“${LETTER_INFO[it.l].sound}”`;
      run.busy = true; say(`That's ${what}.`, 'm-thats', c).then(() => { if (!run) return; run.busy = false; prompt(); });
    }
  }
  function loop(t0) {
    let last = t0;
    const step = now => { if (!run || !run.def.drift || settings.reducedMotion()) return; floatStep(run.items, Math.min(50, now - last), box(), now); last = now; move(); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }
  function finish() { const r = run; stop(); r.onComplete?.({ activity: r.activity, score: r.score, rounds: r.targets.length }); }
  function stop() { cancelAnimationFrame(raf); run = null; audio.stop(); }

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
