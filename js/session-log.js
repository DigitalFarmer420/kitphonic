// Opt-in device log for a real iPad: ?sessionlog=1. Nothing here runs unless createSessionLog /
// observeAudioContexts / watchStorage are called, and app.js calls them only when the flag is on.
export const SESSION_LOG_CAP = 200;
const VIEW_LINES = 8;

export function sessionLogEnabled(search = '') {
  const q = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(q).get('sessionlog') === '1';
}

const stampOf = (t) => (t instanceof Date ? t.toISOString() : String(t));

function targetLabel(node) {
  let el = node;
  if (el && el.nodeType && el.nodeType !== 1) el = el.parentElement;
  for (; el; el = el.parentElement) {
    if (el.id) return `#${el.id}`;
    const raw = typeof el.className === 'string' ? el.className : (el.className?.baseVal ?? '');
    const cls = String(raw).trim().split(/\s+/).filter(Boolean)[0];
    if (cls) return `.${cls}`;
    if (!el.parentElement) break;
  }
  const tag = node?.tagName || node?.parentElement?.tagName;
  return tag ? String(tag).toLowerCase() : 'unknown';
}

export function createSessionLog(doc, { cap = SESSION_LOG_CAP, now = () => new Date(), win } = {}) {
  const host = win ?? doc.defaultView ?? globalThis;
  const entries = [];
  let view = null;
  const format = () => entries.map(e => `${e.t}\t${e.kind}\t${e.detail}`).join('\n');
  const paint = () => {
    if (!view) return;
    view.textContent = entries.slice(-VIEW_LINES).map(e => {
      const clock = e.t.length >= 23 ? e.t.slice(11, 23) : e.t;
      return `${clock} ${e.kind} ${e.detail}`.trimEnd();
    }).join('\n');
  };
  const push = (kind, detail = '') => {
    entries.push({ t: stampOf(now()), kind, detail: detail == null ? '' : String(detail) });
    if (entries.length > cap) entries.splice(0, entries.length - cap);
    paint();
  };

  const root = doc.createElement('div');
  root.id = 'kit-sessionlog';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Session log');
  root.style.pointerEvents = 'none';
  const bar = doc.createElement('div');
  bar.className = 'bar';
  bar.style.pointerEvents = 'none';
  const copyBtn = doc.createElement('button');
  copyBtn.id = 'kit-sessionlog-copy';
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy';
  copyBtn.style.pointerEvents = 'auto';
  const clearBtn = doc.createElement('button');
  clearBtn.id = 'kit-sessionlog-clear';
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear';
  clearBtn.style.pointerEvents = 'auto';
  view = doc.createElement('pre');
  view.id = 'kit-sessionlog-view';
  view.style.pointerEvents = 'none';
  bar.append(copyBtn, clearBtn);
  root.append(bar, view);
  const style = doc.createElement('style');
  style.id = 'kit-sessionlog-style';
  style.textContent = SESSION_LOG_CSS;
  (doc.head || doc.documentElement).append(style);
  doc.body.append(root);

  const markCopied = () => {
    copyBtn.textContent = 'Copied';
    host.setTimeout?.(() => { copyBtn.textContent = 'Copy'; }, 1200);
  };
  const fallbackCopy = (text) => {
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.pointerEvents = 'none';
    doc.body.append(ta);
    try { ta.select?.(); doc.execCommand?.('copy'); } catch { /* the button still shows the attempt */ }
    ta.remove?.();
  };
  copyBtn.addEventListener('click', () => {
    const text = format();
    const clip = host.navigator?.clipboard;
    if (clip?.writeText) {
      Promise.resolve(clip.writeText(text)).then(markCopied, () => { fallbackCopy(text); markCopied(); });
      return;
    }
    fallbackCopy(text);
    markCopied();
  });
  clearBtn.addEventListener('click', () => { entries.length = 0; paint(); });

  doc.addEventListener('visibilitychange', () => push('visibility', doc.visibilityState || ''), { capture: true, passive: true });
  host.addEventListener?.('pagehide', () => push('pagehide', ''));
  host.addEventListener?.('pageshow', (e) => push('pageshow', e?.persisted ? 'persisted' : ''));
  doc.addEventListener('pointerdown', (e) => push('tap', `${targetLabel(e.target)} ${e.pointerType || 'unknown'}`), { capture: true, passive: true });
  push('visibility', doc.visibilityState || 'visible');

  return {
    push,
    phase: (from, next) => push('hello', `${from}->${next}`),
    audio: (state) => push('audio', state ?? ''),
    screen: (id) => push('screen', id ?? ''),
    tap: (target, pointerType) => push('tap', `${target} ${pointerType || 'unknown'}`),
    storage: (op, err, key) => {
      const name = err?.name || 'Error';
      const msg = err?.message || err || '';
      push('storage', key == null || key === '' ? `${op}: ${name} ${msg}` : `${op} ${key}: ${name} ${msg}`);
    },
    clear() { entries.length = 0; paint(); },
    text: format,
    get entries() { return entries.map(e => ({ ...e })); },
    root,
    copyButton: copyBtn,
    clearButton: clearBtn,
    view,
  };
}

