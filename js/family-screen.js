// Word family screen (design/words-board 2, notes 14–19). The rime tile ("at") is fixed; onset tiles are reusable.
// Drag a tile to the pulsing slot, or tap a tile then the slot (some 4-year-olds can't drag yet). A real word pops
// its picture in and joins the "made" chips (tap = hear it). All words made -> the family ⭐ and a chant.
import { caseFor, shuffle } from './word-logic.js';
import { soundClip } from './lesson-screen.js';
import { GPC } from './sequence.js';
import { createGhostHand, centerIn } from './ghost-hand.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const picOf = e => !e.pic ? null : e.pic.startsWith('#') ? `<svg width="140" height="100"><use href="${e.pic}"/></svg>` : `<span class="emoji">${e.pic}</span>`;

import { noSeen } from './seen.js';
export function createFamilyScreen({ audio, stage, settings, rand = Math.random, record = () => {}, onHome, cfg = {}, seen = noSeen }) {
  let run = null, drag = null;
  const host = $('family'), hand = createGhostHand({ host, reduced: () => settings.reducedMotion() });
  const say = (t, ...clips) => { $('fm-bubble').innerHTML = t; return clips.reduce((p, c) => p.then(() => run && audio.play(c)), Promise.resolve()); };
  const prompt = () => say(`Pick a letter and put it in front of <b>${run.fam.rime}</b>!`, 'm-family-pick', `rime-${run.fam.rime}`);
  const tiles = () => [...$('fm-tray').children];
  const handPath = () => { if (!run || run.busy || run.made.size) return null; const s = stage.scale, t = tiles()[0], a = centerIn(t, host, s), b = centerIn($('fm-slot'), host, s);
    return [a, [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 60], b]; };
  function select(t) { tiles().forEach(x => x.classList.toggle('sel', x === t)); run.sel = t; $('fm-slot').classList.toggle('ready', !!t); }
  async function place(g) {
    if (!run || run.busy) return; hand.poke(); select(null);
    const x = run.fam.words.find(w => w.onset === g); if (!x) return;
    run.busy = true; audio.stop();
    const slot = $('fm-slot'); slot.textContent = caseFor(GPC[g].grapheme, cfg.tileCase); slot.classList.add('filled'); $('fm-word').classList.add('joined');
    const cont = GPC[g].continuous, r = run.fam.rime, l = GPC[g].grapheme;
    $('fm-bubble').innerHTML = `${cont ? l.repeat(3) : l}… ${r} — <b>${x.w}</b>!`;
    await audio.play(soundClip(g, audio)); if (!run) return; await audio.play(`rime-${r}`); if (!run) return;
    const card = $('fm-card'); card.className = 'revealed'; card.innerHTML = picOf(x.entry) ?? `<span class="wordpic L">${x.w}</span>`;
    await audio.play(`word-${x.w}`); if (!run) return;
    const fresh = !run.made.has(x.w); run.made.add(x.w);
    if (fresh) { const c = el('button', 'fchip L', x.w + (x.entry.pic && !x.entry.pic.startsWith('#') ? ` <span class="emoji">${x.entry.pic}</span>` : '')); c.setAttribute('aria-label', x.w);
      c.onclick = () => { audio.stop(); audio.play(`word-${x.w}`); hand.poke(); }; $('fm-made').append(c); tiles().find(t => t.dataset.g === g)?.classList.add('made'); audio.play('sfx-chime'); }
    pebbles();
    setTimeout(async () => {
      if (!run) return;
      slot.textContent = ''; slot.classList.remove('filled'); $('fm-word').classList.remove('joined');
      if (run.made.size >= run.fam.words.length) return familyDone();
      run.busy = false; say(fresh ? 'Make another one!' : `Try a new letter in front of <b>${r}</b>!`, fresh ? 'm-family-more' : 'm-family-pick', ...(fresh ? [] : [`rime-${r}`]));
    }, 1300);
  }
  async function familyDone() {
    hand.stop(); const chips = [...$('fm-made').children];
    say(`You made the whole <b>${run.fam.rime}</b> family! ⭐`, 'm-family-done');
    await new Promise(r => setTimeout(r, 300));
    const made = [...run.made];
    for (const [i, c] of chips.entries()) { if (!run) return; c.classList.add('lit'); await audio.play(`word-${made[i]}`); c.classList.remove('lit'); }
    if (!run) return; const st = el('div', 'fchip star', '⭐ ' + run.fam.rime); $('fm-made').append(st); audio.play('sfx-chime');
    record({ skill: `family:${run.fam.rime}`, itemId: run.fam.rime, correct: true, firstAttempt: true, scored: false, made: run.made.size });
    setTimeout(() => { const r = run; run = null; hand.stop(); seen.mark('family'); r?.onComplete?.({}); }, 1200);
  }
  const pebbles = () => $('fm-pebbles').replaceChildren(...run.fam.words.map((_, i) => el('div', 'peb' + (i < run.made.size ? ' on' : i === run.made.size ? ' now' : ''))));
  // drag: pointer moves a floating copy; dropping near the slot places it. A press without movement = tap-to-select.
  const toStage = e => { const b = host.getBoundingClientRect(), s = stage.scale; return [(e.clientX - b.left) / s, (e.clientY - b.top) / s]; };
  function down(e, t) {
    if (!run || run.busy) return; e.preventDefault(); hand.hide(); hand.poke(); try { t.setPointerCapture?.(e.pointerId); } catch {}
    drag = { t, x0: e.clientX, y0: e.clientY, moved: false, ghost: null };
    audio.stop(); audio.play(soundClip(t.dataset.g, audio));
  }
  function move(e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 12) {
      drag.moved = true; drag.ghost = drag.t.cloneNode(true); drag.ghost.classList.add('fdrag'); drag.ghost.classList.remove('sel'); host.append(drag.ghost); drag.t.classList.add('dragging'); select(null);
    }
    if (drag.moved) { const [x, y] = toStage(e); drag.ghost.style.left = x + 'px'; drag.ghost.style.top = y + 'px';
      $('fm-slot').classList.toggle('ready', overSlot(e)); }
  }
  const overSlot = e => { const r = $('fm-slot').getBoundingClientRect(), pad = 30 * stage.scale; return e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad; };
  function up(e) {
    if (!drag) return; const d = drag; drag = null; d.ghost?.remove(); d.t.classList.remove('dragging'); $('fm-slot').classList.remove('ready');
    if (d.moved) { if (overSlot(e)) place(d.t.dataset.g); }
    else select(run.sel === d.t ? null : d.t);
  }
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', () => { if (drag) { drag.ghost?.remove(); drag.t.classList.remove('dragging'); drag = null; } });
  $('fm-slot').onclick = () => { if (!run || run.busy) return; hand.poke(); if (run.sel) place(run.sel.dataset.g); else prompt(); };
  $('fm-again').onclick = () => run && !run.busy && (audio.stop(), prompt());
  $('fm-home').onclick = () => { run = null; hand.stop(); audio.stop(); onHome(); };
  return {
    start({ family, onComplete }) {
      run = { fam: family, made: new Set(), sel: null, busy: true, onComplete }; $('family').hidden = false;
      $('fm-card').className = ''; $('fm-card').innerHTML = '<span class="q">?</span>'; $('fm-made').replaceChildren();
      $('fm-rime').textContent = caseFor(family.rime, cfg.tileCase); $('fm-slot').textContent = ''; $('fm-slot').className = 'L';
      $('fm-tray').replaceChildren(...shuffle(family.words.map(x => x.onset), rand).map(g => { const t = el('button', 'ftile L', caseFor(GPC[g].grapheme, cfg.tileCase)); t.dataset.g = g;
        t.setAttribute('aria-label', GPC[g].grapheme); t.onpointerdown = e => down(e, t); return t; }));
      pebbles();
      prompt().then(() => { if (!run) return; run.busy = false; hand.start(handPath, { now: seen.demo('family') }); });
    },
    stop() { run = null; hand.stop(); },
    get run() { return run; },
  };
}
