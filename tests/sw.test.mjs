import test from 'node:test';
import assert from 'node:assert/strict';
import { CACHE, CACHE_PREFIX, asRequest, cacheKeyFor, classify, handleFetch, deleteOldCaches, readAssetList, precacheUrls, matchAny, missingFrom, isUpdate, installWorker, activateWorker, cachePrefixFor, cacheNameFor, prefixOfName, legacyOwned } from '../sw.js';
import { shouldRegisterServiceWorker, registerServiceWorker, cachePrefixFor as pagePrefixFor, wantsKillSwitch, killServiceWorker } from '../js/sw-register.js';

const origin = 'https://pages.example';
const req = (path, extra = {}) => ({ url: origin + path, method: extra.method || 'GET', mode: extra.mode || 'cors' });

function response(status, body = '') {
  const res = {
    status, ok: status === 200, body, type: 'basic',
    clone() { return response(status, body); },
    async json() { return JSON.parse(body); },
  };
  return res;
}

function fakeCaches() {
  const buckets = new Map();
  return {
    buckets,
    async open(name) {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const bucket = buckets.get(name);
      return {
        async match(key) { return bucket.get(String(key)) ?? null; },
        async put(key, res) { bucket.set(String(key), res); },
        async keys() { return [...bucket.keys()].map(url => ({ url })); },
      };
    },
    async keys() { return [...buckets.keys()]; },
    async delete(name) { return buckets.delete(name); },
  };
}

test('cache keys drop the query and map a directory navigation onto index.html', () => {
  assert.equal(cacheKeyFor(req('/kitphonic/?sw=1', { mode: 'navigate' })), `${origin}/kitphonic/index.html`);
  assert.equal(cacheKeyFor(req('/kitphonic/index.html?skipHello=1', { mode: 'navigate' })), `${origin}/kitphonic/index.html`);
  assert.equal(cacheKeyFor(req('/kitphonic/js/app.js?v=1')), `${origin}/kitphonic/js/app.js`);
  assert.equal(asRequest('/x').method, 'GET');
});

test('routing: network-first shell, cache-first media, bypass otherwise', () => {
  const kind = (path, extra) => classify(req(path, extra), { origin });
  assert.equal(kind('/kitphonic/'), 'network-first');
  assert.equal(kind('/kitphonic/index.html', { mode: 'navigate' }), 'network-first');
  assert.equal(kind('/kitphonic/js/app.js'), 'network-first');
  assert.equal(kind('/kitphonic/css/app.css'), 'network-first');
  assert.equal(kind('/kitphonic/audio/manifest.json'), 'network-first');
  assert.equal(kind('/kitphonic/fonts/fonts.css'), 'network-first');
  assert.equal(kind('/kitphonic/audio/takes/snd-s.mp3'), 'cache-first');
  assert.equal(kind('/audio/takes/m-hello.mp3'), 'cache-first');
  assert.equal(kind('/kitphonic/fonts/andika-700.woff2'), 'cache-first');
  assert.equal(kind('/kitphonic/icons/favicon-32.png'), 'cache-first');
  assert.equal(kind('/kitphonic/js/app.js', { method: 'POST' }), 'bypass');
  assert.equal(kind('/kitphonic/audio/takes/snd-s.mp3', { method: 'HEAD' }), 'bypass');
  assert.equal(classify(req('/kitphonic/js/app.js'), { origin: 'https://other.example' }), 'bypass');
  assert.equal(classify({ url: 'https://cdn.example/andika-700.woff2', method: 'GET' }, { origin }), 'bypass');
  assert.equal(kind('/kitphonic/tools/serve.mjs'), 'network-first');
  assert.equal(kind('/offline-probe-not-shipped.txt'), 'bypass');
});

test('network-first stores a 200 and falls back to that copy when the network throws', async () => {
  const caches = fakeCaches();
  let online = true;
  const seen = [];
  const doFetch = async (_input, init) => {
    seen.push(init);
    if (!online) throw new TypeError('Failed to fetch');
    return response(200, 'shell');
  };
  const deps = { origin, caches, fetch: doFetch, cacheName: CACHE };
  const first = await handleFetch(req('/kitphonic/js/app.js'), deps);
  assert.equal(first.body, 'shell');
  online = false;
  const second = await handleFetch(req('/kitphonic/js/app.js?x=1'), deps);
  assert.equal(second.body, 'shell');
  const bucket = caches.buckets.get(CACHE);
  assert.equal(bucket.size, 1);
  assert.equal(bucket.has(`${origin}/kitphonic/js/app.js`), true);
  assert.equal(seen[0].cache, 'reload');
});

