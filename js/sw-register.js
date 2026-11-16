// Register sw.js only for the static site. The Capacitor wrapper and local harnesses stay on the network.
// Same rule as cachePrefixFor() in sw.js (KP-QA-011); tests/sw.test.mjs checks they agree.
export function cachePrefixFor(scopeUrl) {
  return `kitphonic:${new URL(scopeUrl).pathname}:`;
}

const LEGACY = /^kitphonic-[0-9a-f]+$/;

export function wantsKillSwitch({ hasServiceWorker = false, capacitor = false, protocol = '', search = '' } = {}) {
  if (!hasServiceWorker || capacitor || protocol === 'capacitor:') return false;
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('nosw') === '1';
}

// KP-QA-010: ?nosw=1 is a kill switch for this scope only. It unregisters this scope's worker and
// deletes this scope's caches (plus an unscoped legacy cache whose contents are all under this scope).
// Other scopes on the origin and saved progress are not touched. The page that ran it may still be
// controlled until it is reloaded; the next load is plain network.
export async function killServiceWorker({ navigator: nav, caches: store, scope } = {}) {
  const base = new URL(scope).href;
  const out = { unregistered: [], deleted: [] };
  const regs = nav && nav.serviceWorker && nav.serviceWorker.getRegistrations ? await nav.serviceWorker.getRegistrations() : [];
  for (const reg of regs) {
    if (reg.scope === base && await reg.unregister()) out.unregistered.push(reg.scope);
  }
  if (!store) return out;
  const prefix = cachePrefixFor(base);
  for (const name of await store.keys()) {
    let mine = name.startsWith(prefix);
    if (!mine && LEGACY.test(name)) {
      const keys = (await (await store.open(name)).keys()).map(req => (typeof req === 'string' ? req : req.url));
      mine = keys.length > 0 && keys.includes(new URL('index.html', base).href) && keys.every(url => url.startsWith(base));
    }
    if (mine && await store.delete(name)) out.deleted.push(name);
  }
  return out;
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
export function registerServiceWorker({ navigator: nav = globalThis.navigator, location: loc = globalThis.location, capacitor = !!globalThis.Capacitor, caches: store = globalThis.caches } = {}) {
  if (nav && loc && wantsKillSwitch({ hasServiceWorker: !!nav && 'serviceWorker' in nav, capacitor, protocol: loc.protocol, search: loc.search })) {
    try { killServiceWorker({ navigator: nav, caches: store, scope: new URL('../', import.meta.url).href }).catch(() => {}); }
    catch { /* nothing to clear */ }
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
