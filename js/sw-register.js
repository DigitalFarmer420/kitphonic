// Register sw.js only for the static site. The Capacitor wrapper and local harnesses stay on the network.
// Same rule as cachePrefixFor() in sw.js (KP-QA-011); tests/sw.test.mjs checks they agree.
export function cachePrefixFor(scopeUrl) {
  return `kitphonic:${new URL(scopeUrl).pathname}:`;
}

const LEGACY = /^kitphonic-[0-9a-f]+$/;
const MARKER_PREFIX = 'kitphonic-killswitch:';
const LEGACY_CLIENTS_PREFIX = 'kitphonic-legacy-clients:';
export function legacyClientsNameFor(scopeUrl) {
  return LEGACY_CLIENTS_PREFIX + new URL(scopeUrl).pathname;
}

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
    if (name === legacyClientsNameFor(base) || name.startsWith(prefix) || await legacyOwned(store, name, base)) mine.push(name);
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

// Screens that mean an activity is running. Detected from the DOM (.screen[hidden]),
// which js/app.js already toggles in show(). We do not edit app.js; we observe that effect.
export const ACTIVITY_SCREENS = Object.freeze(['word', 'letters', 'lesson', 'star', 'sentence', 'family']);

export function visibleScreenId(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  for (const el of doc.querySelectorAll('.screen')) {
    if (!el.hidden) return el.id || null;
  }
  return null;
}

export function activityIsRunning(doc) {
  const id = visibleScreenId(doc);
  return !!id && ACTIVITY_SCREENS.includes(id);
}

export function maybeReloadWhenIdle(api, doc) {
  if (!api || !api.reloadPending) return false;
  if (typeof api.deferReload === 'function') {
    try { if (api.deferReload() === true) return false; }
    catch { /* a broken hook must not block an idle reload */ }
  } else if (activityIsRunning(doc)) return false;
  return api.reloadIfPending();
}

function observeIdleReload(api, doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function' || typeof MutationObserver !== 'function') return () => {};
  const screens = doc.querySelectorAll('.screen');
  if (!screens.length) return () => {};
  const check = () => maybeReloadWhenIdle(api, doc);
  const obs = new MutationObserver(check);
  for (const el of screens) {
    try { obs.observe(el, { attributes: true, attributeFilter: ['hidden'] }); }
    catch { /* a non-Element stand-in in tests */ }
  }
  return () => obs.disconnect();
}

export const SW_UPDATE_READY = 'kitphonic:sw-update-ready';
export const SW_RELOAD_PENDING = 'kitphonic:sw-reload-pending';
export const RELOAD_GUARD_KEY = 'kitphonic:sw-reloaded';

function exposeSwUpdate(api) {
  const root = globalThis;
  if (root.kitphonic && typeof root.kitphonic === 'object') root.kitphonic.swUpdate = api;
  else root.kitphonic = { swUpdate: api };
  return api;
}

const announced = new WeakSet();
const applying = new WeakMap();

function defaultStorage() {
  try { return globalThis.sessionStorage; }
  catch { return undefined; }
}

function consumeReloadGuard(storage) {
  if (!storage || typeof storage.getItem !== 'function') return false;
  try {
    if (storage.getItem(RELOAD_GUARD_KEY) !== '1') return false;
    storage.removeItem(RELOAD_GUARD_KEY);
    return true;
  } catch { return false; }
}

function markReloadGuard(storage) {
  if (!storage || typeof storage.setItem !== 'function') return;
  try { storage.setItem(RELOAD_GUARD_KEY, '1'); } catch { /* private mode */ }
}

// Shared single-reload path for apply() and for every already-controlled tab.
// First install (no controller at watch start) never reloads on controllerchange.
// sessionStorage breaks a reload loop: after our own reload, a delayed
// controllerchange for the same controller is ignored; a later update, with a
// different controller, still reloads. No MessageChannel (#31).
export function createReloadController({
  serviceWorker,
  location: loc = globalThis.location,
  target = globalThis.window || globalThis,
  storage = defaultStorage(),
  hadController,
  api,
} = {}) {
  const controllerAtStart = serviceWorker && serviceWorker.controller;
  const startedWithController = hadController ?? !!controllerAtStart;
  const justReloaded = consumeReloadGuard(storage);
  let reloading = false;

  function deferring() {
    if (api && typeof api.deferReload === 'function') {
      try { return api.deferReload() === true; }
      catch { return false; }
    }
    return false;
  }

  function doReload() {
    if (reloading) return false;
    reloading = true;
    markReloadGuard(storage);
    if (loc && typeof loc.reload === 'function') loc.reload();
    return true;
  }

  function requestReload() {
    if (reloading) return false;
    if (justReloaded && serviceWorker && serviceWorker.controller === controllerAtStart) return false;
    if (deferring()) {
      if (api) {
        const already = !!api.reloadPending;
        api.reloadPending = true;
        if (!already && target && typeof target.dispatchEvent === 'function') {
          target.dispatchEvent(new CustomEvent(SW_RELOAD_PENDING));
        }
      }
      return false;
    }
    return doReload();
  }

  function reloadIfPending() {
    if (!api || !api.reloadPending || reloading) return false;
    api.reloadPending = false;
    return doReload();
  }

  let listening = false;
  if (startedWithController && serviceWorker && typeof serviceWorker.addEventListener === 'function') {
    serviceWorker.addEventListener('controllerchange', requestReload);
    listening = true;
  }

  return { requestReload, reloadIfPending, doReload, startedWithController, listening };
}

