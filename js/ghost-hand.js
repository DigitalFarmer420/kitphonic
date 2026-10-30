// Ghost hand (design notes 13/18): a 👆 that demonstrates the gesture on the first try and again after 5 s idle.
// Points are stage px inside `host`. Reduced motion: the hand appears at the first point only, then fades.
export const centerIn = (node, host, scale) => { const a = node.getBoundingClientRect(), b = host.getBoundingClientRect(); return [(a.left + a.width / 2 - b.left) / scale, (a.top + a.height / 2 - b.top) / scale]; };
export function createGhostHand({ host, reduced = () => false, idleMs = 5000 }) {
  let h = null, timers = [], idleT = 0, pathFn = null;
  const place = ([x, y]) => { h.style.left = x + 'px'; h.style.top = y + 'px'; };
  const hide = () => { timers.forEach(clearTimeout); timers = []; h?.remove(); h = null; };
  function play(points, { stepMs = 900 } = {}) {
    hide(); if (!points?.length) return;
    h = document.createElement('div'); h.className = 'ghosthand emoji'; h.textContent = '👆'; h.setAttribute('aria-hidden', 'true');
    h.style.transitionDuration = Math.min(900, stepMs) + 'ms'; place(points[0]); host.append(h);
    if (reduced()) { timers.push(setTimeout(hide, 1500)); return; }
    points.slice(1).forEach((p, i) => timers.push(setTimeout(() => h && place(p), 500 + i * stepMs)));
    timers.push(setTimeout(hide, 900 + points.length * stepMs));
  }
  const api = {
    play, hide,
    // first: show now; then every interaction calls poke() to restart the idle timer
    start(fn, { now = true } = {}) { pathFn = fn; if (now) play(fn()); api.poke(); },
    poke() { clearTimeout(idleT); if (pathFn) idleT = setTimeout(() => { const p = pathFn?.(); if (p) play(p); api.poke(); }, idleMs); },
    stop() { clearTimeout(idleT); pathFn = null; hide(); },
  };
  return api;
}
