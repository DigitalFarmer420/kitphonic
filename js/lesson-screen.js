// Letter intro + tracing (design/letters-board 1b, 1c). Exposure / motor activities: they log `intro:` / `trace:`
// responses for the parent view but never gate mastery (sound mastery comes from Sound Hunt).
import { LETTER_PICS } from './content.js';
import { GPC } from './sequence.js';
import { STROKES, createTracer, resample, pathD, letterBox } from './trace.js';
import { shuffle } from './word-logic.js';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.append(e); return e; };
export const TRACE_REPS = 3;
// The picture word with the letter (grapheme) in coral: ' s un'.
export function picWordHtml(word, grapheme) {
  const i = word.indexOf(grapheme); if (i < 0) return word;
  return `${word.slice(0, i)}<b>${word.slice(i, i + grapheme.length)}</b>${word.slice(i + grapheme.length)}`;
}
export const soundClip = (g, audio) => (audio?.byId?.has?.(`snd-${g}-held`) ? `snd-${g}-held` : `snd-${g}`);

export function createLessonScreen({ audio, stage, settings, rand = Math.random, record = () => {}, onHome }) {
  let run = null;
  const reduced = () => settings.reducedMotion?.();
  const say = (text, ...clips) => { $('ls-bubble').innerHTML = text; return clips.reduce((p, c) => p.then(() => run && audio.play(c)), Promise.resolve()); };
  const pebbles = (n, at) => $('ls-pebbles').replaceChildren(...Array.from({ length: n }, (_, i) => { const d = document.createElement('div'); d.className = 'peb' + (i < at ? ' on' : i === at ? ' now' : ''); return d; }));

  // ---- 1b letter intro ----
  function intro(g) {
    const pics = LETTER_PICS[g] ?? [], [word, pic] = shuffle(pics, rand)[0] ?? [null, null], gr = GPC[g]?.grapheme ?? g;
    $('intro').hidden = false; $('trace').hidden = true;
    $('ic-letter').textContent = gr; $('ic-letter').setAttribute('aria-label', `letter ${gr}`);
    const P = $('ic-pic'); P.hidden = !word;
    if (word) { P.innerHTML = `<span class="emoji">${pic}</span><span class="pw">${picWordHtml(word, gr)}</span>`; P.setAttribute('aria-label', word); }
    const snd = soundClip(g, audio);
    const prompt = () => say(`This letter says <b>${gr}</b>. Tap it!`, 'm-letter-says', snd, 'm-tap-it');
    $('ic-letter').onclick = () => { audio.stop(); audio.play(snd); run.taps++; };
    P.onclick = () => { audio.stop(); audio.play(snd).then(() => word && audio.play(`pic-${word}`)); run.taps++; };
    $('ic-replay').onclick = () => { audio.stop(); prompt(); };
    $('ic-next').onclick = () => { record({ skill: `intro:${g}`, itemId: g, correct: true, firstAttempt: true, scored: false, taps: run.taps }); finish(); };
    $('ls-again').onclick = $('ic-replay').onclick;
    pebbles(1, 0); prompt();
  }

  // ---- 1c tracing ----
  function trace(g) {
    const l = GPC[g]?.grapheme ?? g;
    $('intro').hidden = true; $('trace').hidden = false;
    const svg = $('tr-svg'); svg.replaceChildren();
    const bb = letterBox(l); svg.setAttribute('viewBox', `${bb.x} ${bb.y} ${bb.w} ${bb.h}`); svg.parentElement.style.aspectRatio = `${bb.w} / ${bb.h}`;
    let rep = 0, tracer = createTracer(l, { tol: 17 }), inks = [], dragging = false;
    const strokes = tracer.strokes, lanes = strokes.map(P => sv('path', { class: 'lane', d: pathD(P) }, svg));
    strokes.forEach(P => sv('path', { class: 'guide', d: pathD(P) }, svg));
    const marks = sv('g', {}, svg), inkG = sv('g', {}, svg);
    const ghost = sv('circle', { class: 'ghost', r: 7, cx: -50, cy: -50 }, svg);
    const tray = () => $('tr-tray').replaceChildren(...Array.from({ length: TRACE_REPS }, (_, i) => { const s = document.createElement('span'); s.className = 'emoji' + (i < rep ? '' : ' off'); s.textContent = '⭐'; return s; }));
    function drawMarks() { // start dot "1" (green), honey arrows along the stroke, hollow end dot — for the current stroke
      marks.replaceChildren(); const st = tracer.state(); if (st.done) return;
      const P = strokes[st.stroke];
      for (const f of [0.22, 0.5, 0.78]) { const i = Math.floor(f * (P.length - 1)), a = P[i], b = P[Math.min(P.length - 1, i + 2)];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; sv('path', { class: 'arrow', d: 'M -4 -4 L 4 0 L -4 4 Z', transform: `translate(${a[0]} ${a[1]}) rotate(${ang})` }, marks); }
      sv('circle', { class: 'end', cx: P.at(-1)[0], cy: P.at(-1)[1], r: 5 }, marks);
      sv('circle', { class: 'start', cx: P[0][0], cy: P[0][1], r: 8 }, marks);
      sv('text', { class: 'startn', x: P[0][0], y: P[0][1] }, marks).textContent = String(st.stroke + 1);
    }
    function drawInk() {
      const st = tracer.state(); inkG.replaceChildren();
      for (let s = 0; s < Math.min(st.stroke, strokes.length); s++) sv('path', { class: 'ink', d: pathD(strokes[s]) }, inkG);
      if (!st.done && st.k > 0) sv('path', { class: 'ink', d: pathD(strokes[st.stroke].slice(0, st.k + 1)) }, inkG);
    }
    const toLetter = e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; };
    function demo() { // ghost dot shows the stroke order once (skipped with reduced motion)
      if (reduced()) return Promise.resolve();
      return strokes.reduce((p, P) => p.then(() => new Promise(res => { let i = 0; const step = () => { if (!run) return res(); if (i >= P.length) { ghost.setAttribute('cx', -50); return res(); }
        ghost.setAttribute('cx', P[i][0]); ghost.setAttribute('cy', P[i][1]); i += 2; requestAnimationFrame(step); }; step(); })), Promise.resolve());
    }
    svg.onpointerdown = e => { if (!run || run.busy) return; const [x, y] = toLetter(e); const st = tracer.down(x, y); dragging = st.active; if (dragging) svg.setPointerCapture?.(e.pointerId); e.preventDefault(); };
    svg.onpointermove = e => {
      if (!dragging || !run) return; const [x, y] = toLetter(e), st = tracer.move(x, y);
      lanes.forEach((ln, i) => ln.classList.toggle('off', i === st.stroke && !st.onPath));
      if (!st.onPath && !run.offSaid) { run.offSaid = true; say('Back on the dots!', 'm-back-on'); setTimeout(() => run && (run.offSaid = false), 2500); }
      if (st.strokeDone) { dragging = false; drawMarks(); }
      drawInk();
      if (st.letterDone) done();
    };
    svg.onpointerup = svg.onpointercancel = () => { dragging = false; tracer.up(); lanes.forEach(ln => ln.classList.remove('off')); };
    $('tr-undo').onclick = () => { tracer.undo(); drawInk(); drawMarks(); };
    function done() {
      rep++; tray(); run.busy = true; audio.play('sfx-chime'); audio.play(soundClip(g, audio), { delayMs: 300 });
      record({ skill: `trace:${l}`, itemId: l, correct: true, firstAttempt: true, scored: false, rep });
      inkG.querySelectorAll('.ink').forEach(p => p.setAttribute('class', 'doneink'));
      setTimeout(() => {
        if (!run) return; run.busy = false;
        if (rep >= TRACE_REPS) { $('tr-next').hidden = false; $('tr-undo').hidden = true; say('Great tracing!'); return; }
        tracer = createTracer(l, { tol: 17 }); drawInk(); drawMarks();
      }, 1200);
    }
    run.debugPoints = () => { const st = tracer.state(); if (st.done || run.busy) return []; const m = svg.getScreenCTM(); // automated play-through only
      return strokes[st.stroke].filter((_, i) => i % 3 === 0 || i === strokes[st.stroke].length - 1).map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]); };
    $('tr-next').hidden = true; $('tr-undo').hidden = false; $('tr-next').onclick = () => finish();
    $('ls-again').onclick = () => { audio.stop(); say('Start at the green dot and follow me!', 'm-trace-start'); };
    tray(); drawMarks(); drawInk(); pebbles(TRACE_REPS, 0);
    run.busy = true; say('Start at the green dot and follow me!', 'm-trace-start').then(demo).then(() => run && (run.busy = false));
  }

  function finish() { const r = run; stop(); r?.onComplete?.({ activity: r.activity }); }
  function stop() { run = null; audio.stop(); }
  $('ls-home').onclick = () => { stop(); onHome(); };
  return {
    // opts: { activity: 'intro' | 'trace', gpc, onComplete }
    start(opts) {
      stop(); run = { ...opts, taps: 0 }; $('lesson').hidden = false;
      if (opts.activity === 'trace' && STROKES[GPC[opts.gpc]?.grapheme ?? opts.gpc]) trace(opts.gpc); else intro(opts.gpc);
    },
    stop, get run() { return run; },
  };
}