test('network-first does not cache an error and does not hide it with an older copy', async () => {
  const caches = fakeCaches();
  const cache = await caches.open(CACHE);
  await cache.put(`${origin}/kitphonic/index.html`, response(200, 'old'));
  const res = await handleFetch(req('/kitphonic/index.html', { mode: 'navigate' }), {
    origin, caches, fetch: async () => response(500, 'down'), cacheName: CACHE,
  });
  assert.equal(res.status, 500);
  assert.equal((await cache.match(`${origin}/kitphonic/index.html`)).body, 'old');
});

test('an offline browser is served the cached shell without another fetch', async () => {
  const caches = fakeCaches();
  const cache = await caches.open(CACHE);
  await cache.put(`${origin}/kitphonic/js/app.js`, response(200, 'cached'));
  let fetches = 0;
  const res = await handleFetch(req('/kitphonic/js/app.js'), {
    origin, caches, cacheName: CACHE, online: false, fetch: async () => { fetches++; return response(200, 'net'); },
  });
  assert.equal(res.body, 'cached');
  assert.equal(fetches, 0);
});

test('a navigation to the directory is served from the cached index when offline', async () => {
  const caches = fakeCaches();
  const cache = await caches.open(CACHE);
  await cache.put(`${origin}/kitphonic/index.html`, response(200, 'page'));
  const res = await handleFetch(req('/kitphonic/?sw=1&skipHello=1', { mode: 'navigate' }), {
    origin, caches, fetch: async () => { throw new TypeError('Failed to fetch'); }, cacheName: CACHE,
  });
  assert.equal(res.body, 'page');
});

test('cache-first audio is served from the cache and a miss stores only a 200', async () => {
  const caches = fakeCaches();
  let fetches = 0;
  const deps = {
    origin, caches, cacheName: CACHE,
    fetch: async () => { fetches++; return response(200, 'mp3'); },
  };
  const path = '/kitphonic/audio/takes/snd-s.mp3';
  assert.equal((await handleFetch(req(path), deps)).body, 'mp3');
  assert.equal((await handleFetch(req(path), deps)).body, 'mp3');
  assert.equal(fetches, 1);
  const bad = fakeCaches();
  const res = await handleFetch(req(path), { origin, caches: bad, cacheName: CACHE, fetch: async () => response(404, 'no') });
  assert.equal(res.status, 404);
  assert.equal((await bad.open(CACHE)).keys && (bad.buckets.get(CACHE).size), 0);
});

test('non-GET and cross-origin requests are not written to a kitphonic cache', async () => {
  const caches = fakeCaches();
  let fetches = 0;
  const fetch = async () => { fetches++; return response(200, 'out'); };
  await handleFetch(req('/kitphonic/js/app.js', { method: 'POST' }), { origin, caches, fetch, cacheName: CACHE });
  await handleFetch({ url: 'https://cdn.example/x.js', method: 'GET' }, { origin, caches, fetch, cacheName: CACHE });
  assert.equal(fetches, 2);
  assert.equal(caches.buckets.has(CACHE), false);
});

test('a partial response is not cached', async () => {
  const caches = fakeCaches();
  await handleFetch(req('/audio/takes/m-hello.mp3'), {
    origin, caches, cacheName: CACHE, fetch: async () => response(206, 'part'),
  });
  assert.equal(caches.buckets.get(CACHE).size, 0);
});

test('activate cleanup deletes older caches of this scope only', async () => {
  const dropped = [];
  const cur = cacheNameFor(`${origin}/kitphonic/`);
  const prev = 'kitphonic:/kitphonic/:0123456789abcdef';
  const other = 'kitphonic:/kitphonic-dev/:0123456789abcdef';
  const old = await deleteOldCaches([prev, cur, 'other-app', other, `${CACHE_PREFIX}0123456789abcdef`, 'kitphonic:/kitphonic/dev/:aa'], {
    current: cur, drop: name => dropped.push(name),
  });
  assert.deepEqual(old, [prev]);
  assert.deepEqual(dropped, [prev]);
  assert.deepEqual(await deleteOldCaches([prev, other], { current: CACHE, drop: () => assert.fail('unscoped current has no prefix') }), []);
});

