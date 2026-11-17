// Ghost hand (design notes 13/18): a 👆 that demonstrates the gesture on the first try and again after idle.
// Points are stage px inside `host`. Reduced motion: the hand appears at the first point only, then fades.
// The idle timer waits out the demonstration. Restarting it every 5 s used to cut the ~9 s trace short.
export const centerIn = (node, host, scale) => { const a = node.getBoundingClientRect(), b = host.getBoundingClientRect(); return [(a.left + a.width / 2 - b.left) / scale, (a.top + a.height / 2 - b.top) / scale]; };
export function hintWait(now, playingUntil, idleMs) {
  const idle = Math.max(0, Number(idleMs) || 0);
  const left = Math.max(0, (Number(playingUntil) || 0) - (Number(now) || 0));
  return left + idle;
}
export function createGhostHand({ host, reduced = () => false, idleMs = 5000, schedule = setTimeout, clear = clearTimeout, now = () => Date.now() }) {
  let h = null, timers = [], idleT = 0, pathFn = null, opts = {}, playingUntil = 0;
  const place = ([x, y]) => { h.style.left = x + 'px'; h.style.top = y + 'px'; };
  const hide = () => { timers.forEach(clear); timers = []; playingUntil = 0; h?.remove(); h = null; };
  function play(points, { stepMs = 900 } = {}) {
    hide(); if (!points?.length) return 0;
    h = document.createElement('div'); h.className = 'ghosthand emoji'; h.textContent = '👆'; h.setAttribute('aria-hidden', 'true');
    h.style.pointerEvents = 'none'; h.style.userSelect = 'none'; h.style.webkitUserSelect = 'none'; h.style.webkitTouchCallout = 'none'; h.style.touchAction = 'none';
    const swallow = ev => ev.preventDefault();
    h.addEventListener('touchstart', swallow, { passive: false });
    h.addEventListener('touchmove', swallow, { passive: false });
    h.addEventListener('selectstart', swallow);
    h.addEventListener('contextmenu', swallow);
    h.style.transitionDuration = Math.min(900, stepMs) + 'ms'; place(points[0]); host.append(h);
    const dur = reduced() ? 1500 : 900 + points.length * stepMs;
    playingUntil = now() + dur;
    if (reduced()) { timers.push(schedule(hide, 1500)); return dur; }
    points.slice(1).forEach((p, i) => timers.push(schedule(() => h && place(p), 500 + i * stepMs)));
    timers.push(schedule(hide, dur));
    return dur;
  }
  const api = {
    play, hide,
    // first: show now; then every interaction calls poke() to restart the idle timer
    start(fn, { now: showNow = true, stepMs } = {}) { pathFn = fn; opts = stepMs ? { stepMs } : {}; if (showNow) play(fn(), opts); api.poke(); },
    poke() {
      clear(idleT);
      if (!pathFn) return;
      idleT = schedule(() => {
        if (!pathFn) return;
        if (playingUntil > now()) { api.poke(); return; } // the demonstration is still walking the letter
        const p = pathFn();
        if (p) play(p, opts);
        api.poke();
      }, hintWait(now(), playingUntil, idleMs));
    },
    stop() { clear(idleT); pathFn = null; hide(); },
  };
  return api;
}
