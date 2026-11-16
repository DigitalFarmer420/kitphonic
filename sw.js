// Offline app shell (KP-QA-007). Module worker: register with { type: 'module' }.
// The CACHE line is rewritten by tools/gen-sw-assets.mjs and changes when any precached file changes.
export const CACHE = 'kitphonic-547d0a1981217d71';
export const CACHE_PREFIX = 'kitphonic-';

const SHELL_EXT = /\.(?:html|js|mjs|css|json)$/;
const AUDIO = /\/audio\/takes\/[^/]+\.mp3$/;
const FONT = /\/fonts\/[^/]+\.(?:woff2|woff|ttf|otf)$/;
const ICON = /\/icons\/[^/]+\.(?:png|svg|ico|webp)$/;

export function asRequest(request) {
  if (typeof request === 'string') return { url: request, method: 'GET', mode: 'cors' };
  return request;
}

// Stable cache key: drop the query (pages are opened as /?sw=1) and map a directory navigation onto index.html.
export function cacheKeyFor(request) {
  const req = asRequest(request);
  const url = new URL(req.url);
  url.search = '';
  url.hash = '';
  if (url.pathname.endsWith('/')) url.pathname += 'index.html';
  return url.href;
}

// 'cache-first' | 'network-first' | 'bypass'
export function classify(request, { origin } = {}) {
  const req = asRequest(request);
  if ((req.method || 'GET') !== 'GET') return 'bypass';
  let url;
  try { url = new URL(req.url); }
  catch { return 'bypass'; }
  if (!origin || url.origin !== origin) return 'bypass';
  const path = url.pathname;
  if (AUDIO.test(path) || FONT.test(path) || ICON.test(path)) return 'cache-first';
  if (req.mode === 'navigate' || path.endsWith('/') || SHELL_EXT.test(path)) return 'network-first';
  return 'bypass';
}

function cacheable(res) {
  return !!res && res.status === 200 && res.type !== 'opaque' && res.type !== 'opaqueredirect';
}

async function store(cache, key, res) {
  if (!cacheable(res)) return;
  try { await cache.put(key, typeof res.clone === 'function' ? res.clone() : res); }
  catch { /* a full cache must not hide a good network response */ }
}

// Look in this worker's cache first, then in any other kitphonic-* cache. During an update the
// previous cache and the next one can both exist; a take missing from one may still be in the other.
export async function matchAny(caches, key, { current = CACHE, prefix = CACHE_PREFIX } = {}) {
  const hit = await (await caches.open(current)).match(key);
  if (hit) return hit;
  let names = [];
  try { names = await caches.keys(); }
  catch { return null; }
  for (const name of names) {
    if (name === current || !name.startsWith(prefix)) continue;
    const other = await (await caches.open(name)).match(key);
    if (other) return other;
  }
  return null;
}

export async function handleFetch(request, { origin, caches, fetch: doFetch, cacheName = CACHE, online = true } = {}) {
  const req = asRequest(request);
  const kind = classify(req, { origin });
  if (kind === 'bypass') return doFetch(req);
  const cache = await caches.open(cacheName);
  const key = cacheKeyFor(req);
  const lookup = () => matchAny(caches, key, { current: cacheName });
  // Reload skips the HTTP cache. GitHub Pages keeps files for minutes, and a conditional
  // request would still count as "online" while handing back stale HTML, JS, CSS, or JSON.
  const network = () => doFetch(req.url, { cache: 'reload', credentials: 'same-origin' });
  if (kind === 'cache-first') {
    const hit = await lookup();
    if (hit) return hit;
    const res = await network();
    await store(cache, key, res);
    return res;
  }
  // The browser already knows it is offline. Reading the cache avoids a failed network request
  // (and the console error that comes with it). A lie-fi still falls through to the fetch below.
  if (online === false) {
    const hit = await lookup();
    if (hit) return hit;
  }
  try {
    const res = await network();
    await store(cache, key, res);
    return res;
  } catch (err) {
    const hit = await lookup();
    if (hit) return hit;
    throw err;
  }
}

export async function deleteOldCaches(names, { current = CACHE, prefix = CACHE_PREFIX, drop } = {}) {
  const old = [...names].filter(name => name.startsWith(prefix) && name !== current);
  await Promise.all(old.map(name => drop(name)));
  return old;
}

export async function readAssetList(doFetch, href, cacheName = CACHE) {
  const res = await doFetch(href, { cache: 'reload' });
  if (!res || !res.ok) throw new Error('sw-assets.json unavailable');
  const data = await res.json();
  if (!data || data.cache !== cacheName || !Array.isArray(data.shell) || !Array.isArray(data.audio)) {
    throw new Error('sw-assets.json does not match this worker');
  }
  return data;
}