test('the asset list is rejected when it belongs to another build or is not ok', async () => {
  const ok = await readAssetList(async () => response(200, JSON.stringify({ cache: CACHE, shell: ['index.html'], audio: [] })), 'https://x/sw-assets.json', CACHE);
  assert.deepEqual(ok.shell, ['index.html']);
  await assert.rejects(() => readAssetList(async () => response(200, JSON.stringify({ cache: 'kitphonic-ffffffffffffffff', shell: [], audio: [] })), 'https://x/sw-assets.json', CACHE));
  await assert.rejects(() => readAssetList(async () => response(404, ''), 'https://x/sw-assets.json', CACHE));
});

test('background precache fills only what is missing and skips a failed take', async () => {
  const caches = fakeCaches();
  const cache = await caches.open(CACHE);
  const cached = `${origin}/audio/takes/m-hello.mp3`;
  await cache.put(cached, response(200, 'have'));
  const urls = [cached, `${origin}/audio/takes/snd-s.mp3`, `${origin}/audio/takes/missing.mp3`];
  await precacheUrls(urls, {
    cache,
    fetch: async url => url.endsWith('missing.mp3') ? response(500, 'no') : response(200, 'new'),
  });
  assert.equal((await cache.match(cached)).body, 'have');
  assert.equal((await cache.match(`${origin}/audio/takes/snd-s.mp3`)).body, 'new');
  assert.equal(await cache.match(`${origin}/audio/takes/missing.mp3`), null);
});

test('the worker stays off for the wrapper, ?nosw=1, and localhost unless ?sw=1', () => {
  const base = { hasServiceWorker: true, protocol: 'https:', hostname: 'digitalfarmer.github.io', search: '' };
  assert.equal(shouldRegisterServiceWorker(base), true);
  assert.equal(shouldRegisterServiceWorker({ ...base, hasServiceWorker: false }), false);
  assert.equal(shouldRegisterServiceWorker({ ...base, capacitor: true }), false);
  assert.equal(shouldRegisterServiceWorker({ ...base, protocol: 'capacitor:' }), false);
  assert.equal(shouldRegisterServiceWorker({ ...base, search: '?nosw=1' }), false);
  assert.equal(shouldRegisterServiceWorker({ ...base, search: '?sw=1&nosw=1' }), false);
  assert.equal(shouldRegisterServiceWorker({ ...base, hostname: 'localhost', search: '' }), false);
  assert.equal(shouldRegisterServiceWorker({ ...base, hostname: '127.0.0.1', search: '?other=1' }), false);
  assert.equal(shouldRegisterServiceWorker({ ...base, hostname: '127.0.0.1', search: '?sw=1' }), true);
  assert.equal(shouldRegisterServiceWorker({ ...base, hostname: 'localhost', search: '?sw=1&skipHello=1' }), true);
});

test('registration uses the app directory and does not run on a local harness', () => {
  const seen = [];
  const nav = { serviceWorker: { register(script, opts) { seen.push({ script, ...opts }); return Promise.resolve(); } } };
  assert.equal(registerServiceWorker({ navigator: nav, location: { protocol: 'http:', hostname: '127.0.0.1', search: '' }, capacitor: false }), false);
  assert.equal(seen.length, 0);
  assert.equal(registerServiceWorker({ navigator: nav, location: { protocol: 'https:', hostname: 'digitalfarmer.github.io', search: '' }, capacitor: false }), true);
  assert.equal(seen.length, 1);
  assert.match(seen[0].script, /\/sw\.js$/);
  assert.equal(seen[0].type, 'module');
  assert.equal(seen[0].updateViaCache, 'none');
  assert.ok(seen[0].scope.endsWith('/'));
  assert.equal(seen[0].scope.endsWith('/js/'), false);
  assert.ok(seen[0].script.startsWith(seen[0].scope));
  assert.equal(registerServiceWorker({ navigator: nav, location: { protocol: 'https:', hostname: 'digitalfarmer.github.io', search: '' }, capacitor: true }), false);
  assert.equal(seen.length, 1);
});

// --- update path (Uiux review on #24): first install claims at once, updates wait for a cold launch ---

const scopeUrl = `${origin}/kitphonic/`;
const NAME = cacheNameFor(scopeUrl);
const SHELL = ['index.html', 'js/app.js', 'sw-assets.json'];
const TAKES = ['audio/takes/m-hello.mp3', 'audio/takes/snd-s.mp3', 'audio/takes/sfx-chime.mp3'];

