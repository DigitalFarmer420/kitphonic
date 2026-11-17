// Letter intro + tracing (design/letters-board 1b, 1c). Exposure / motor activities: they log `intro:` / `trace:`
// responses for the parent view but never gate mastery (sound mastery comes from Sound Hunt).
import { createGhostHand, centerIn } from './ghost-hand.js';
import { noSeen } from './seen.js';
import { LETTER_PICS, WORDS } from './content.js';
import { GPC } from './sequence.js';
import { STROKES, createTracer, strokeOwner, resample, pathD, letterBox, traceHold, traceTouch, letterPoint, traceContact } from './trace.js';
import { tryCapture, scheduleLostCaptureOnSelf } from './gesture.js';
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

// ?tracelog=1 only. Last 40 pointer and touch events on the letter, with a Copy button.
function mountTraceLog(svg, toLetter, owner, tracer) {
  if (!/[?&]tracelog=1(?:&|$)/.test(location.search)) return { remove() {} };
  const lines = [];
  const box = document.createElement('div');
  box.id = 'tracelog';
  box.style.cssText = 'position:absolute;left:8px;right:8px;bottom:8px;z-index:40;max-height:40%;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:10px;background:rgba(58,46,40,.92);color:#fff;font:12px/1.35 ui-monospace,monospace';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.textContent = 'Copy';
  btn.style.cssText = 'align-self:flex-end;height:36px;padding:0 14px;border:0;border-radius:8px;background:#fff;color:#3A2E28;font-weight:700';
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;overflow:auto;white-space:pre-wrap';
  btn.onclick = () => {
    const text = lines.join('\n');
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; box.append(ta); ta.select(); try { document.execCommand('copy'); } catch { /* the text stays on screen */ } ta.remove(); btn.textContent = 'Copied'; };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => { btn.textContent = 'Copied'; }, fallback);
    else fallback();
  };
  box.append(btn, pre);
  $('lesson').append(box);
  const tgt = el => el?.id || (el?.className?.baseVal ?? el?.className) || el?.tagName || '';
  const note = (kind, e, mapped) => {
    const st = tracer();
    const xy = mapped ? mapped.map(n => Math.round(n * 10) / 10).join(',') : '';
    lines.push([Math.round(e.timeStamp || 0), kind, e.pointerId ?? '', e.pointerType || '', String(tgt(e.target)).slice(0, 24), Math.round(e.clientX || 0), Math.round(e.clientY || 0), xy, st.active ? 1 : 0, st.k, owner.id ?? '', e.defaultPrevented ? 1 : 0].join(' '));
    if (lines.length > 40) lines.shift();
    pre.textContent = lines.join('\n');
  };
  const onPointer = e => { let mapped = null; try { mapped = toLetter(e); } catch { /* mapping must not break the log */ } note(e.type, e, mapped); };
  const onTouch = e => {
    const t = e.changedTouches?.[0];
    let mapped = null; try { if (t) mapped = toLetter(t); } catch { /* same */ }
    note(e.type, { timeStamp: e.timeStamp, pointerId: t?.identifier, pointerType: 'touch', target: e.target, clientX: t?.clientX, clientY: t?.clientY, defaultPrevented: e.defaultPrevented }, mapped);
  };
  const cap = { capture: true };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'gotpointercapture']) document.addEventListener(type, onPointer, cap);
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) document.addEventListener(type, onTouch, cap);
  return { remove() {
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'gotpointercapture']) document.removeEventListener(type, onPointer, cap);
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) document.removeEventListener(type, onTouch, cap);
    box.remove();
  } };
}

