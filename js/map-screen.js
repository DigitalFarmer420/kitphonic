// Learning map (home, design/map-mockup) + level-up moment. The child never picks a level: one big ▶ (and the glowing
// current stop) always starts the planned session. Gear = grown-ups (press-and-hold gate, 2 s).
import { mapWindow, mapLayout, pathD, levelUpChips, groupOf } from './map-layout.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const isEmoji = t => /\p{Extended_Pictographic}/u.test(t);
export const GATE_MS = 2000, LEVELUP_LOCK_MS = 1500;

export function createMapScreen({ audio, stage, settings, getMap, getResponses, onGo, onParent = () => {}, onHome }) {
  let last = null, gateTimer = 0;
  const reduced = () => settings.reducedMotion?.() || matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function render({ drawFrom = null } = {}) {
    const m = getMap(), info = stage.info, win = mapWindow(m.stops, m.index), pts = mapLayout(win, info);
    $('m-stars').textContent = `⭐ ${m.stops.filter(s => s.status === 'passed').length}`;
    const svg = $('m-path'); svg.setAttribute('viewBox', `0 0 ${info.w} ${info.h}`); svg.replaceChildren();
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
      if (p.status === 'passed') b.append(el('span', 'st emoji', '⭐'));
      b.onclick = () => tapStop(p); box.append(b);
      const g = groupOf(p);
      if (g && (g !== prevGroup || p.now)) { // parent-facing label (no reading needed by the child)
        const l = el('div', 'mlabel', p.now ? `${g}<br>(now)` : g), off = p.r + 10;
        if (p.side === 'right') { l.style.left = p.x + off + 'px'; l.style.top = p.y - 10 + 'px'; }
        else if (p.side === 'left') { l.style.left = p.x - off - 120 + 'px'; l.style.top = p.y - 10 + 'px'; }
        else { l.style.left = p.x - 60 + 'px'; l.style.top = p.y + p.r + 8 + 'px'; }
        box.append(l);
      }
      prevGroup = g;
    }
    const cur = pts[cut], from = animate ? pts[fromK] : cur;
    if (cur && !m.done) { // Kit sits next to the current stop (walks there when the path draws forward)
      const kit = el('div', 'mkit', '<svg width="64" height="64"><use href="#kit"/></svg>');
      // beside the stop (portrait: opposite its label; landscape: to its right, at the same height)
      // landscape: low-row stop -> Kit just above it; high-row stop -> beside it (right), raised away from the low row
      const kx = p => info.mode === 'portrait' ? p.x + (p.side === 'right' ? -1 : 1) * (p.r + 36) : p.low ? p.x : p.x + p.r + 36;
      const ky = p => info.mode === 'portrait' ? p.y - p.r + 10 : p.low ? p.y - p.r - 38 : p.y - 20;
      kit.style.left = kx(from) + 'px'; kit.style.top = ky(from) + 'px'; box.append(kit);
      if (animate) setTimeout(() => { kit.style.left = kx(cur) + 'px'; kit.style.top = ky(cur) + 'px'; }, 50);
    }
    last = { m, pts };
  }
  function tapStop(p) {
    if (p.now) return onGo();
    if (p.status === 'passed') { audio.stop(); audio.play(p.kind === 'sound' ? `snd-${p.gpc}` : 'sfx-chime'); } // a passed stop says its sound
  }
  // press-and-hold gate for grown-ups
  const gear = $('m-gear');
  const hold = e => { e.preventDefault(); $('m-gate').hidden = false; gateTimer = setTimeout(() => { $('m-gate').hidden = true; onParent(); }, GATE_MS); };
  const release = () => { clearTimeout(gateTimer); $('m-gate').hidden = true; };
  gear.addEventListener('pointerdown', hold); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) gear.addEventListener(ev, release);
  $('go').onclick = () => onGo();
  $('m-home').onclick = () => onHome();

  // --- level-up moment: badge flies in, confetti, chime, Kit "You did it!", 3 chips, ➜ locked for 1.5 s ---
  function levelUp(stop, { onBack }) {
    const chips = levelUpChips(stop, getResponses(), getMap().stops);
    $('lv-badge').innerHTML = `<span class="emoji">⭐</span>`;
    $('lv-chips').replaceChildren(...chips.map(c => { const b = el('button', 'lv-chip L', c.text); b.setAttribute('aria-label', c.text);
      b.onclick = () => { audio.stop(); audio.play(c.clip); }; return b; }));
    const conf = $('lv-confetti'); conf.replaceChildren();
    if (!reduced()) for (let k = 0; k < 14; k++) { const c = el('span', 'conf emoji', ['🎉', '✨', '⭐', '🎊'][k % 4]);
      c.style.left = (6 + (k * 37) % 88) + '%'; c.style.top = (4 + (k * 23) % 30) + '%'; c.style.setProperty('--fall', 160 + (k * 53) % 220 + 'px');
      c.style.setProperty('--rot', ((k % 2 ? 1 : -1) * (90 + k * 20)) + 'deg'); c.style.animationDelay = (k * 70) + 'ms'; conf.append(c); }
    const next = $('lv-next'); next.disabled = true; setTimeout(() => (next.disabled = false), LEVELUP_LOCK_MS);
    next.onclick = () => { if (!next.disabled) { audio.stop(); onBack(); } };
    audio.play('sfx-chime'); setTimeout(() => audio.play('m-level-up'), 500);
  }
  return { render, levelUp, get last() { return last; }, relayout: () => !$('map').hidden && render() };
}