function fakeScope({ active = null, caches = fakeCaches(), offline = () => false, failAudio = () => false } = {}) {
  const calls = { skipWaiting: 0, claim: 0, fetched: [], posted: [] };
  const list = JSON.stringify({ cache: CACHE, shell: SHELL, audio: TAKES });
  const scope = {
    calls, caches,
    registration: { scope: scopeUrl, active },
    async fetch(url) {
      calls.fetched.push(String(url));
      if (offline(String(url))) throw new TypeError('Failed to fetch');
      if (String(url).endsWith('sw-assets.json')) return response(200, list);
      if (String(url).includes('/audio/takes/') && failAudio(String(url))) throw new TypeError('Failed to fetch');
      return response(200, `new:${new URL(String(url)).pathname}`);
    },
    async skipWaiting() { calls.skipWaiting++; },
    clients: {
      async claim() { calls.claim++; },
      async matchAll() { return [{ postMessage: msg => calls.posted.push(msg) }]; },
    },
  };
  return scope;
}

async function seedOld(caches, name = 'kitphonic:/kitphonic/:0123456789abcdef') {
  const old = await caches.open(name);
  for (const path of [...SHELL, ...TAKES]) await old.put(scopeUrl + path, response(200, `old:${path}`));
  return name;
}

test('first install (no active worker) stores the shell and takes over at once', async () => {
  const scope = fakeScope();
  assert.equal(isUpdate(scope), false);
  assert.deepEqual(await installWorker(scope), { update: false });
  assert.equal(scope.calls.skipWaiting, 1);
  const bucket = scope.caches.buckets.get(NAME);
  for (const path of SHELL) assert.ok(bucket.has(scopeUrl + path), path);
  assert.equal(scope.calls.fetched.some(u => u.includes('/audio/takes/')), false, 'takes wait for activate on a first visit');
  await activateWorker(scope);
  assert.equal(scope.calls.claim, 1);
  for (const path of TAKES) assert.ok(bucket.has(scopeUrl + path), path);
  assert.deepEqual(scope.calls.posted.at(-1), { type: 'kitphonic-audio-ready', cache: NAME, complete: true, missing: 0 });
});

test('an update (active worker present) precaches shell and every take during install and does not skipWaiting', async () => {
  const caches = fakeCaches();
  const oldName = await seedOld(caches);
  const scope = fakeScope({ active: { state: 'activated' }, caches });
  assert.equal(isUpdate(scope), true);
  assert.deepEqual(await installWorker(scope), { update: true });
  assert.equal(scope.calls.skipWaiting, 0);
  assert.equal(scope.calls.claim, 0);
  const bucket = caches.buckets.get(NAME);
  for (const path of [...SHELL, ...TAKES].filter(p => p !== 'sw-assets.json')) assert.equal(bucket.get(scopeUrl + path).body, `new:/kitphonic/${path}`);
  assert.equal(JSON.parse(bucket.get(scopeUrl + 'sw-assets.json').body).cache, CACHE);
  assert.equal(caches.buckets.get(oldName).size, SHELL.length + TAKES.length, 'install never touches the old cache');
});

test('an update whose takes cannot be fetched rejects install and leaves the old cache alone', async () => {
  const caches = fakeCaches();
  const oldName = await seedOld(caches);
  const scope = fakeScope({ active: { state: 'activated' }, caches, failAudio: url => url.endsWith('snd-s.mp3') });
  await assert.rejects(() => installWorker(scope), /audio precache missed 1/);
  assert.equal(scope.calls.skipWaiting, 0);
  assert.equal(caches.buckets.has(oldName), true);
  assert.equal(caches.buckets.get(oldName).size, SHELL.length + TAKES.length);
  const offline = fakeScope({ active: { state: 'activated' }, caches, offline: () => true });
  await assert.rejects(() => installWorker(offline));
  assert.equal(offline.calls.skipWaiting, 0);
  assert.equal(caches.buckets.get(oldName).size, SHELL.length + TAKES.length);
});

test('activate after a complete update deletes older kitphonic caches only after checking the new one', async () => {
  const caches = fakeCaches();
  const oldName = await seedOld(caches);
  await caches.open('other-app');
  const scope = fakeScope({ active: { state: 'activated' }, caches });
  await installWorker(scope);
  const before = scope.calls.fetched.filter(u => u.includes('/audio/takes/')).length;
  const result = await activateWorker(scope);
  assert.equal(scope.calls.fetched.filter(u => u.includes('/audio/takes/')).length, before, 'no take is fetched again');
  assert.deepEqual(result, { complete: true, missing: 0, dropped: [oldName] });
  assert.deepEqual((await caches.keys()).sort(), [NAME, 'other-app'].sort());
});

