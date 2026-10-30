// Letter intro + tracing (design/letters-board 1b, 1c). Exposure / motor activities: they log `intro:` / `trace:`
// responses for the parent view but never gate mastery (sound mastery comes from Sound Hunt).
import { createGhostHand, centerIn } from './ghost-hand.js';
import { noSeen } from './seen.js';
import { LETTER_PICS, WORDS } from './content.js';
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
// v2 V10: print the picture word only if it decodes with the sounds taught up to and including g (sequence order).
const PARSE = new Map(Object.values(WORDS).flat().map(e => [e.w, e.parse.split(' ')]));
export function introLabel(word, g) {
  const ids = PARSE.get(word), at = GPC[g]?.order; if (!ids || at == null) return false;
  return ids.every(id => GPC[id] && GPC[id].order <= at);
}
export const soundClip = (g, audio) => (audio?.byId?.has?.(`snd-${g}-held`) ? `snd-${g}-held` : `snd-${g}`);

export function createLessonScreen({ audio, stage, settings, rand = Math.random, record = () => {}, onHome, seen = noSeen }) {
  let run = null;
  const hand = createGhostHand({ host: $('lesson'), reduced: () => settings.reducedMotion?.() });
  const at = node => centerIn(node, $('lesson'), stage.scale);
  const reduced = () => settings.reducedMotion?.();
  const say = (text, ...clips) => { $('ls-bubble').innerHTML = text; return clips.reduce((p, c) => p.then(() => run && audio.play(c)), Promise.resolve()); };
  const pebbles = (n, at) => $('ls-pebbles').replaceChildren(...Array.from({ length: n }, (_, i) => { const d = document.createElement('div'); d.className = 'peb' + (i < at ? ' on' : i === at ? ' now' : ''); return d; }));

  // ---- 1b letter intro ----
  function intro(g) {
    const pics = LETTER_PICS[g] ?? [], [word, pic] = shuffle(pics, rand)[0] ?? [null, null], gr = GPC[g]?.grapheme ?? g;
    $('intro').hidden = false; $('trace').hidden = true; $('lesson').classList.remove('tracing');
    const dg = gr.length > 1; // digraph fusion intro (words-board 3, note 23): s + h slide together into one sky tile
    $('ic-letter').classList.toggle('dg', dg); $('ic-letter').classList.remove('fused');
    if (dg) { $('ic-letter').innerHTML = [...gr].map(c => `<span class="fl">${c}</span>`).join(''); if (reduced()) $('ic-letter').classList.add('fused'); }
    else $('ic-letter').textContent = gr;
    $('ic-letter').setAttribute('aria-label', dg ? `two letters, one sound: ${gr}` : `letter ${gr}`);
    const P = $('ic-pic'), label = word && introLabel(word, g); P.hidden = !word || (!pic && !label);
    if (!P.hidden) { P.innerHTML = (pic ? `<span class="emoji">${pic}</span>` : '') + (label ? `<span class="pw">${picWordHtml(word, gr)}</span>` : ''); P.classList.toggle('wordonly', !pic); P.setAttribute('aria-label', word); }
    const snd = soundClip(g, audio);
    const prompt = () => dg ? say(`Two letters, one sound: <b>${gr}</b>. Tap it!`, 'm-two-letters', snd, 'm-tap-it')
      : say(`This letter says <b>${gr}</b>. Tap it!`, 'm-letter-says', snd, 'm-tap-it');
    $('ic-letter').onclick = () => { audio.stop(); audio.play(snd); run.taps++; hand.hide(); hand.poke(); };
    P.onclick = () => { audio.stop(); audio.play(snd).then(() => word && audio.play(`pic-${word}`)); run.taps++; };
    $('ic-replay').onclick = () => { audio.stop(); prompt(); };
    $('ic-next').onclick = () => { seen.mark('intro'); record({ skill: `intro:${g}`, itemId: g, correct: true, firstAttempt: true, scored: false, taps: run.taps }); finish(); };
    $('ls-again').onclick = $('ic-replay').onclick;
    pebbles(1, 0);
    // ghost hand: taps the letter card, then points at ➜ (first meetings + 5 s idle)
    const showHand = () => run && hand.start(() => run && run.activity === 'intro' ? [at($('ic-letter')), at($('ic-letter')), run.taps ? at($('ic-next')) : at($('ic-letter'))] : null, { now: seen.demo('intro') });
    if (dg && !reduced()) { $('ls-bubble').innerHTML = 'Watch!'; setTimeout(() => { if (!run) return; $('ic-letter').classList.add('fused'); setTimeout(() => run && prompt().then(showHand), 700); }, 700); }
    else prompt().then(showHand);
  }

  // ---- 1c tracing ----
  function trace(g) {
    const l = GPC[g]?.grapheme ?? g;
    $('intro').hidden = true; $('trace').hidden = false; $('lesson').classList.add('tracing');
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
    // Finger guide (Uiux r4): the soft blue dot appears only once a finger is down, riding the ink head — it never
    // sits on top of the green start dot before the child has touched.
    const guide = (on, st = tracer.state()) => { const P = strokes[st.stroke]; const q = on && P ? P[Math.min(st.k, P.length - 1)] : [-50, -50]; ghost.setAttribute('cx', q[0]); ghost.setAttribute('cy', q[1]); };
    svg.onpointerdown = e => { hand.hide(); hand.poke(); if (!run || run.busy) return; const [x, y] = toLetter(e); const st = tracer.down(x, y); dragging = st.active; if (dragging) { svg.setPointerCapture?.(e.pointerId); guide(true); } e.preventDefault(); };
    svg.onpointermove = e => {
      if (!dragging || !run) return; const [x, y] = toLetter(e), st = tracer.move(x, y);
      lanes.forEach((ln, i) => ln.classList.toggle('off', i === st.stroke && !st.onPath));
      if (!st.onPath && !run.offSaid) { run.offSaid = true; say('Back on the dots!', 'm-back-on'); setTimeout(() => run && (run.offSaid = false), 2500); }
      if (st.strokeDone) { dragging = false; drawMarks(); }
      drawInk(); guide(dragging);
      if (st.letterDone) done();
    };
    svg.onpointerup = svg.onpointercancel = () => { dragging = false; guide(false); tracer.up(); lanes.forEach(ln => ln.classList.remove('off')); };
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
    $('tr-next').hidden = true; $('tr-undo').hidden = false; $('tr-next').onclick = () => { seen.mark('trace'); finish(); };
    $('ls-again').onclick = () => { audio.stop(); say('Start at the green dot and follow the arrows!', 'm-trace-start'); };
    tray(); drawMarks(); drawInk(); pebbles(TRACE_REPS, 0); placeBar();
    say('Start at the green dot and follow the arrows!', 'm-trace-start').then(() => { // ghost hand traces the current stroke
      if (!run) return;
      hand.start(() => { if (!run || dragging) return null; const host = $('lesson').getBoundingClientRect(), s = stage.scale, pts = run.debugPoints?.() ?? [];
        // the fingertip rides just below the stroke (clear of the green start dot's radius) and pauses beside the dot first
        const r = 8 * Math.hypot(svg.getScreenCTM().a, svg.getScreenCTM().b) / s, dy = Math.max(30, r + 22);
        const path = pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1).map(([x, y]) => [(x - host.left) / s, (y - host.top) / s + dy]);
        return path.length ? [path[0], ...path] : path; },
        { now: seen.demo('trace'), stepMs: 260 }); });
  }

  // landscape: the undo + stars column sits right next to the (full-height) letter card
  function placeBar() {
    const bar = $('trace').querySelector('.ibar'); bar.style.left = '';
    if (stage.info.mode !== 'short') return;
    requestAnimationFrame(() => { const c = $('trace').querySelector('.tcard'); if (!c) return; bar.style.left = Math.min(stage.info.w - bar.offsetWidth - 16, c.offsetLeft + c.offsetWidth / 2 + 20) + 'px'; });
  }
  function finish() { const r = run; stop(); r?.onComplete?.({ activity: r.activity }); }
  function stop() { run = null; hand.stop(); audio.stop(); }
  $('ls-home').onclick = () => { stop(); onHome(); };
  return {
    // opts: { activity: 'intro' | 'trace', gpc, onComplete }
    start(opts) {
      stop(); run = { ...opts, taps: 0 }; $('lesson').hidden = false;
      if (opts.activity === 'trace' && STROKES[GPC[opts.gpc]?.grapheme ?? opts.gpc]) trace(opts.gpc); else intro(opts.gpc);
    },
    stop, get run() { return run; }, relayout() { if (run?.activity === 'trace') placeBar(); },
  };
}
