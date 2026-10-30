// Grown-ups area, behind the map's press-and-hold gear gate. Progress summary + settings (saved on this device).
import { parentSummary, STATE_LABEL } from './parent.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _nice = skill => { const [k, v] = skill.split(':'); return k === 'sound' ? `“${GPC[v]?.g ?? v}” sound` : k === 'star' ? `star word “${v}”` : k === 'blend' ? `reading words (${v})` : skill; };
export const SETTING_UI = [
  { key: 'sessionMinutes', label: 'Session length', opts: [[5, '5 min'], [7, '7 min'], [10, '10 min']] },
  { key: 'audioSpeed', label: 'Kit’s talking speed', opts: [['slow', 'Slower'], ['normal', 'Normal'], ['fast', 'Faster']] },
  { key: 'reducedMotion', label: 'Reduce motion', opts: [['auto', 'Like device'], ['on', 'On'], ['off', 'Off']] },
  { key: 'floatMode', label: 'Floating letters say', opts: [['sound', 'Sound /m/'], ['name', 'Name “em”']], hint: 'Sounds first is best for early readers.' },
];

export function createParentScreen({ settings, getResponses, audio, onClose, onReset, tip }) {
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
          <div class="pstat"><b>${s.wordsRead}</b><span>words read</span></div>
        </div>
        <div class="pcard"><h2>Sounds</h2><div class="ptiles">${s.soundTiles.map(tile).join('')}</div>
          <h3>Star words</h3><div class="ptiles">${s.starTiles.map(tile).join('')}</div>
          <div class="plegend"><span><i class="practicing"></i>Practicing</span><span><i class="secure"></i>Secure</span><span><i class="mastered"></i>Mastered</span><span><i class="review-due"></i>Review due</span><span><i class="new"></i>Not yet</span></div>
          ${s.tryAtHome ? `<div class="pnote"><b>Try at home:</b> ${esc(s.tryAtHome.text)}</div>` : ''}
        </div>
      </div>
      <div class="pcol">
        <div class="pcard"><h2>Settings</h2>${SETTING_UI.map(seg).join('')}
          <div class="pnote ptip">${esc(tip)} <button class="plink" id="pa-test">Play a test sound</button></div>
          <div id="pa-reset-wrap"><button class="preset" id="pa-reset">Reset progress…</button><div class="phint">Asks again before erasing anything.</div></div>
        </div>
      </div>`;
    $('pa-body').querySelectorAll('.seg button[data-k]').forEach(b => b.onclick = () => {
      const k = b.dataset.k, v = typeof settings.get(k) === 'number' ? +b.dataset.v : b.dataset.v; settings.set(k, v); render(); });
    $('pa-test').onclick = () => audio.play('sfx-chime');
    $('pa-reset').onclick = () => { // confirm step (design: "Asks again before erasing anything")
      $('pa-reset-wrap').innerHTML = `<div class="pconfirm"><p>Erase all progress saved on this device? Settings are kept.</p>
        <div class="pconfirm-row"><button class="pcancel" id="pa-no">Keep progress</button><button class="perase" id="pa-yes">Erase progress</button></div></div>`;
      $('pa-no').onclick = render; $('pa-yes').onclick = () => { onReset(); render(); };
    };
  }
  $('pa-close').onclick = () => { audio.stop(); onClose(); };
  return { open() { render(); $('pa-body').scrollTop = 0; } };
}