test('activate keeps the older cache when the new one is still missing takes', async () => {
  const caches = fakeCaches();
  const oldName = await seedOld(caches);
  const scope = fakeScope({ caches, failAudio: url => url.endsWith('sfx-chime.mp3') });
  await installWorker(scope);
  const result = await activateWorker(scope);
  assert.deepEqual(result, { complete: false, missing: 1, dropped: [] });
  assert.equal(caches.buckets.has(oldName), true);
  assert.deepEqual(scope.calls.posted.at(-1), { type: 'kitphonic-audio-ready', cache: NAME, complete: false, missing: 1 });
  // The take missing from the new cache is still served, from the old one, with the network down.
  const res = await handleFetch(req('/kitphonic/audio/takes/sfx-chime.mp3'), {
    origin, caches, cacheName: NAME, fetch: async () => { throw new TypeError('Failed to fetch'); },
  });
  assert.equal(res.body, 'old:audio/takes/sfx-chime.mp3');
});

test('lookups fall back across this scope\'s caches but never into another scope, a legacy cache, or another app', async () => {
  const caches = fakeCaches();
  const other = await caches.open('other-app');
  await other.put(`${origin}/kitphonic/audio/takes/x.mp3`, response(200, 'foreign'));
  const dev = await caches.open('kitphonic:/kitphonic-dev/:aaaaaaaaaaaaaaaa');
  await dev.put(`${origin}/kitphonic/audio/takes/x.mp3`, response(200, 'dev'));
  const legacy = await caches.open('kitphonic-aaaaaaaaaaaaaaaa');
  await legacy.put(`${origin}/kitphonic/audio/takes/x.mp3`, response(200, 'legacy'));
  const prev = await caches.open('kitphonic:/kitphonic/:aaaaaaaaaaaaaaaa');
  await prev.put(`${origin}/kitphonic/js/app.js`, response(200, 'prev-js'));
  await prev.put(`${origin}/kitphonic/audio/takes/snd-s.mp3`, response(200, 'prev-mp3'));
  const current = await caches.open(NAME);
  await current.put(`${origin}/kitphonic/audio/takes/m-hello.mp3`, response(200, 'cur-mp3'));
  assert.equal((await matchAny(caches, `${origin}/kitphonic/audio/takes/m-hello.mp3`, { current: NAME })).body, 'cur-mp3');
  assert.equal((await matchAny(caches, `${origin}/kitphonic/audio/takes/snd-s.mp3`, { current: NAME })).body, 'prev-mp3');
  assert.equal(await matchAny(caches, `${origin}/kitphonic/audio/takes/x.mp3`, { current: NAME }), null);
  let fetches = 0;
  const down = async () => { fetches++; throw new TypeError('Failed to fetch'); };
  const deps = { origin, caches, cacheName: NAME, fetch: down };
  assert.equal((await handleFetch(req('/kitphonic/audio/takes/snd-s.mp3'), deps)).body, 'prev-mp3');
  assert.equal(fetches, 0, 'a cache-first hit in an older cache needs no network');
  assert.equal((await handleFetch(req('/kitphonic/js/app.js'), deps)).body, 'prev-js');
  assert.equal((await handleFetch(req('/kitphonic/js/app.js'), { ...deps, online: false })).body, 'prev-js');
  await assert.rejects(() => handleFetch(req('/kitphonic/audio/takes/x.mp3'), deps));
});

test('missingFrom compares by cache key', async () => {
  const caches = fakeCaches();
  const cache = await caches.open(CACHE);
  await cache.put(`${origin}/kitphonic/index.html`, response(200, 'x'));
  assert.deepEqual(await missingFrom(cache, [`${origin}/kitphonic/`, `${origin}/kitphonic/js/app.js`]), [`${origin}/kitphonic/js/app.js`]);
});

test('the worker source never calls skipWaiting outside a first install and never touches localStorage', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.equal((src.match(/skipWaiting\(\)/g) || []).length, 1);
  assert.match(src, /if \(!isUpdate\(scope\)\) \{\s*await scope\.skipWaiting\(\);/);
  assert.equal(/localStorage/.test(src), false);
  const reg = await readFile(new URL('../js/sw-register.js', import.meta.url), 'utf8');
  assert.equal(/SKIP_WAITING|skipWaiting/.test(reg), false);
});