// Posts { type: 'SKIP_WAITING' } to the waiting worker. The shared reload
// controller reloads once on controllerchange (including sibling tabs that
// only listened). A second apply() while one is in flight does not post again.
export function applySwUpdate(reg, { serviceWorker, location: loc = globalThis.location, target, storage, reloader } = {}) {
  const waiting = reg && reg.waiting;
  if (!waiting || typeof waiting.postMessage !== 'function') return Promise.resolve(false);
  const inflight = applying.get(reg);
  if (inflight) return inflight;

  let resolve;
  const done = new Promise(r => { resolve = r; });
  applying.set(reg, done);

  const run = reloader || createReloadController({ serviceWorker, location: loc, target, storage });
  const onChange = () => {
    if (serviceWorker && typeof serviceWorker.removeEventListener === 'function') {
      serviceWorker.removeEventListener('controllerchange', onChange);
    }
    run.requestReload();
    resolve(true);
  };
  if (serviceWorker && typeof serviceWorker.addEventListener === 'function') {
    serviceWorker.addEventListener('controllerchange', onChange);
  }
  waiting.postMessage({ type: 'SKIP_WAITING' });
  return done;
}

// Watch a registration for a waiting update and tell the page, with no UI.
// Dispatches window CustomEvent kitphonic:sw-update-ready when:
//   - a worker is already waiting on this registration, or
//   - updatefound -> installed while a controller exists (an update, not the first install).
// Exposes window.kitphonic.swUpdate = { ready, apply(), deferReload, reloadPending, reloadIfPending() },
// merging onto an existing namespace.
export function watchForUpdate(reg, {
  serviceWorker,
  location: loc = globalThis.location,
  target = globalThis.window || globalThis,
  storage,
  document: doc = globalThis.document,
} = {}) {
  if (!reg) return null;

  let reloader;
  const api = exposeSwUpdate({
    get ready() { return !!(reg.waiting && reg.waiting.state !== 'redundant'); },
    apply() { return applySwUpdate(reg, { serviceWorker, location: loc, target, storage, reloader }); },
    deferReload: () => activityIsRunning(doc),
    reloadPending: false,
    reloadIfPending() { return reloader.reloadIfPending(); },
  });
  api._document = doc;
  reloader = createReloadController({
    serviceWorker, location: loc, target, storage, api,
    hadController: !!(serviceWorker && serviceWorker.controller),
  });
  observeIdleReload(api, doc);

  const announce = worker => {
    const waiting = worker || reg.waiting;
    if (!waiting) return;
    if (announced.has(waiting)) return;
    announced.add(waiting);
    if (target && typeof target.dispatchEvent === 'function') {
      target.dispatchEvent(new CustomEvent(SW_UPDATE_READY));
    }
  };

  if (reg.waiting) announce(reg.waiting);

  const onInstalled = worker => {
    if (!worker) return;
    const check = () => {
      if (worker.state === 'installed' && serviceWorker && serviceWorker.controller) announce(worker);
    };
    if (typeof worker.addEventListener === 'function') worker.addEventListener('statechange', check);
    check();
  };
  if (typeof reg.addEventListener === 'function') {
    reg.addEventListener('updatefound', () => onInstalled(reg.installing));
  }
  if (reg.installing) onInstalled(reg.installing);
  return api;
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
export function registerServiceWorker({ navigator: nav = globalThis.navigator, location: loc = globalThis.location, capacitor = !!globalThis.Capacitor, caches: store = globalThis.caches, performance: perf = globalThis.performance, settleMs, target, document: doc } = {}) {
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
    nav.serviceWorker.register(script.href, { type: 'module', scope: scope.href, updateViaCache: 'none' })
      .then(reg => watchForUpdate(reg, { serviceWorker: nav.serviceWorker, location: loc, target, document: doc }))
      .catch(() => {});
  } catch { return false; }
  return true;
}
