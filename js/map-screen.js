// Learning map (home, design/map-mockup) + level-up moment. The child never picks a level: one big ▶ (and the glowing
// current stop) always starts the planned session. A passed stop starts that lesson again as practice. Gear = grown-ups
// (press-and-hold gate, 2 s). The path is the whole course; the board scrolls to the current stop on open.
import { nextPraise } from './feedback.js';
import { mapStops, mapLayout, mapScroll, pathD, levelUpChips, groupOf, boardInsets, BOARD_GAP } from './map-layout.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const isEmoji = t => /\p{Extended_Pictographic}/u.test(t);
export const GATE_MS = 2000, LEVELUP_LOCK_MS = 1500;
const DRAG_PX = 8;

import { createGhostHand, centerIn } from './ghost-hand.js';
import { noSeen } from './seen.js';
export function createMapScreen({ audio, stage, settings, getMap, getResponses, onGo, onParent = () => {}, onHome, onReplay = () => {}, seen = noSeen }) {
  const hand = createGhostHand({ host: document.getElementById('map'), reduced: () => settings.reducedMotion?.() });
  let last = null, gateTimer = 0, dragging = null, skipTap = false;
  const reduced = () => settings.reducedMotion?.(); // 'auto' follows the device; On/Off from the grown-ups area win
  const board = $('m-board'), world = $('m-world');

  function chromeInsets(info) {
    const map = $('map'), top = map?.querySelector('.top'), go = $('go');
    if (!map || !top || !go || map.hidden) return boardInsets(info);
    const mr = map.getBoundingClientRect(), tr = top.getBoundingClientRect(), gr = go.getBoundingClientRect();
    const boardTop = Math.max(0, tr.bottom - mr.top), boardBottom = Math.max(0, mr.bottom - gr.top) + BOARD_GAP;
    return { boardTop, boardBottom };
  }

  function placeBoard(info, insets, contentW, contentH) {
    const band = boardInsets(info, insets);
    board.style.top = band.boardTop + 'px';
    board.style.bottom = band.boardBottom + 'px';
    board.style.left = '0';
    board.style.right = '0';
    const axis = info.mode === 'portrait' ? 'y' : 'x';
    board.style.touchAction = axis === 'y' ? 'pan-y' : 'pan-x';
    board.style.overflowX = axis === 'x' ? 'auto' : 'hidden';
    board.style.overflowY = axis === 'y' ? 'auto' : 'hidden';
    world.style.width = contentW + 'px';
    world.style.height = contentH + 'px';
  }

  function render({ drawFrom = null, focusCurrent = true } = {}) {
    const m = getMap(), info = stage.info, u = info.u || 1, insets = chromeInsets(info);
    const win = mapStops(m.stops, m.index), pts = mapLayout(win, info, insets);
    const contentW = pts[0]?.contentW ?? info.w, contentH = pts[0]?.contentH ?? info.h;
    placeBoard(info, insets, contentW, contentH);
    $('m-stars').textContent = `⭐ ${m.stops.filter(s => s.status === 'passed').length}`;
    const svg = $('m-path'); svg.setAttribute('viewBox', `0 0 ${contentW} ${contentH}`); svg.replaceChildren();
    const ci = pts.findIndex(p => p.now), cut = ci < 0 ? pts.length - 1 : ci;
    const animate = drawFrom != null && !reduced() && pts.some(p => p.idx === drawFrom) && drawFrom < m.index;
    const fromK = animate ? pts.findIndex(p => p.idx === drawFrom) : cut;
    svg.append(svgEl('path', { class: 'ahead', d: pathD(pts.slice(cut)) }));
    if (fromK > 0) svg.append(svgEl('path', { class: 'done', d: pathD(pts.slice(0, fromK + 1)) }));
    if (animate) { const seg = svgEl('path', { class: 'draw', d: pathD(pts.slice(fromK, cut + 1)) }); svg.append(seg);
      const len = seg.getTotalLength?.() ?? 400; seg.style.setProperty('--len', len); seg.style.strokeDasharray = len; seg.style.strokeDashoffset = len; }
    const box = $('m-stops'); box.replaceChildren();
    let prevGroup = null;
    for (const p of pts) {
      const b = el('button', `stop ${p.now ? 'current' : p.status}`, isEmoji(p.label) ? `<span class="emoji">${p.label}</span>` : p.label);
      b.style.left = p.x + 'px'; b.style.top = p.y + 'px'; b.setAttribute('aria-label', `${p.label} ${p.now ? '(now)' : p.status}`);
      if (p.status === 'upcoming') b.setAttribute('aria-disabled', 'true');
      if (p.status === 'passed') b.append(el('span', 'st emoji', '⭐'));
      if (p.cue) b.append(el('span', 'cue emoji', p.cue)); // same-spelling stops: a picture tells them apart
      b.onclick = ev => { if (skipTap) { ev.preventDefault(); ev.stopPropagation(); return; } tapStop(p); }; box.append(b);
      const g = groupOf(p);
      if (g && (g !== prevGroup || p.now)) { // parent-facing label (no reading needed by the child)
        const half = Math.max(p.r, b.offsetWidth / 2), halfH = Math.max(p.r, b.offsetHeight / 2); // the drawn stop can exceed r (touch floor)
        const l = el('div', 'mlabel', p.now ? `${g}<br>(now)` : g), off = half + 10 * u;
        if (p.side === 'right') { l.style.left = p.x + off + 'px'; l.style.top = (p.y - 10 * u) + 'px'; }
        else if (p.side === 'left') { l.style.left = (p.x - off - 120 * u) + 'px'; l.style.top = (p.y - 10 * u) + 'px'; }
        else { l.style.left = (p.x - 60 * u) + 'px'; l.style.top = (p.y + halfH + 8 * u) + 'px'; }
        l._p = p; l._off = off; l._halfH = halfH; l._home = [parseFloat(l.style.left), parseFloat(l.style.top)]; box.append(l);
      }
      prevGroup = g;
    }
    document.fonts?.ready?.then(() => { if (box.isConnected) unclash(box, u, contentW, contentH); });
    const cur = pts[cut], from = animate ? pts[fromK] : cur;
    if (cur && !m.done) { // Kit sits next to the current stop (walks there when the path draws forward)
      const kit = el('div', 'mkit', '<svg width="64" height="64"><use href="#kit"/></svg>');
      // beside the stop (portrait: opposite its label; landscape: to its right, at the same height)
      // landscape: low-row stop -> Kit just above it; high-row stop -> beside it (right), raised away from the low row
      // Kit (4rem) stays on the board when a narrow (large-text) composition puts the stop near an edge.
      const onBoard = x => Math.max(34 * u, Math.min(contentW - 34 * u, x));
      const kx = p => onBoard(info.mode === 'portrait' ? p.x + (p.side === 'right' ? -1 : 1) * (p.r + 36 * u) : p.low ? p.x : p.x + p.r + 36 * u);
      const ky = p => info.mode === 'portrait' ? p.y - p.r + 10 * u : p.low ? p.y - p.r - 38 * u : p.y - 20 * u;
      kit.style.left = kx(from) + 'px'; kit.style.top = ky(from) + 'px'; box.append(kit);
      // the current stop's cue picture moves to the side away from Kit (Kit left -> top-right; Kit above -> middle-left)
      const cue = box.querySelector('.stop.current .cue');
      if (cue) cue.classList.add(info.mode !== 'portrait' && cur.low ? 'ml' : kx(cur) < cur.x ? 'tr' : 'tl');
      if (animate) setTimeout(() => { kit.style.left = kx(cur) + 'px'; kit.style.top = ky(cur) + 'px'; }, 50);
    }
    unclash(box, u, contentW, contentH);
    if (focusCurrent) {
      const sc = mapScroll(pts, info, m.done ? pts.length - 1 : m.index, insets);
      board.scrollLeft = sc.left; board.scrollTop = sc.top;
    } else {
      board.scrollLeft = Math.max(0, Math.min(board.scrollLeft, Math.max(0, contentW - board.clientWidth)));
      board.scrollTop = Math.max(0, Math.min(board.scrollTop, Math.max(0, contentH - board.clientHeight)));
    }
    last = { m, pts, insets };
    // first visit: the ghost hand taps ▶ (then again after 5 s idle until the first session starts)
    if (seen.count('go') === 0) hand.start(() => $('map').hidden ? null : [centerIn($('go'), $('map'), stage.scale), centerIn($('go'), $('map'), stage.scale)], { now: true }); else hand.stop();
  }
  // No overlap: a label whose words would touch a stop, its star/cue badge or another label tries the other
  // sides of its stop (below, right, left, above) and keeps the first clear one (else its original place).
  function unclash(box, u, W, H) {
    const br = box.getBoundingClientRect(), sc = br.width / (box.offsetWidth || 1) || 1;
    const loc = r => ({ l: (r.left - br.left) / sc, t: (r.top - br.top) / sc, r: (r.right - br.left) / sc, b: (r.bottom - br.top) / sc });
    const textBox = l => { const rg = document.createRange(); rg.selectNodeContents(l); return loc(rg.getBoundingClientRect()); };
    const hit = (a, b, pad) => a.l < b.r + pad && b.l < a.r + pad && a.t < b.b + pad && b.t < a.b + pad;
    const blocks = [...[...box.querySelectorAll('.stop, .stop .cue, .mkit')].map(e => loc(e.getBoundingClientRect())), ...[...box.querySelectorAll('.stop .st')].map(textBox)];
    const labels = [...box.querySelectorAll('.mlabel')], placed = [];
    for (const l of labels) {
      const p = l._p, off = l._off, halfH = l._halfH; if (!p) continue;
      const base = [l._home, [p.x - 60 * u, p.y + halfH + 8 * u], [p.x + off, p.y - 10 * u],
        [p.x - off - 120 * u, p.y - 10 * u], [p.x - 60 * u, p.y - halfH - 8 * u - l.offsetHeight]];
      const spots = [0, -8, 8, -16, 16, -24, 24].flatMap(dy => base.map(([x, y]) => [`${x}px`, `${y + dy * u}px`])); // nudged up/down when crowded
      const clear = () => { const t = textBox(l); return t.l >= 0 && t.t >= 0 && t.r <= W && t.b <= H &&
        !blocks.some(b => hit(t, b, 2)) && !placed.some(o => hit(t, o, 2)); };
      let ok = false;
      for (const [x, y] of spots) { l.style.left = x; l.style.top = y; if (clear()) { ok = true; break; } }
      if (!ok) { l.style.left = spots[0][0]; l.style.top = spots[0][1]; }
      placed.push(textBox(l));
    }
  }
  function tapStop(p) {
    if (p.now) { hand.stop(); seen.mark('go'); return onGo(); }
    if (p.status === 'passed') { audio.stop(); return onReplay(p); } // practice: the lesson for this stop, never a step back
  }

  // Mouse drag scrolls the trail (touch and wheel use native overflow). A drag must not tap a stop.
  board.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging = { x: e.clientX, y: e.clientY, sl: board.scrollLeft, st: board.scrollTop, moved: false };
  });
  board.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
    if (!dragging.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    dragging.moved = true;
    board.scrollLeft = dragging.sl - dx;
    board.scrollTop = dragging.st - dy;
  });
  const endDrag = () => { if (dragging?.moved) skipTap = true; dragging = null; };
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) board.addEventListener(ev, endDrag);
  board.addEventListener('click', e => { if (!skipTap) return; e.preventDefault(); e.stopPropagation(); skipTap = false; }, true);
  // press-and-hold gate for grown-ups
  const gear = $('m-gear');
  const hold = e => { e.preventDefault(); $('m-gate').hidden = false; gateTimer = setTimeout(() => { $('m-gate').hidden = true; onParent(); }, GATE_MS); };
  const release = () => { clearTimeout(gateTimer); $('m-gate').hidden = true; };
  gear.addEventListener('pointerdown', hold); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) gear.addEventListener(ev, release);
  $('go').onclick = () => { hand.stop(); seen.mark('go'); onGo(); };
  $('m-home').onclick = () => onHome();

  // --- level-up moment: badge flies in, confetti, chime, Kit "You did it!", 3 chips, ➜ locked for 1.5 s ---
  function levelUp(stop, { onBack }) {
    const chips = levelUpChips(stop, getResponses(), getMap().stops);
    $('lv-badge').innerHTML = `<span class="emoji">⭐</span>`;
    $('lv-chips').replaceChildren(...chips.map(c => { const b = el('button', 'lv-chip L', c.text); b.setAttribute('aria-label', c.text);
      b.onclick = () => { audio.stop(); audio.play(c.clip); }; return b; }));
    const conf = $('lv-confetti'); conf.replaceChildren();
    if (!reduced()) for (let k = 0; k < 14; k++) { const c = el('span', 'conf emoji', ['🎉', '✨', '⭐', '🎊'][k % 4]);
      c.style.left = (6 + (k * 37) % 88) + '%'; c.style.top = (4 + (k * 23) % 30) + '%'; c.style.setProperty('--fall', (160 + (k * 53) % 220) * (stage.info.u || 1) + 'px');
      c.style.setProperty('--rot', ((k % 2 ? 1 : -1) * (90 + k * 20)) + 'deg'); c.style.animationDelay = (k * 70) + 'ms'; conf.append(c); }
    const next = $('lv-next'); next.disabled = true; setTimeout(() => (next.disabled = false), LEVELUP_LOCK_MS);
    next.onclick = () => { if (!next.disabled) { audio.stop(); onBack(); } };
    audio.play('sfx-chime'); audio.play(nextPraise('levelUp'), { gapMs: 300 }); // rc5: praise queued after the chime, varied
  }
  return { render, levelUp, get last() { return last; }, relayout: () => !$('map').hidden && render({ focusCurrent: false }) };
}
