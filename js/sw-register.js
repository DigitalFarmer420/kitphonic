// Register sw.js only for the static site. The Capacitor wrapper and local harnesses stay on the network.
// Same rule as cachePrefixFor() in sw.js (KP-QA-011); tests/sw.test.mjs checks they agree.
export function cachePrefixFor(scopeUrl) {
  return `kitphonic:${new URL(scopeUrl).pathname}:`;
}

const LEGACY = /^kitphonic-[0-9a-f]+$/;
const MARKER_PREFIX = 'kitphonic-killswitch:';

// How long a ?nosw=1 pass keeps polling Cache Storage after the first delete. WebKit can surface
// an incomplete cache from an aborted install after the first keys() call, or only drop it after
// the tab reloads. registerServiceWorker reloads once on a fresh visit and uses a longer settle
// on that second pass.
export const KILL_SETTLE_MS = 2000;

export function wantsKillSwitch({ hasServiceWorker = false, capacitor = false, protocol = '', search = '' } = {}) {
  if (!hasServiceWorker || capacitor || protocol === 'capacitor:') return false;
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('nosw') === '1';
}

export function navigationType(performance = globalThis.performance) {
  try {
    const entry = performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (entry && entry.type) return entry.type;
    if (performance && performance.navigation && performance.navigation.type === 1) return 'reload';
  } catch { /* ignore */ }
  return 'navigate';
}

// One automatic reload after a fresh ?nosw=1 visit. A reload navigation is the second pass
// and must not reload again. The flag is not sticky; this is only about this document load.
export function shouldReloadAfterKill({ search = '', type = 'navigate' } = {}) {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return q.get('nosw') === '1' && type !== 'reload';
}

async function legacyOwned(store, name, base) {
  if (!LEGACY.test(name)) return false;
  const keys = (await (await store.open(name)).keys()).map(req => (typeof req === 'string' ? req : req.url));
  return keys.length > 0 && keys.includes(new URL('index.html', base).href) && keys.every(url => url.startsWith(base));
}

async function namesOwnedByScope(store, base) {
  const prefix = cachePrefixFor(base);
  const mine = [];
  for (const name of await store.keys()) {
    if (name.startsWith(MARKER_PREFIX)) continue;
    if (name.startsWith(prefix) || await legacyOwned(store, name, base)) mine.push(name);
  }
  return mine;
}

// KP-QA-010: ?nosw=1 is a kill switch for this scope only. It unregisters this scope's worker and
// deletes every cache with this scope's exact prefix (kitphonic:<scope path>:), complete or not,
// plus an unscoped legacy cache whose contents are all under this scope. Other scopes on the
// origin, unowned or mixed legacy caches, and saved progress are not touched. The function keeps
// polling for settleMs so a late-appearing incomplete cache is deleted in this same call.
export async function killServiceWorker({ navigator: nav, caches: store, scope, settleMs = 0, intervalMs = 50 } = {}) {
  const base = new URL(scope).href;
  const out = { unregistered: [], deleted: [] };
  const regs = nav && nav.serviceWorker && nav.serviceWorker.getRegistrations ? await nav.serviceWorker.getRegistrations() : [];
  for (const reg of regs) {
    if (reg.scope === base && await reg.unregister()) out.unregistered.push(reg.scope);
  }
  if (!store) return out;
  const started = Date.now();
  const seen = new Set();
  for (;;) {
    for (const name of await namesOwnedByScope(store, base)) {
      try {
        if (await store.delete(name) && !seen.has(name)) {
          seen.add(name);
          out.deleted.push(name);
        }
      } catch { /* a later pass retries */ }
    }
    if (Date.now() - started >= settleMs) break;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return out;
}

export function isKillSwitchReply(data) {
  return !!(data && data.killswitch === true);
}

// Belt and braces: if the registered or active worker is the emergency kill switch,
// the page must not auto-reload (the template already navigates at most once).
export async function isKillSwitchWorker(nav, { timeoutMs = 200 } = {}) {
  if (!nav || !nav.serviceWorker) return false;
  let worker = nav.serviceWorker.controller;
  if (!worker && nav.serviceWorker.getRegistration) {
    try {
      const reg = await nav.serviceWorker.getRegistration();
      worker = reg && (reg.active || reg.waiting || reg.installing);
    } catch { return false; }
  }
  if (!worker || typeof worker.postMessage !== 'function') return false;
  try {
    return await new Promise(resolve => {
      const ch = new MessageChannel();
      let settled = false;
      const done = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ch.port1.close(); } catch { /* already closed */ }
        try { ch.port2.close(); } catch { /* already closed */ }
        resolve(result);
      };
      const timer = setTimeout(() => done(false), timeoutMs);
      ch.port1.onmessage = event => { done(isKillSwitchReply(event.data)); };
      try { worker.postMessage({ type: 'kitphonic-killswitch' }, [ch.port2]); }
      catch { done(false); }
    });
  } catch { return false; }
}

export function shouldRegisterServiceWorker({ hasServiceWorker = false, capacitor = false, protocol = '', hostname = '', search = '' } = {}) {
  if (!hasServiceWorker || capacitor || protocol === 'capacitor:') return false;
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (q.get('nosw') === '1') return false;
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && q.get('sw') !== '1') return false;
  return true;
}

// Script and scope come from this module's URL, so /kitphonic/ and /kitphonic-dev/ each get the
// directory that contains index.html, not the origin root.
export function registerServiceWorker({ navigator: nav = globalThis.navigator, location: loc = globalThis.location, capacitor = !!globalThis.Capacitor, caches: store = globalThis.caches, performance: perf = globalThis.performance, settleMs } = {}) {
  if (nav && loc && wantsKillSwitch({ hasServiceWorker: !!nav && 'serviceWorker' in nav, capacitor, protocol: loc.protocol, search: loc.search })) {
    const willReload = typeof loc.reload === 'function' && shouldReloadAfterKill({ search: loc.search, type: navigationType(perf) });
    const wait = settleMs ?? (willReload ? 100 : KILL_SETTLE_MS);
    try {
      Promise.resolve(willReload ? isKillSwitchWorker(nav) : false)
        .then(async already => {
          await killServiceWorker({ navigator: nav, caches: store, scope: new URL('../', import.meta.url).href, settleMs: wait });
          if (willReload && !already) loc.reload();
        })
        .catch(() => {});
    } catch { /* nothing to clear */ }
    return false;
  }
  if (!nav || !loc || !shouldRegisterServiceWorker({
    hasServiceWorker: 'serviceWorker' in nav, capacitor, protocol: loc.protocol, hostname: loc.hostname, search: loc.search,
  })) return false;
  const script = new URL('../sw.js', import.meta.url);
  const scope = new URL('../', import.meta.url);
  try {
    nav.serviceWorker.register(script.href, { type: 'module', scope: scope.href, updateViaCache: 'none' }).catch(() => {});
  } catch { return false; }
  return true;
}
