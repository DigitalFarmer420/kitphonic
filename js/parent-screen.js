// Grown-ups area, behind the map's press-and-hold gear gate. Progress summary + settings (saved on this device).
import { parentSummary, STATE_LABEL } from './parent.js';
import { GPC } from './progress.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nice = skill => { const [k, v] = skill.split(':'); return k === 'sound' ? `“${GPC[v]?.g ?? v}” sound` : k === 'star' ? `star word “${v}”` : k === 'blend' ? `reading words (${v})` : skill; };
export const SETTING_UI = [
  { key: 'sessionMinutes', label: 'Session length', opts: [[5, '5 min'], [7, '7 min'], [10, '10 min']] },
  { key: 'audioSpeed', label: 'Kit’s talking speed', opts: [['slow', 'Slower'], ['normal', 'Normal'], ['fast', 'Faster']] },
  { key: 'reducedMotion', label: 'Reduce motion', opts: [['auto', 'Like device'], ['on', 'On'], ['off', 'Off']] },
  { key: 'floatMode', label: 'Floating letters say', opts: [['sound', 'Sound /m/'], ['name', 'Name “em”']] },
];

export function createParentScreen({ settings, getResponses, audio, onClose, onReset, tip }) {
  function seg({ key, label, opts }) {
    const cur = settings.get(key);
    return `<div class="prow"><div class="plabel">${label}</div><div class="seg" role="radiogroup" aria-label="${esc(label)}">${opts.map(([v, t]) =>
      `<button role="radio" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}" data-k="${key}" data-v="${v}">${t}</button>`).join('')}</div></div>`;
  }
  function render() {
    const s = parentSummary(getResponses());
    const chip = x => `<span class="pchip ${x.state}" title="${STATE_LABEL[x.state]}">${esc(x.skill.startsWith('sound:') ? (GPC[x.id]?.g ?? x.id) : x.id)}</span>`;
    $('pa-body').innerHTML = `
      <p class="psum">Stop ${s.stop.index} of ${s.stop.of} · ${s.sessionsThisWeek} session${s.sessionsThisWeek === 1 ? '' : 's'} this week</p>
      <div class="pcard"><h3>Progress</h3>
        <p>On the map: stop <b>${s.stop.index}</b> of ${s.stop.of} (<b>${esc(s.stop.label)}</b>)</p>
        <p>This week: <b>${s.sessionsThisWeek}</b> sessions · about <b>${s.minutesThisWeek}</b> min</p>
        <p>Words read: <b>${s.wordsRead}</b> · sentences: <b>${s.sentences}</b></p>
        <div class="plabel">Sounds</div><div class="pchips">${s.sounds.map(chip).join('') || '<i>none yet</i>'}</div>
        <div class="plabel">Star words</div><div class="pchips">${s.stars.map(chip).join('') || '<i>none yet</i>'}</div>
        <div class="legend"><span class="pchip practicing">practicing</span><span class="pchip secure">secure</span><span class="pchip mastered">mastered</span><span class="pchip review-due">review due</span></div>
        ${s.needsPractice.length ? `<p class="pnote">Kit will bring these back: ${s.needsPractice.map(nice).map(esc).join(', ')}.</p>` : ''}
      </div>
      <div class="pcard"><h3>Settings</h3>${SETTING_UI.map(seg).join('')}
        <div class="prow"><div class="plabel">Speech recognition</div><div class="seg"><button disabled>Coming later</button></div></div>
      </div>
      <div class="pcard"><h3>Sound</h3><p>${esc(tip)}</p><button class="pbtn" id="pa-test">🔈 Play a test sound</button></div>
      <div class="pcard"><h3>Start over</h3><p>Clears progress saved on this device. Settings are kept.</p>
        <button class="pbtn warn" id="pa-reset">Hold to clear progress</button></div>
      <p class="pfoot">Everything stays on this device. No accounts, no ads, no tracking.</p>`;
    $('pa-body').querySelectorAll('.seg button[data-k]').forEach(b => b.onclick = () => {
      const k = b.dataset.k, v = typeof settings.get(k) === 'number' ? +b.dataset.v : b.dataset.v; settings.set(k, v); render(); });
    $('pa-test').onclick = () => audio.play('sfx-chime');
    holdButton($('pa-reset'), 2000, () => { onReset(); render(); });
  }
  function holdButton(b, ms, done) {
    let t = null; const up = () => { clearTimeout(t); t = null; b.classList.remove('holding'); };
    b.onpointerdown = e => { e.preventDefault(); b.classList.add('holding'); t = setTimeout(() => { up(); done(); b.textContent = 'Progress cleared'; }, ms); };
    b.onpointerup = b.onpointerleave = b.onpointercancel = up;
  }
  $('pa-close').onclick = () => { audio.stop(); onClose(); };
  return { open() { render(); $('pa-body').scrollTop = 0; } };
}