// --- KP-QA-011: prod and dev share one origin; caches are named and cleaned per scope ---

test('cache names carry the scope path and prefixes never overlap between deployments', () => {
  const hash = CACHE.slice(CACHE_PREFIX.length);
  assert.equal(cacheNameFor('https://digitalfarmer420.github.io/kitphonic/'), `kitphonic:/kitphonic/:${hash}`);
  assert.equal(cacheNameFor('https://digitalfarmer420.github.io/kitphonic-dev/'), `kitphonic:/kitphonic-dev/:${hash}`);
  assert.equal(cacheNameFor('https://x/kitphonic/', 'kitphonic-deadbeef'), 'kitphonic:/kitphonic/:deadbeef');
  const prod = cachePrefixFor('https://digitalfarmer420.github.io/kitphonic/');
  for (const name of [cacheNameFor('https://digitalfarmer420.github.io/kitphonic-dev/'), cacheNameFor('https://digitalfarmer420.github.io/kitphonic/dev/'), CACHE]) {
    assert.equal(name.startsWith(prod), false, name);
  }
  assert.equal(prefixOfName(`kitphonic:/kitphonic/:${hash}`), 'kitphonic:/kitphonic/:');
  assert.equal(prefixOfName(CACHE), null);
  assert.equal(prefixOfName('other:/x/:1'), null);
  for (const scope of ['https://x/', 'https://x/kitphonic/', 'https://x/kitphonic-dev/', 'https://x/a/b/']) {
    assert.equal(pagePrefixFor(scope), cachePrefixFor(scope), 'sw-register.js and sw.js agree');
  }
});

async function twoSites() {
  const caches = fakeCaches();
  const prodScope = `${origin}/kitphonic/`, devScope = `${origin}/kitphonic-dev/`;
  const prodName = cacheNameFor(prodScope);
  const prod = await caches.open(prodName);
  for (const path of [...SHELL, ...TAKES]) await prod.put(prodScope + path, response(200, `prod:${path}`));
  const devOld = await caches.open('kitphonic:/kitphonic-dev/:0123456789abcdef');
  for (const path of [...SHELL, ...TAKES]) await devOld.put(devScope + path, response(200, `dev:${path}`));
  return { caches, prodScope, devScope, prodName };
}

test('a dev update activating never deletes the prod cache', async () => {
  const { caches, devScope, prodName } = await twoSites();
  const scope = fakeScope({ active: { state: 'activated' }, caches });
  scope.registration.scope = devScope;
  await installWorker(scope);
  const result = await activateWorker(scope);
  assert.deepEqual(result.dropped, ['kitphonic:/kitphonic-dev/:0123456789abcdef']);
  assert.deepEqual((await caches.keys()).sort(), [prodName, cacheNameFor(devScope)].sort());
  assert.equal(caches.buckets.get(prodName).size, SHELL.length + TAKES.length);
});

test('dev lookups never read the prod cache', async () => {
  const { caches, devScope } = await twoSites();
  const devName = cacheNameFor(devScope);
  await caches.open(devName);
  assert.equal(await matchAny(caches, `${origin}/kitphonic/audio/takes/snd-s.mp3`, { current: devName }), null);
  const res = await handleFetch(req('/kitphonic-dev/audio/takes/snd-s.mp3'), {
    origin, caches, cacheName: devName, fetch: async () => { throw new TypeError('Failed to fetch'); },
  });
  assert.equal(res.body, 'dev:audio/takes/snd-s.mp3', 'falls back to the older dev cache only');
});

