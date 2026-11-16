import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cachePrefixFor as pagePrefixFor } from '../js/sw-register.js';
import { cachePrefixFor as workerPrefixFor, killSwitchMarkerFor } from '../sw.js';
import { cachePrefixFor, clearOwnScopeCaches, activateKillSwitch, attachKillSwitch, LEGACY, KITPHONIC_KILLSWITCH, markerNameFor, hasNavigatedFlag, setNavigatedFlag, MARKER_PREFIX } from '../tools/sw-killswitch.js';

const origin = 'https://pages.example';
const prodScope = `${origin}/kitphonic/`;
const devScope = `${origin}/kitphonic-dev/`;
const MARK = 'kitphonic-killswitch:/kitphonic-dev/';

function response(status, body = '') {
  return { status, ok: status === 200, body, type: 'basic', clone() { return response(status, body); } };
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

async function seedCatalog(caches) {
  const complete = 'kitphonic:/kitphonic-dev/:0123456789abcdef';
  const incomplete = 'kitphonic:/kitphonic-dev/:f5f4063852ee2262';
  const prod = 'kitphonic:/kitphonic/:0123456789abcdef';
  const prodIncomplete = 'kitphonic:/kitphonic/:ffffffffffff';
  const ownedLegacy = 'kitphonic-1111111111111111';
  const mixedLegacy = 'kitphonic-bbbb0000bbbb0001';
  const emptyLegacy = 'kitphonic-4444444444444444';
  const other = 'other-app';
  const devComplete = await caches.open(complete);
  await devComplete.put(`${devScope}index.html`, response(200, 'dev'));
  await devComplete.put(`${devScope}audio/takes/snd-s.mp3`, response(200, 'dev'));
  const devPartial = await caches.open(incomplete);
  await devPartial.put(`${devScope}index.html`, response(200, 'partial'));
  const prodComplete = await caches.open(prod);
  await prodComplete.put(`${prodScope}index.html`, response(200, 'prod'));
  await prodComplete.put(`${prodScope}audio/takes/snd-s.mp3`, response(200, 'prod'));
  const prodPartial = await caches.open(prodIncomplete);
  await prodPartial.put(`${prodScope}index.html`, response(200, 'prod-partial'));
  const mine = await caches.open(ownedLegacy);
  await mine.put(`${devScope}index.html`, response(200, 'legacy'));
  const mixed = await caches.open(mixedLegacy);
  await mixed.put(`${prodScope}index.html`, response(200, 'x'));
  await mixed.put(`${devScope}js/app.js`, response(200, 'x'));
  await caches.open(emptyLegacy);
  await caches.open(other);
  return { complete, incomplete, prod, prodIncomplete, ownedLegacy, mixedLegacy, emptyLegacy, other };
}

function fakeScope(caches, { clients = [], unregister } = {}) {
  let unregistered = 0;
  let claimed = 0;
  let skipped = 0;
  const scope = {
    caches,
    calls: { get unregistered() { return unregistered; }, get claimed() { return claimed; }, get skipped() { return skipped; } },
    async skipWaiting() { skipped++; },
    registration: {
      scope: devScope,
      async unregister() {
        unregistered++;
        if (unregister) return unregister();
        throw new Error('kill switch must stay registered');
      },
    },
    clients: {
      async claim() { claimed++; },
      async matchAll() { return clients; },
    },
  };
  return scope;
}

test('the kill-switch template agrees on the scope prefix and never touches localStorage', async () => {
  assert.equal(KITPHONIC_KILLSWITCH, true);
  assert.equal(cachePrefixFor(devScope), 'kitphonic:/kitphonic-dev/:');
  assert.equal(cachePrefixFor(prodScope), pagePrefixFor(prodScope));
  assert.equal(cachePrefixFor(prodScope), workerPrefixFor(prodScope));
  assert.equal(markerNameFor(devScope), MARK);
  assert.equal(killSwitchMarkerFor(devScope), markerNameFor(devScope));
  assert.equal(LEGACY.test('kitphonic-62802e1804f499f9'), true);
  assert.equal(LEGACY.test(MARK), false);
  assert.equal(MARK.startsWith(cachePrefixFor(devScope)), false);
  const src = await readFile(new URL('../tools/sw-killswitch.js', import.meta.url), 'utf8');
  assert.equal(/localStorage/.test(src), false);
  assert.match(src, /skipWaiting\(\)/);
  assert.equal(/unregister\(\)/.test(src), false);
  assert.equal(/addEventListener\(\s*['"]fetch['"]/.test(src), false);
  assert.match(src, /KITPHONIC_KILLSWITCH/);
});

test('clearOwnScopeCaches deletes complete and incomplete caches of this scope only, and keeps the marker', async () => {
  const caches = fakeCaches();
  const names = await seedCatalog(caches);
  await setNavigatedFlag(caches, devScope);
  const deleted = await clearOwnScopeCaches(caches, devScope);
  assert.deepEqual(deleted.sort(), [names.complete, names.incomplete, names.ownedLegacy].sort());
  assert.deepEqual((await caches.keys()).sort(), [MARK, names.emptyLegacy, names.mixedLegacy, names.other, names.prod, names.prodIncomplete].sort());
  assert.equal(caches.buckets.get(names.prod).size, 2);
  assert.equal(caches.buckets.has(names.prodIncomplete), true);
  assert.equal(await hasNavigatedFlag(caches, devScope), true);
  assert.ok(MARKER_PREFIX);
});

test('activateKillSwitch stays registered, deletes only this scope, and reloads only this scope\'s clients', async () => {
  const caches = fakeCaches();
  const names = await seedCatalog(caches);
  const navigated = [];
  const clients = [
    { url: `${devScope}index.html?skipHello=1`, async navigate(url) { navigated.push(url); } },
    { url: `${prodScope}index.html`, async navigate(url) { navigated.push('PROD ' + url); } },
    { url: `${origin}/other/`, async navigate(url) { navigated.push('OTHER ' + url); } },
  ];
  const scope = fakeScope(caches, { clients });
  const out = await activateKillSwitch(scope, { settleMs: 0 });
  assert.equal(scope.calls.claimed, 1);
  assert.equal(scope.calls.skipped, 1);
  assert.equal(scope.calls.unregistered, 0);
  assert.equal(out.navigated, true);
  assert.deepEqual(out.deleted.sort(), [names.complete, names.incomplete, names.ownedLegacy].sort());
  assert.deepEqual(out.reloaded, [`${devScope}index.html?skipHello=1`]);
  assert.deepEqual(navigated, [`${devScope}index.html?skipHello=1`]);
  assert.equal(await hasNavigatedFlag(caches, devScope), true);
  assert.deepEqual((await caches.keys()).sort(), [MARK, names.emptyLegacy, names.mixedLegacy, names.other, names.prod, names.prodIncomplete].sort());
});

test('the at-most-once flag stops a later activation from navigating again', async () => {
  const caches = fakeCaches();
  await seedCatalog(caches);
  const navigated = [];
  const clients = [
    { url: `${devScope}?skipHello=1`, async navigate(url) { navigated.push(url); } },
  ];
  const scope = fakeScope(caches, { clients });
  const first = await activateKillSwitch(scope, { settleMs: 0 });
  assert.equal(first.navigated, true);
  assert.deepEqual(first.reloaded, [`${devScope}?skipHello=1`]);
  assert.equal(navigated.length, 1);
  assert.equal(await hasNavigatedFlag(caches, devScope), true);

  const second = await activateKillSwitch(scope, { settleMs: 0 });
  assert.equal(second.navigated, false);
  assert.deepEqual(second.reloaded, []);
  assert.equal(navigated.length, 1, 'a reinstall or later activate must not navigate again');
  assert.equal(scope.calls.unregistered, 0);
  assert.equal(await hasNavigatedFlag(caches, devScope), true);
  assert.equal((await caches.keys()).some(n => n.startsWith('kitphonic:/kitphonic-dev/:')), false);
});

test('activateKillSwitch does not await client.navigate (Chromium activate/navigate deadlock)', async () => {
  const caches = fakeCaches();
  await seedCatalog(caches);
  const order = [];
  const clients = [
    { url: `${devScope}?skipHello=1`, async navigate(url) {
      order.push('navigate');
      // A hung navigate must not keep activate's waitUntil open.
      await new Promise(() => {});
    } },
  ];
  const scope = fakeScope(caches, { clients });
  const out = await Promise.race([
    activateKillSwitch(scope, { settleMs: 0 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('activateKillSwitch waited for navigate')), 200)),
  ]);
  assert.equal(out.navigated, true);
  assert.deepEqual(out.reloaded, [`${devScope}?skipHello=1`]);
  assert.deepEqual(order, ['navigate']);
  assert.equal(await hasNavigatedFlag(caches, devScope), true, 'marker is set before navigate is called');
});

test('attachKillSwitch skipWaiting on install, runs the activate path, and answers the kill-switch probe', async () => {
  const caches = fakeCaches();
  await seedCatalog(caches);
  const handlers = {};
  const until = [];
  const scope = fakeScope(caches, { clients: [] });
  scope.addEventListener = (type, fn) => { handlers[type] = fn; };
  attachKillSwitch(scope);
  handlers.install({ waitUntil: p => until.push(p) });
  handlers.activate({ waitUntil: p => until.push(p) });
  await Promise.all(until);
  assert.ok(scope.calls.skipped >= 1);
  const left = await caches.keys();
  assert.equal(left.some(n => n.startsWith('kitphonic:/kitphonic-dev/:')), false);
  assert.equal(left.includes('kitphonic:/kitphonic/:0123456789abcdef'), true);
  assert.equal(left.includes(MARK), true);
  assert.equal('fetch' in handlers, false);

  let reply = null;
  const port = { postMessage(data) { reply = data; } };
  handlers.message({ data: { type: 'kitphonic-killswitch' }, ports: [port] });
  assert.deepEqual(reply, { type: 'kitphonic-killswitch', killswitch: true });
});