export function createLessonScreen({ audio, stage, settings, rand = Math.random, record = () => {}, onHome, seen = noSeen }) {
  let run = null, detachTrace = () => {};
  const hand = createGhostHand({ host: $('lesson'), reduced: () => settings.reducedMotion?.() });
  const at = node => centerIn(node, $('lesson'), stage.scale);
  const reduced = () => settings.reducedMotion?.();
  const say = (text, ...clips) => { $('ls-bubble').innerHTML = text; return audio.say(clips); }; // rc5: one phrase, cancelled by audio.stop()
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
    const prompt = () => { (dg ? say(`Two letters, one sound: <b>${gr}</b>. Tap it!`, 'm-two-letters', snd) : say(`This letter says <b>${gr}</b>. Tap it!`, 'm-letter-says', snd));
      return audio.say(['m-tap-it']); }; // rc5: queued after the phrase (+250 ms)
    $('ic-letter').onclick = () => { audio.stop(); audio.play(snd); run.taps++; hand.hide(); hand.poke(); };
    P.onclick = () => { audio.stop(); audio.say([snd]); if (word) audio.play(`pic-${word}`); run.taps++; };
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
    detachTrace();
    const l = GPC[g]?.grapheme ?? g;
    $('intro').hidden = true; $('trace').hidden = false; $('lesson').classList.add('tracing');
    const svg = $('tr-svg'); svg.replaceChildren();
    const bb = letterBox(l); svg.setAttribute('viewBox', `${bb.x} ${bb.y} ${bb.w} ${bb.h}`); svg.parentElement.style.aspectRatio = `${bb.w} / ${bb.h}`;
    let rep = 0, tracer = createTracer(l, { tol: 17 }), inks = [], dragging = false;
    sv('rect', { class: 'hit', x: bb.x, y: bb.y, width: bb.w, height: bb.h, fill: 'none', 'pointer-events': 'all' }, svg);
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
      const num = sv('text', { class: 'startn', x: P[0][0], y: P[0][1], 'pointer-events': 'none' }, marks);
      num.textContent = String(st.stroke + 1);
      num.style.webkitUserSelect = 'none'; num.style.webkitTouchCallout = 'none';
    }
    function drawInk() {
      const st = tracer.state(); inkG.replaceChildren();
      for (let s = 0; s < Math.min(st.stroke, strokes.length); s++) sv('path', { class: 'ink', d: pathD(strokes[s]) }, inkG);
      if (!st.done && st.k > 0) sv('path', { class: 'ink', d: pathD(strokes[st.stroke].slice(0, st.k + 1)) }, inkG);
    }
    const card = svg.parentElement;
    const paintSurface = el => { if (!el?.style) return; el.style.touchAction = 'none'; el.style.webkitUserSelect = 'none'; el.style.webkitTouchCallout = 'none'; el.style.userSelect = 'none'; };
    paintSurface(svg); paintSurface(card);
    svg.setAttribute('pointer-events', 'bounding-box'); // the root's painted area is empty; the box itself must take the hit
    const toLetter = e => {
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox?.baseVal;
      const box = vb && rect.width > 0 && rect.height > 0 && vb.width > 0 && vb.height > 0
        ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, vbX: vb.x, vbY: vb.y, vbWidth: vb.width, vbHeight: vb.height }
        : null;
      const vv = svg.ownerDocument?.defaultView?.visualViewport;
      const viewport = vv ? { offsetLeft: vv.offsetLeft || 0, offsetTop: vv.offsetTop || 0, scale: vv.scale || 1 } : null;
      return letterPoint(svg.getScreenCTM(), e.clientX, e.clientY, box, viewport);
    };
    const insideLetter = (x, y) => { const r = svg.getBoundingClientRect(); return x >= r.left && y >= r.top && x <= r.right && y <= r.bottom; };
    const touchDevice = () => (navigator.maxTouchPoints || 0) > 0;
    // Finger guide (Uiux r4): the soft blue dot appears only once a finger is down, riding the ink head — it never
    // sits on top of the green start dot before the child has touched.
    const guide = (on, st = tracer.state()) => { const P = strokes[st.stroke]; const q = on && P ? P[Math.min(st.k, P.length - 1)] : [-50, -50]; ghost.setAttribute('cx', q[0]); ghost.setAttribute('cy', q[1]); };
    const owner = strokeOwner(); // rc6: only the finger that started the stroke drives it (iPad palm / second finger)
    // Touch.identifier and PointerEvent.pointerId are different numbers (they can even collide), so the stroke's
    // touch is matched by position, never by id: a palm whose identifier equals the finger's pointerId must not own it.
    let held = false, touchId = null, lastClient = null, downClient = null, pointerStream = false, arm = null, armAt = null, armTimer = 0, closed = false;
    const live = new Map(); // touch identifier -> [clientX, clientY] for touches currently on the svg
    // Bind the stroke's touch. A 4px gate missed real fingers once the page was zoomed or offset, and the
    // owner then never released. The radius only binds; pointerup / cancel / lostpointercapture release
    // without it, and the next pointerdown clears an owner whose touch is already gone.
    const nearTouch = (xy, list) => { let best = null, bd = 48; for (const [id, q] of list) { const d = Math.hypot(q[0] - xy[0], q[1] - xy[1]); if (d < bd) { bd = d; best = id; } } return best; };
    const paintMove = (samples) => {
      let st = tracer.state();
      for (const c of samples) { const q = toLetter(c); if (!q) continue; st = tracer.move(q[0], q[1]); if (st.strokeDone) break; }
      lanes.forEach((ln, i) => ln.classList.toggle('off', i === st.stroke && !st.onPath));
      if (!st.onPath && !run.offSaid) { run.offSaid = true; say('Back on the dots!', 'm-back-on'); setTimeout(() => run && (run.offSaid = false), 2500); }
      if (st.strokeDone) { dragging = false; held = false; drawMarks(); }
      drawInk(); guide(dragging);
      if (st.letterDone) done();
      return st;
    };
    const finishStroke = () => { if (owner.id != null) owner.release(owner.id); held = false; dragging = false; pointerStream = false; touchId = null; arm = null; armAt = null; guide(false); tracer.up(); lanes.forEach(ln => ln.classList.remove('off')); };
    // iPadOS may deliver the finger only as touch events (no pointerdown on the SVG). Arm the start for the
    // next turn so a pointerdown in this same turn still wins.
    const beginTouch = (clientX, clientY, ident) => {
      hand.hide(); hand.poke();
      if (closed || !run || run.busy || dragging || owner.id != null) return;
      const p = toLetter({ clientX, clientY }); if (!p) return;
      const st = tracer.down(p[0], p[1]); dragging = st.active; if (!dragging) { arm = null; armAt = null; return; }
      held = false; pointerStream = false; arm = null; armAt = null;
      lastClient = [clientX, clientY]; downClient = lastClient; touchId = ident;
      owner.claim(`touch-${ident}`); guide(true);
    };
    const onTouchStart = e => {
      const onButton = !!e.target?.closest?.('button');
      if (!onButton && run && !$('trace').hidden && [...e.changedTouches].some(t => insideLetter(t.clientX, t.clientY))) e.preventDefault();
      if (onButton) return;
      // e.touches lists every finger on the screen: drop any whose touchend never reached the svg.
      if (e.touches) { const on = new Set([...e.touches].map(t => t.identifier)); for (const id of [...live.keys()]) if (!on.has(id)) live.delete(id); }
      for (const t of e.changedTouches) live.set(t.identifier, [t.clientX, t.clientY]);
      // pointerdown usually fires before touchstart: bind the stroke to the new touch at the pointerdown position.
      if (dragging && touchId == null && downClient) touchId = nearTouch(downClient, [...e.changedTouches].map(t => [t.identifier, [t.clientX, t.clientY]]));
      if (!dragging && owner.id == null) {
        const t = [...e.changedTouches].find(t => insideLetter(t.clientX, t.clientY));
        if (t) { arm = t.identifier; armAt = [t.clientX, t.clientY]; clearTimeout(armTimer); armTimer = setTimeout(() => { const id = arm; if (id == null || dragging || owner.id != null) return; const q = live.get(id); arm = null; if (q) beginTouch(q[0], q[1], id); }, 0); }
      }
    };
    const onTouchMove = e => {
      const onButton = !!e.target?.closest?.('button');
      if (!onButton && run && !$('trace').hidden && (dragging || held || [...e.changedTouches].some(t => insideLetter(t.clientX, t.clientY)))) e.preventDefault();
      for (const t of e.changedTouches) if (live.has(t.identifier)) live.set(t.identifier, [t.clientX, t.clientY]);
      // The armed touch's first move starts the stroke if pointerdown never arrived (same turn, before the timer).
      if (!dragging && arm != null && armAt && [...e.changedTouches].some(t => t.identifier === arm)) beginTouch(armAt[0], armAt[1], arm);
      if ((pointerStream && !held) || !dragging || !run) return; // pointer moves own the ink unless iOS cancelled them
      const t = traceTouch(e.touches, { id: touchId, last: lastClient });
      if (!t) return;
      if (touchId != null && t.identifier !== touchId && [...e.touches].some(x => x.identifier === touchId)) return;
      touchId = t.identifier; lastClient = [t.clientX, t.clientY];
      paintMove([t]);
    };
    const onTouchEnd = e => {
      const mine = touchId != null && [...e.changedTouches].some(t => t.identifier === touchId);
      for (const t of e.changedTouches) { live.delete(t.identifier); if (t.identifier === arm) arm = null; }
      // A paused (cancelled) stroke ends when its own finger lifts; a live one ends on pointerup. A stroke finished
      // by touchmoves after a cancel (held and dragging are already false) gets no pointerup, so its lift releases it too.
      // A touch-only stroke (no pointer stream) also ends here: iPad never sends that pointerup.
      if (mine && (held || !dragging || !pointerStream)) finishStroke();
      else if (owner.id != null && live.size === 0) finishStroke(); // the finger left, even if it was never bound within a few px
    };
    const stopCallout = e => { if (e.target?.closest?.('button')) return; e.preventDefault(); };
    card.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    card.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    card.addEventListener('touchend', onTouchEnd, true);
    card.addEventListener('touchcancel', onTouchEnd, true);
    card.addEventListener('selectstart', stopCallout);
    card.addEventListener('contextmenu', stopCallout);
    const log = mountTraceLog(svg, toLetter, owner, () => tracer);
    const onpointerdown = e => {
      if (e.target?.closest?.('button') || !insideLetter(e.clientX, e.clientY)) return;
      e.preventDefault(); arm = null; hand.hide(); hand.poke(); if (!run || run.busy) return;
      // strokeDone clears `dragging` while this finger may still be down. Do not reset the owner:
      // a palm or second finger must not start the next stroke until this one lifts.
      // A cancelled stroke whose finger has already lifted no longer blocks a new touch (iOS: cancel, lift, touch again).
      // A finished stroke (held false) is released the same way once its bound touch is known to have lifted.
      if (owner.id !== null && !owner.owns(e.pointerId) && (touchId == null || !live.has(touchId))) finishStroke(); // stale owner: its touch never bound, or it has lifted
      if (owner.id !== null && !owner.owns(e.pointerId)) return;
      if (dragging && !owner.owns(e.pointerId)) return; // another finger mid-stroke: ignore
      const p = toLetter(e); if (!p) return; const [x, y] = p; const st = tracer.down(x, y); dragging = st.active;
      if (dragging) {
        held = false; pointerStream = true; lastClient = [e.clientX, e.clientY]; downClient = lastClient;
        const finger = traceContact(e.pointerType, { touchDevice: touchDevice() }) === 'touch';
        touchId = finger ? nearTouch(downClient, live) : null; // null until its touchstart arrives
        owner.claim(e.pointerId); tryCapture(card, e.pointerId); guide(true); // capture the HTML card, not the SVG (Safari cancels an SVG capture)
      } };
    const onpointermove = e => { if (!dragging || !run || !owner.owns(e.pointerId)) return;
      pointerStream = true; lastClient = [e.clientX, e.clientY];
      const extra = (e.getCoalescedEvents?.() ?? []).filter(s => s.clientX !== 0 || s.clientY !== 0 || (e.clientX === 0 && e.clientY === 0));
      paintMove(extra.concat(e)); // coalesced: smooth fast strokes; a coalesced 0,0 on iOS is not a real point
    };
    const endStroke = e => {
      const act = traceHold({ type: e.type, target: e.target, svg, surface: card, pointerType: e.pointerType || 'touch', touchDevice: touchDevice() });
      if (act === 'ignore') return; // unconfirmed: bubbled child lostpointercapture
      if (act === 'hold' && owner.owns(e.pointerId)) { held = true; return; } // finger or Pencil cancel: keep owner and ink; touchmove continues
      if (!owner.release(e.pointerId)) return; held = false; dragging = false; pointerStream = false; touchId = null; arm = null; armAt = null; guide(false); tracer.up(); lanes.forEach(ln => ln.classList.remove('off'));
    }; // a real lift keeps the ink: resume where it paused
    svg.onpointerup = svg.onpointercancel = endStroke;
    // A finger or Pencil that loses capture pauses at once (the touchmoves that follow continue it). The
    // scheduled check still ends a real mouse stroke whose capture was stolen. Capture sits on the HTML card:
    // setPointerCapture on the SVG itself cancels the gesture in Safari.
    card.onlostpointercapture = e => { if ((e.target === card || e.target === svg) && owner.owns(e.pointerId) && traceHold({ type: e.type, target: e.target, svg, surface: card, pointerType: e.pointerType || 'touch', touchDevice: touchDevice() }) === 'hold') held = true; scheduleLostCaptureOnSelf(e, pid => owner.owns(pid), () => endStroke(e)); };
    card.addEventListener('pointerdown', onpointerdown, true);
    card.addEventListener('pointermove', onpointermove, true);
    // Capture can fail. A cancel or lift that never reaches the card (finger already outside, or the hint ate the hit) still has to drop the owner.
    window.addEventListener('pointerup', endStroke); window.addEventListener('pointercancel', endStroke);
    detachTrace = () => { closed = true; clearTimeout(armTimer); window.removeEventListener('pointerup', endStroke); window.removeEventListener('pointercancel', endStroke);
      card.removeEventListener('pointerdown', onpointerdown, true); card.removeEventListener('pointermove', onpointermove, true);
      card.removeEventListener('touchstart', onTouchStart, true); card.removeEventListener('touchmove', onTouchMove, true);
      card.removeEventListener('touchend', onTouchEnd, true); card.removeEventListener('touchcancel', onTouchEnd, true);
      card.removeEventListener('selectstart', stopCallout); card.removeEventListener('contextmenu', stopCallout); log.remove();
      if (svg.onpointerup === endStroke) svg.onpointerup = svg.onpointercancel = card.onlostpointercapture = null; };
    $('tr-undo').onclick = () => { tracer.undo(); drawInk(); drawMarks(); };
    function done() {
      rep++; tray(); run.busy = true; audio.play('sfx-chime'); audio.play(soundClip(g, audio), { gapMs: 300 }); // rc5: sound after the chime ends (spec §3.3 L1: trace while its sound plays)
      record({ skill: `trace:${l}`, itemId: l, correct: true, firstAttempt: true, scored: false, rep });
      inkG.querySelectorAll('.ink').forEach(p => p.setAttribute('class', 'doneink'));
      setTimeout(() => {
        if (!run) return; run.busy = false;
        if (rep >= TRACE_REPS) { $('tr-next').hidden = false; $('tr-undo').hidden = true; say('Great tracing!'); return; }
        tracer = createTracer(l, { tol: 17 }); drawInk(); drawMarks();
      }, 1200);
    }
    run.debugState = () => tracer.state(); // automated checks only
    run.debugOwner = () => owner.id;
    run.debugPoints = () => { const st = tracer.state(); if (st.done || run.busy) return []; const m = svg.getScreenCTM(); if (!m) return []; // automated play-through only
      return strokes[st.stroke].filter((_, i) => i % 3 === 0 || i === strokes[st.stroke].length - 1).map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]); };
    $('tr-next').hidden = true; $('tr-undo').hidden = false; $('tr-next').onclick = () => { seen.mark('trace'); finish(); };
    $('ls-again').onclick = () => { audio.stop(); say('Start at the green dot and follow the arrows!', 'm-trace-start'); };
    tray(); drawMarks(); drawInk(); pebbles(TRACE_REPS, 0); placeBar();
    say('Start at the green dot and follow the arrows!', 'm-trace-start').then(() => { // ghost hand traces the current stroke
      if (!run) return;
      hand.start(() => { if (!run || dragging) return null; const host = $('lesson').getBoundingClientRect(), s = stage.scale, pts = run.debugPoints?.() ?? [];
        // the fingertip rides just below the stroke (clear of the green start dot's radius) and pauses beside the dot first
        const m = svg.getScreenCTM(), r = m ? 8 * Math.hypot(m.a, m.b) / s : 30, dy = Math.max(30, r + 22);
        const path = pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1).map(([x, y]) => [(x - host.left) / s, (y - host.top) / s + dy]);
        return path.length ? [path[0], ...path] : path; },
        { now: seen.demo('trace'), stepMs: 260 }); });
  }

  // landscape: the undo + stars column sits right next to the (full-height) letter card
  function placeBar() {
    const bar = $('trace').querySelector('.ibar'), card = $('trace').querySelector('.tcard'); bar.style.left = ''; if (card) card.style.maxWidth = '';
    if (stage.info.mode !== 'short') return;
    // rc6: a wide letter (ss, qu, ng…) must not run under the undo / stars column, or a stroke's start dot sits under
    // Undo (iPhone landscape): cap the centred card so its right edge + 20 px clears the column (150 px + 16 px margin)
    const u = stage.info.u || 1;
    if (card) card.style.maxWidth = Math.max(200 * u, stage.info.w - 2 * (150 + 16 + 20) * u) + 'px';
    requestAnimationFrame(() => { const c = $('trace').querySelector('.tcard'); if (!c) return; const uu = stage.info.u || 1; bar.style.left = Math.min(stage.info.w - bar.offsetWidth - 16 * uu, c.offsetLeft + c.offsetWidth / 2 + 20 * uu) + 'px'; });
  }
  function finish() { const r = run; stop(); r?.onComplete?.({ activity: r.activity }); }
  function stop() { detachTrace(); detachTrace = () => {}; run = null; hand.stop(); audio.stop(); }
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