// Fill a cache. A failed file is skipped here; callers decide with missingFrom() whether that is fatal.
export async function precacheUrls(urls, { cache, fetch: doFetch, concurrency = 6 } = {}) {
  const have = new Set();
  if (cache.keys) {
    for (const req of await cache.keys()) have.add(cacheKeyFor(typeof req === 'string' ? req : req.url));
  }
  const todo = [];
  for (const url of urls) {
    const key = cacheKeyFor(url);
    if (!have.has(key)) todo.push({ url, key });
  }
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const item = todo[cursor++];
      let res;
      try { res = await doFetch(item.url); }
      catch { continue; }
      await store(cache, item.key, res);
    }
  }
  const workers = Math.max(1, Math.min(concurrency, todo.length || 1));
  if (todo.length) await Promise.all(Array.from({ length: workers }, () => worker()));
  return { attempted: todo.length };
}

async function loadList(scope) {
  const href = new URL('sw-assets.json', scope.registration.scope).href;
  try {
    return await readAssetList(scope.fetch.bind(scope), href, CACHE);
  } catch {
    const cache = await scope.caches.open(CACHE);
    const hit = await cache.match(href);
    if (!hit) throw new Error('sw-assets.json unavailable');
    const data = await hit.json();
    if (!data || data.cache !== CACHE || !Array.isArray(data.shell) || !Array.isArray(data.audio)) {
      throw new Error('cached asset list does not match this worker');
    }
    return data;
  }
}

export async function missingFrom(cache, urls) {
  const have = new Set((await cache.keys()).map(req => cacheKeyFor(typeof req === 'string' ? req : req.url)));
  return urls.filter(url => !have.has(cacheKeyFor(url)));
}

// An active worker on this registration means this install is an update, not the first visit.
export function isUpdate(scope) {
  return !!(scope.registration && scope.registration.active);
}

const freshFetch = scope => url => scope.fetch(url, { cache: 'reload', credentials: 'same-origin' });

// First visit: store the shell, then take over at once so one online visit is enough to work offline
// (the takes are filled in activate). Update: store the shell AND every take in the new cache before
// install can finish, and do not skipWaiting. The new worker waits until every Kitphonic tab is closed
// (the next cold launch), so it never takes over mid-lesson. Any missing file rejects the install;
// the browser then drops the new worker and the old worker and its cache stay as they were.
export async function installWorker(scope) {
  const base = scope.registration.scope;
  const href = new URL('sw-assets.json', base).href;
  const data = await readAssetList(scope.fetch.bind(scope), href, CACHE);
  const cache = await scope.caches.open(CACHE);
  const shell = data.shell.map(path => new URL(path, base).href);
  await precacheUrls(shell, { cache, fetch: freshFetch(scope), concurrency: 6 });
  const shellMissing = await missingFrom(cache, shell);
  if (shellMissing.length) throw new Error(`shell precache missed ${shellMissing.length}`);
  if (!isUpdate(scope)) {
    await scope.skipWaiting();
    return { update: false };
  }
  const audio = data.audio.map(path => new URL(path, base).href);
  await precacheUrls(audio, { cache, fetch: freshFetch(scope), concurrency: 6 });
  const audioMissing = await missingFrom(cache, audio);
  if (audioMissing.length) throw new Error(`audio precache missed ${audioMissing.length}`);
  return { update: true };
}

// Older kitphonic-* caches are deleted only once this cache holds the whole shell and every take.
// After an update install that is already true. After a first install the takes are filled here; if
// the network drops part-way, any older cache is kept and lookups fall back to it.
export async function activateWorker(scope) {
  await scope.clients.claim();
  const base = scope.registration.scope;
  const data = await loadList(scope);
  const cache = await scope.caches.open(CACHE);
  const audio = data.audio.map(path => new URL(path, base).href);
  await precacheUrls(audio, { cache, fetch: freshFetch(scope) });
  const shell = data.shell.map(path => new URL(path, base).href);
  const missing = await missingFrom(cache, [...shell, ...audio]);
  let dropped = [];
  if (!missing.length) {
    dropped = await deleteOldCaches(await scope.caches.keys(), { current: CACHE, drop: name => scope.caches.delete(name) });
  }
  const clients = await scope.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) client.postMessage({ type: 'kitphonic-audio-ready', cache: CACHE, complete: !missing.length, missing: missing.length });
  return { complete: !missing.length, missing: missing.length, dropped };
}

export function attachWorker(scope) {
  scope.addEventListener('install', event => { event.waitUntil(installWorker(scope)); });
  scope.addEventListener('activate', event => { event.waitUntil(activateWorker(scope)); });
  // Read-only probe for tests and diagnostics: which cache does the controlling worker use?
  scope.addEventListener('message', event => {
    const port = event.ports && event.ports[0];
    if (event.data && event.data.type === 'kitphonic-cache' && port) port.postMessage({ cache: CACHE });
  });
  scope.addEventListener('fetch', event => {
    if (classify(event.request, { origin: scope.location.origin }) === 'bypass') return;
    event.respondWith(handleFetch(event.request, {
      origin: scope.location.origin, caches: scope.caches, fetch: scope.fetch.bind(scope), cacheName: CACHE,
      online: scope.navigator.onLine !== false,
    }));
  });
}

if (globalThis.ServiceWorkerGlobalScope && globalThis instanceof globalThis.ServiceWorkerGlobalScope) attachWorker(globalThis);