// audio.js does not expose the AudioContext (only `unlocked`, a boolean). When the flag is on, wrap the
// constructors before createAudio() and listen for statechange. When the flag is off this is never called.
export function observeAudioContexts(win, log) {
  if (!win || !log || typeof log.audio !== 'function') return false;
  const originals = new WeakSet();
  let patched = false;
  const patch = (name) => {
    const Native = win[name];
    if (typeof Native !== 'function' || originals.has(Native)) return;
    originals.add(Native);
    function SessionLogAudioContext(...args) {
      const ctx = new Native(...args);
      let last = '';
      const note = () => {
        const state = ctx.state || '';
        if (state === last) return;
        last = state;
        log.audio(state);
      };
      try { ctx.addEventListener?.('statechange', note); } catch { /* a host without events still gets the snapshot below */ }
      note();
      return ctx;
    }
    SessionLogAudioContext.prototype = Native.prototype;
    try { Object.setPrototypeOf(SessionLogAudioContext, Native); } catch { /* the instance is what unlock() uses */ }
    win[name] = SessionLogAudioContext;
    patched = true;
  };
  patch('AudioContext');
  patch('webkitAudioContext');
  if (!patched) log.audio('unavailable');
  return patched;
}

// Wraps the Storage object app.js passes into settings, the response store, and seen.
// Logs getItem/setItem/removeItem/clear failures and rethrows so the callers keep their own catches.
export function watchStorage(storage, log) {
  if (!storage || !log) return storage;
  const wrapped = {};
  for (const name of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
    if (typeof storage[name] !== 'function') continue;
    wrapped[name] = (...args) => {
      try { return storage[name](...args); }
      catch (err) { log.storage(name, err, args[0]); throw err; }
    };
  }
  if (typeof storage.length === 'number') Object.defineProperty(wrapped, 'length', { get: () => storage.length });
  return wrapped;
}

const SESSION_LOG_CSS = `
#kit-sessionlog{position:fixed;z-index:40;left:8px;bottom:8px;width:min(280px,calc(100vw - 16px));max-height:168px;display:flex;flex-direction:column;gap:4px;pointer-events:none;font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:#3A2E28}
#kit-sessionlog .bar{display:flex;gap:6px;pointer-events:none}
#kit-sessionlog button{pointer-events:auto;font:inherit;font-weight:700;background:#fff;color:#3A2E28;border:2px solid #EADCC6;border-radius:8px;padding:4px 8px;min-height:28px;touch-action:manipulation}
#kit-sessionlog button:focus-visible{outline:4px solid #4E97C9;outline-offset:3px}
#kit-sessionlog pre{pointer-events:none;margin:0;white-space:pre-wrap;word-break:break-word;overflow:hidden;background:rgba(255,248,236,.92);border:1px solid #EADCC6;border-radius:8px;padding:4px 6px;max-height:124px}
`;
