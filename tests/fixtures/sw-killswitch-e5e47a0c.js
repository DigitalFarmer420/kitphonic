// Fixture only: tools/sw-killswitch.js at e5e47a0c, which unregisters and navigates
// on every activate. Used by tools/offline-sw.py to prove the reload-loop harness
// fails on this template and passes on the current one. Do not deploy.
// Emergency self-unregistering service worker. Deploy this file in place of sw.js to turn
// offline mode off for every client of THIS deployment only.
//
// Procedure (see RELEASE.md):
//   1. Copy this file over sw.js in the deployment that must go offline-off (prod or dev, not both
//      unless you mean to). Do not run tools/gen-sw-assets.mjs on the copy.
//   2. Publish. This worker calls skipWaiting and claims clients, so an open lesson on this
//      scope reloads instead of waiting for a cold launch.
//   3. On activate it deletes every cache named kitphonic:<this scope path>:<hash> (complete or
//      not) and any unscoped kitphonic-<hash> cache whose contents prove they belong to this
//      scope, unregisters itself, and reloads clients under this scope.
//   4. Restore the real sw.js from git and publish again to turn offline mode back on.
//
// It never reads or writes saved progress. It never deletes another scope's caches or a legacy
// cache it does not own. It is not registered in the Capacitor/Android wrapper. Leave it
// deployed only for the emergency.
//
// Registered as a module worker, same as sw.js: { type: 'module' }.

export function cachePrefixFor(scopeUrl) {
  return `kitphonic:${new URL(scopeUrl).pathname}:`;
}

export const LEGACY = /^kitphonic-[0-9a-f]+$/;

export async function legacyOwned(caches, name, scopeUrl) {
  if (!LEGACY.test(name)) return false;
  const keys = (await (await caches.open(name)).keys()).map(req => (typeof req === 'string' ? req : req.url));
  if (!keys.length) return false;
  const base = new URL(scopeUrl).href;
  return keys.includes(new URL('index.html', base).href) && keys.every(url => url.startsWith(base));
}

// Delete every cache this scope owns. Retries for settleMs so an incomplete leftover is
// removed in this same call. Default settleMs is 0; the activate path passes a short settle.
export async function clearOwnScopeCaches(caches, scopeUrl, { settleMs = 0, intervalMs = 50 } = {}) {
  const base = new URL(scopeUrl).href;
  const prefix = cachePrefixFor(base);
  const deleted = [];
  const seen = new Set();
  const started = Date.now();
  for (;;) {
    for (const name of await caches.keys()) {
      const mine = name.startsWith(prefix) || await legacyOwned(caches, name, base);
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

function underScope(url, scopeUrl) {
  return typeof url === 'string' && url.startsWith(new URL(scopeUrl).href);
}

export async function activateKillSwitch(scope) {
  await scope.clients.claim();
  const deleted = await clearOwnScopeCaches(scope.caches, scope.registration.scope, { settleMs: 200, intervalMs: 50 });
  await scope.registration.unregister();
  const clients = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const reloaded = [];
  for (const client of clients) {
    if (underScope(client.url, scope.registration.scope) && typeof client.navigate === 'function') {
      await client.navigate(client.url);
      reloaded.push(client.url);
    }
  }
  return { deleted, reloaded };
}

export function attachKillSwitch(scope) {
  scope.addEventListener('install', event => { event.waitUntil(scope.skipWaiting()); });
  scope.addEventListener('activate', event => { event.waitUntil(activateKillSwitch(scope)); });
}

if (globalThis.ServiceWorkerGlobalScope && globalThis instanceof globalThis.ServiceWorkerGlobalScope) attachKillSwitch(globalThis);
