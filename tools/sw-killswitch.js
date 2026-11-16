// Emergency network-only service worker. Deploy this file in place of sw.js to turn
// offline mode off for every client of THIS deployment only. It stays registered until
// the real sw.js is restored, so the page cannot re-register the template in a loop.
//
// Procedure (see RELEASE.md):
//   1. Copy this file over sw.js in the deployment that must go offline-off (prod or dev, not both
//      unless you mean to). Do not run tools/gen-sw-assets.mjs on the copy.
//   2. Publish. This worker calls skipWaiting and claims clients, so an open lesson on this
//      scope reloads instead of waiting for a cold launch.
//   3. On activate it deletes every cache named kitphonic:<this scope path>:<hash> (complete or
//      not) and any unscoped kitphonic-<hash> cache whose contents prove they belong to this
//      scope, then navigates each open client of this scope at most once. A marker cache
//      kitphonic-killswitch:<scope path> records that the navigation already happened, so a
//      reinstall or later activation does not navigate again. It does not unregister, has no
//      fetch handler, and so stays a network-only worker.
//   4. Leave it deployed until you restore the real sw.js from git and publish again. The real
//      worker then reinstalls normally.
//
// It never reads or writes saved progress. It never deletes another scope's caches, a legacy
// cache it does not own, or the marker cache. It is not registered in the Capacitor/Android
// wrapper.
//
// Registered as a module worker, same as sw.js: { type: 'module' }.

export const KITPHONIC_KILLSWITCH = true;

export function cachePrefixFor(scopeUrl) {
  return `kitphonic:${new URL(scopeUrl).pathname}:`;
}

export const LEGACY = /^kitphonic-[0-9a-f]+$/;

// Empty marker cache. It is not an app cache (name is kitphonic-killswitch:<path>, not
// kitphonic:<path>:<hash>) so app cleanup and ?nosw=1 never treat it as one.
export const MARKER_PREFIX = 'kitphonic-killswitch:';

export function markerNameFor(scopeUrl) {
  return MARKER_PREFIX + new URL(scopeUrl).pathname;
}

export async function legacyOwned(caches, name, scopeUrl) {
  if (!LEGACY.test(name)) return false;
  const keys = (await (await caches.open(name)).keys()).map(req => (typeof req === 'string' ? req : req.url));
  if (!keys.length) return false;
  const base = new URL(scopeUrl).href;
  return keys.includes(new URL('index.html', base).href) && keys.every(url => url.startsWith(base));
}

export function isAppCacheName(name, scopeUrl) {
  if (typeof name !== 'string' || name.startsWith(MARKER_PREFIX)) return false;
  return name.startsWith(cachePrefixFor(scopeUrl));
}

// Delete every cache this scope owns. Retries for settleMs so an incomplete leftover is
// removed in this same call. The marker cache is never deleted. Default settleMs is 0;
// the activate path passes a short settle.
export async function clearOwnScopeCaches(caches, scopeUrl, { settleMs = 0, intervalMs = 50 } = {}) {
  const base = new URL(scopeUrl).href;
  const deleted = [];
  const seen = new Set();
  const started = Date.now();
  for (;;) {
    for (const name of await caches.keys()) {
      const mine = isAppCacheName(name, base) || await legacyOwned(caches, name, base);
      if (!mine) continue;
      try {
        if (await caches.delete(name) && !seen.has(name)) {
          seen.add(name);
          deleted.push(name);
        }
      } catch { /* a later pass retries */ }
    }
    if (Date.now() - started >= settleMs) break;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return deleted;
}

export async function hasNavigatedFlag(caches, scopeUrl) {
  const mark = markerNameFor(scopeUrl);
  return (await caches.keys()).includes(mark);
}

export async function setNavigatedFlag(caches, scopeUrl) {
  await caches.open(markerNameFor(scopeUrl));
  return markerNameFor(scopeUrl);
}

function underScope(url, scopeUrl) {
  return typeof url === 'string' && url.startsWith(new URL(scopeUrl).href);
}

export async function activateKillSwitch(scope, { settleMs = 200, intervalMs = 50 } = {}) {
  if (typeof scope.skipWaiting === 'function') await scope.skipWaiting();
  await scope.clients.claim();
  const base = scope.registration.scope;
  const deleted = await clearOwnScopeCaches(scope.caches, base, { settleMs, intervalMs });
  const already = await hasNavigatedFlag(scope.caches, base);
  const reloaded = [];
  if (!already) {
    // Set the flag before navigating so a reinstall that activates mid-navigate will not loop.
    await setNavigatedFlag(scope.caches, base);
    const clients = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (underScope(client.url, base) && typeof client.navigate === 'function') {
        reloaded.push(client.url);
        // Do not await: Chromium will not finish activating while this waitUntil is
        // still waiting on client.navigate(), and that navigation itself waits for
        // the worker to become active, so the tab hangs until the ~5 min event timeout.
        Promise.resolve(client.navigate(client.url)).catch(() => {});
      }
    }
  }
  return { deleted, reloaded, navigated: !already };
}

export function attachKillSwitch(scope) {
  // Call skipWaiting during install, but do not waitUntil its promise: if that
  // promise only settles after activation, install and activate would deadlock.
  scope.addEventListener('install', event => {
    try { scope.skipWaiting(); } catch { /* ignore */ }
    event.waitUntil(Promise.resolve());
  });
  scope.addEventListener('activate', event => { event.waitUntil(activateKillSwitch(scope)); });
  scope.addEventListener('message', event => {
    // A later skipWaiting() retries Try Activate once the old worker is idle.
    try { scope.skipWaiting(); } catch { /* ignore */ }
    const port = event.ports && event.ports[0];
    if (event.data && event.data.type === 'kitphonic-killswitch' && port) {
      port.postMessage({ type: 'kitphonic-killswitch', killswitch: true });
      try { port.close && port.close(); } catch { /* already closed */ }
    }
  });
}

if (globalThis.ServiceWorkerGlobalScope && globalThis instanceof globalThis.ServiceWorkerGlobalScope) attachKillSwitch(globalThis);
