// Grown-ups area, behind the map's press-and-hold gear gate. Progress summary + settings (saved on this device).
import { parentSummary, STATE_LABEL } from './parent.js';
import { VERSION } from './version.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _nice = skill => { const [k, v] = skill.split(':'); return k === 'sound' ? `“${GPC[v]?.g ?? v}” sound` : k === 'star' ? `star word “${v}”` : k === 'blend' ? `reading words (${v})` : skill; };
export const SETTING_UI = [
  { key: 'sessionMinutes', label: 'Session length', opts: [[5, '5 min'], [7, '7 min'], [10, '10 min']] },
  { key: 'audioSpeed', label: 'Kit’s talking speed', opts: [['slow', 'Slower'], ['normal', 'Normal'], ['fast', 'Faster']] },
  { key: 'reducedMotion', label: 'Reduce motion', opts: [['auto', 'Like device'], ['on', 'On'], ['off', 'Off']] },
  { key: 'floatMode', label: 'Floating letters say', opts: [['sound', 'Sound /m/'], ['name', 'Name “em”']], hint: 'Sounds first is best for early readers.' },
];

export function createParentScreen({ settings, getResponses, audio, onClose, onReset, onSkip = () => {}, tip }) {
  function seg({ key, label, opts, hint }) {
    const cur = settings.get(key);
    return `<div class="prow"><div class="plabel">${label}</div><div class="seg" role="radiogroup" aria-label="${esc(label)}">${opts.map(([v, t]) =>
      `<button role="radio" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}" data-k="${key}" data-v="${v}">${t}</button>`).join('')}</div>${hint ? `<div class="phint">${hint}</div>` : ''}</div>`;
  }
  const tile = t => `<span class="ptile L ${t.state}${t.ex ? ' ex' : ''}" title="${esc(t.text)}${t.ex ? ' as in ' + esc(t.ex) : ''}: ${STATE_LABEL[t.state]}">${esc(t.text)}${t.ex ? `<small>${esc(t.ex)}</small>` : ''}</span>`;
  function render() {
    const s = parentSummary(getResponses()), c = s.current;
    $('pa-body').innerHTML = `
      <div class="pcol">
        <div class="pcard psum">
          <div class="pstop L">${esc(c?.label ?? '⭐')}</div>
          <div><div class="pbig">Stop ${s.stop.index} of ${s.stop.of}${c ? ` · ${esc(c.learning)}` : ' · all done!'}</div>
          <div class="pmuted">${s.next ? `Next: ${esc(s.next.next)}` : 'Next: more sounds are coming'}</div></div>
        </div>
        <div class="pstats">
          <div class="pstat"><b>${s.sessionsThisWeek}</b><span>sessions this week</span></div>
          <div class="pstat"><b>${s.minutesThisWeek}</b><span>minutes</span></div>
          <div class="pstat"><b>${s.wordsRead}</b><span>words read alone${s.wordsWithKit ? ` · +${s.wordsWithKit} with Kit` : ''}</span></div>
        </div>
        <div class="pcard"><h2>Sounds</h2><div class="ptiles">${s.soundTiles.map(tile).join('')}</div>
          <h3>Star words</h3><div class="ptiles">${s.starTiles.map(tile).join('')}</div>
          <div class="plegend"><span><i class="practicing"></i>Practicing</span><span><i class="secure"></i>Secure</span><span><i class="mastered"></i>Mastered</span><span><i class="review-due"></i>Review due</span><span><i class="new"></i>Not yet</span></div>
          ${s.tryAtHome ? `<div class="pnote"><b>Try at home:</b> ${esc(s.tryAtHome.text)}</div>` : ''}
          ${s.troubleSpots.length ? `<div class="pnote pwatch"><b>Watch for:</b> ${s.troubleSpots.map(esc).join('; ')}.</div>` : ''}
          <div class="pmuted pmode">Letters say their ${s.letterMode === 'names' ? '<b>names</b> (dots say their sounds)' : '<b>sounds</b> (names come once two-letter words are secure)'}.</div>
        </div>
      </div>
      <div class="pcol">
        <div class="pcard pa-settings" aria-label="Settings"><h2>Settings</h2>${SETTING_UI.map(seg).join('')}
          <div class="pnote ptip">${esc(tip)} <button class="plink" id="pa-test">Play a test sound</button></div>
          ${c ? `<div id="pa-skip-wrap"><button class="preset" id="pa-skip">Skip this step…</button><div class="phint">If your child already knows “${esc(c.label)}”. Asks first; nothing is erased.</div></div>` : ''}
          <div id="pa-reset-wrap"><button class="preset" id="pa-reset">Reset progress…</button><div class="phint">Asks again before erasing anything.</div></div>
        </div>
        <div class="pfoot" id="pa-version">Kitphonic ${esc(VERSION)} · progress is saved on this device only</div>
      </div>`;
    $('pa-body').querySelectorAll('.seg button[data-k]').forEach(b => b.onclick = () => {
      const k = b.dataset.k, v = typeof settings.get(k) === 'number' ? +b.dataset.v : b.dataset.v; settings.set(k, v); render(); });
    $('pa-test').onclick = () => audio.play('sfx-chime');
    if (c) $('pa-skip').onclick = () => { // rc7: a grown-up can move Kit on one step (e.g. progress lost on an older version)
      $('pa-skip-wrap').innerHTML = `<div class="pconfirm"><p>Mark “${esc(c.label)}” as done and move Kit on to the next step? Kit still reviews it later.</p>
        <div class="pconfirm-row"><button class="pcancel" id="pa-skip-no">Stay here</button><button class="perase" id="pa-skip-yes">Skip this step</button></div></div>`;
      $('pa-skip-no').onclick = render; $('pa-skip-yes').onclick = () => { onSkip(); render(); };
    };
    $('pa-reset').onclick = () => { // confirm step (design: "Asks again before erasing anything")
      $('pa-reset-wrap').innerHTML = `<div class="pconfirm"><p>Erase all progress saved on this device? Settings are kept.</p>
        <div class="pconfirm-row"><button class="pcancel" id="pa-no">Keep progress</button><button class="perase" id="pa-yes">Erase progress</button></div></div>`;
      $('pa-no').onclick = render; $('pa-yes').onclick = () => { onReset(); render(); };
    };
    fit();
  }
  // Last whole settings row, card, or confirm wrap. max-height ends on that edge so a control
  // is not left half-visible at the fold or in the bottom inset.
  const EPS = 0.5;
  const padOf = side => parseFloat(getComputedStyle($('parent'))['padding' + side]) || 0;
  const overflows = el => /(auto|scroll)/.test(getComputedStyle(el).overflowY);
  function scrollports() {
    const body = $('pa-body');
    const cols = [...body.querySelectorAll(':scope > .pcol')].filter(overflows);
    return cols.length ? cols : [body];
  }
  function portOf(el) {
    for (let n = el.parentElement; n; n = n.parentElement) if (overflows(n)) return n;
    return $('pa-body');
  }
  function speedFits() {
    const btn = document.querySelector('#parent button[data-k="audioSpeed"]');
    if (!btn) return true;
    const row = btn.closest('.prow');
    const port = portOf(btn).getBoundingClientRect();
    const limit = Math.min(port.bottom, innerHeight - padOf('Bottom'));
    const bits = [row.querySelector('.plabel'), ...row.querySelectorAll('button')];
    return bits.every(el => {
      const r = el.getBoundingClientRect();
      return r.height > 1 && r.top >= port.top - EPS && r.bottom <= limit + EPS;
    });
  }
  function syncFade(port) {
    const on = port.scrollHeight > port.clientHeight + 1;
    let fade = port.querySelector(':scope > .pa-fade');
    if (!on) { fade?.remove(); return; }
    if (!fade) {
      fade = document.createElement('div');
      fade.className = 'pa-fade';
      fade.setAttribute('aria-hidden', 'true');
      port.append(fade);
    }
  }
  function foldPort(port) {
    port.style.maxHeight = '';
    const pr = port.getBoundingClientRect();
    const safeBottom = innerHeight - padOf('Bottom');
    const limit = Math.min(pr.bottom, safeBottom);
    const straddles = (r, edge) => r.top < edge - EPS && r.bottom > edge + EPS;
    const cut = [...port.querySelectorAll('button')].some(el => {
      const r = el.getBoundingClientRect();
      if (r.height < 1 || r.bottom <= pr.top + EPS || r.top >= pr.bottom - EPS) return false;
      return straddles(r, pr.bottom) || straddles(r, safeBottom);
    });
    if (!cut) { syncFade(port); return; }
    let best = null;
    for (const el of port.querySelectorAll('.prow, .pcard, [id^="pa-"][id$="-wrap"]')) {
      const r = el.getBoundingClientRect();
      if (r.height < 1 || r.top < pr.top - EPS || r.bottom > limit + EPS) continue;
      if (best == null || r.bottom > best) best = r.bottom;
    }
    if (best != null) {
      const h = best - pr.top;
      if (h >= 80 && h < pr.height - EPS) port.style.maxHeight = (Math.round(h * 100) / 100) + 'px';
    }
    syncFade(port);
  }
  function fit(opts = {}) {
    const parent = $('parent');
    const body = $('pa-body');
    if (!parent || parent.hidden || !body?.firstElementChild) return;
    const saved = scrollports().map(p => p.scrollTop);
    const zero = () => scrollports().forEach(p => { p.scrollTop = 0; });
    zero();
    for (const p of body.querySelectorAll('.pcol')) p.style.maxHeight = '';
    body.style.maxHeight = '';
    const safeH = parent.clientHeight - padOf('Top') - padOf('Bottom');
    parent.classList.toggle('pa-fit', safeH < 420);
    const stage = $('stage');
    const wide = stage.classList.contains('short') || stage.classList.contains('tall');
    parent.classList.remove('pa-stack');
    if (wide) {
      const bcs = getComputedStyle(body);
      const inner = body.clientHeight - (parseFloat(bcs.paddingTop) || 0) - (parseFloat(bcs.paddingBottom) || 0);
      if (inner < 80) parent.classList.add('pa-stack');
    }
    parent.classList.remove('pa-tighter');
    if (parent.classList.contains('pa-fit') && !speedFits()) parent.classList.add('pa-tighter');
    zero();
    const ports = scrollports();
    for (const p of ports) foldPort(p);
    for (const fade of [...parent.querySelectorAll('.pa-fade')]) {
      if (!ports.includes(fade.parentElement)) fade.remove();
    }
    if (!opts.resetScroll) ports.forEach((p, i) => { if (saved[i] != null) p.scrollTop = saved[i]; });
  }
  addEventListener('resize', () => fit({ resetScroll: true }));
  visualViewport?.addEventListener('resize', () => fit({ resetScroll: true }));
  new MutationObserver(() => fit({ resetScroll: true })).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  document.fonts?.ready?.then(() => fit());
  $('pa-close').onclick = () => { audio.stop(); onClose(); };
  return {
    open() { render(); fit({ resetScroll: true }); },
    fit,
  };
}