test('a legacy unscoped cache is deleted only when its contents are all under this scope', async () => {
  const caches = fakeCaches();
  const prodScope = `${origin}/kitphonic/`, devScope = `${origin}/kitphonic-dev/`;
  const mine = await caches.open('kitphonic-1111111111111111');
  await mine.put(`${prodScope}index.html`, response(200, 'x'));
  await mine.put(`${prodScope}audio/takes/snd-s.mp3`, response(200, 'x'));
  const theirs = await caches.open('kitphonic-2222222222222222');
  await theirs.put(`${devScope}index.html`, response(200, 'x'));
  const mixed = await caches.open('kitphonic-3333333333333333');
  await mixed.put(`${prodScope}index.html`, response(200, 'x'));
  await mixed.put(`${devScope}js/app.js`, response(200, 'x'));
  await caches.open('kitphonic-4444444444444444');
  const noIndex = await caches.open('kitphonic-5555555555555555');
  await noIndex.put(`${prodScope}audio/takes/snd-s.mp3`, response(200, 'x'));
  assert.equal(await legacyOwned(caches, 'kitphonic-1111111111111111', prodScope), true);
  assert.equal(await legacyOwned(caches, 'kitphonic-2222222222222222', prodScope), false);
  assert.equal(await legacyOwned(caches, 'kitphonic-3333333333333333', prodScope), false);
  assert.equal(await legacyOwned(caches, 'kitphonic-4444444444444444', prodScope), false);
  assert.equal(await legacyOwned(caches, 'kitphonic-5555555555555555', prodScope), false);
  assert.equal(await legacyOwned(caches, 'kitphonic-2222222222222222', `${origin}/`), false, 'a root scope does not claim a sub-path deployment');
  assert.equal(await legacyOwned(caches, cacheNameFor(prodScope), prodScope), false, 'scoped names are not legacy');
  const scope = fakeScope({ caches });
  await installWorker(scope);
  const result = await activateWorker(scope);
  assert.deepEqual(result.dropped, ['kitphonic-1111111111111111']);
  assert.deepEqual((await caches.keys()).sort(), [NAME, 'kitphonic-2222222222222222', 'kitphonic-3333333333333333', 'kitphonic-4444444444444444', 'kitphonic-5555555555555555'].sort());
});

// --- KP-QA-010: ?nosw=1 is a kill switch for this scope only ---

test('?nosw=1 asks for the kill switch except in the wrapper', () => {
  const base = { hasServiceWorker: true, protocol: 'https:', search: '?nosw=1' };
  assert.equal(wantsKillSwitch(base), true);
  assert.equal(wantsKillSwitch({ ...base, search: '?sw=1&nosw=1' }), true);
  assert.equal(wantsKillSwitch({ ...base, search: '' }), false);
  assert.equal(wantsKillSwitch({ ...base, search: '?nosw=0' }), false);
  assert.equal(wantsKillSwitch({ ...base, capacitor: true }), false);
  assert.equal(wantsKillSwitch({ ...base, protocol: 'capacitor:' }), false);
  assert.equal(wantsKillSwitch({ ...base, hasServiceWorker: false }), false);
});

test('the kill switch unregisters and clears only this scope', async () => {
  const { caches, prodScope, devScope, prodName } = await twoSites();
  const legacy = await caches.open('kitphonic-1111111111111111');
  await legacy.put(`${devScope}index.html`, response(200, 'x'));
  const gone = [];
  const reg = scope => ({ scope, async unregister() { gone.push(scope); return true; } });
  const nav = { serviceWorker: { async getRegistrations() { return [reg(prodScope), reg(devScope), reg(`${origin}/kitphonic-dev/sub/`)]; } } };
  const out = await killServiceWorker({ navigator: nav, caches, scope: devScope });
  assert.deepEqual(gone, [devScope]);
  assert.deepEqual(out.unregistered, [devScope]);
  assert.deepEqual(out.deleted.sort(), ['kitphonic-1111111111111111', 'kitphonic:/kitphonic-dev/:0123456789abcdef'].sort());
  assert.deepEqual(await caches.keys(), [prodName]);
  assert.equal(caches.buckets.get(prodName).size, SHELL.length + TAKES.length);
});

test('registerServiceWorker with ?nosw=1 runs the kill switch and registers nothing', async () => {
  const seen = [];
  let asked = 0;
  const nav = { serviceWorker: {
    register() { seen.push('register'); return Promise.resolve(); },
    async getRegistrations() { asked++; return []; },
  } };
  const caches = fakeCaches();
  await caches.open('other-app');
  assert.equal(registerServiceWorker({ navigator: nav, location: { protocol: 'https:', hostname: 'digitalfarmer.github.io', search: '?nosw=1' }, capacitor: false, caches }), false);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(asked, 1);
  assert.deepEqual(seen, []);
  assert.deepEqual(await caches.keys(), ['other-app']);
  const src = (await import('node:fs/promises')).readFile;
  assert.equal(/localStorage/.test(await src(new URL('../js/sw-register.js', import.meta.url), 'utf8')), false);
});
