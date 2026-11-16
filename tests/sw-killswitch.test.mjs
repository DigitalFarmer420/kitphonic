import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cachePrefixFor as pagePrefixFor } from '../js/sw-register.js';
import { cachePrefixFor as workerPrefixFor } from '../sw.js';
import { cachePrefixFor, clearOwnScopeCaches, activateKillSwitch, attachKillSwitch, LEGACY } from '../tools/sw-killswitch.js';

const origin = 'https://pages.example';
const prodScope = `${origin}/kitphonic/`;
const devScope = `${origin}/kitphonic-dev/`;

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

test('the kill-switch template agrees on the scope prefix and never touches localStorage', async () => {
  assert.equal(cachePrefixFor(devScope), 'kitphonic:/kitphonic-dev/:');
  assert.equal(cachePrefixFor(prodScope), pagePrefixFor(prodScope));
  assert.equal(cachePrefixFor(prodScope), workerPrefixFor(prodScope));
  assert.equal(LEGACY.test('kitphonic-62802e1804f499f9'), true);
  const src = await readFile(new URL('../tools/sw-killswitch.js', import.meta.url), 'utf8');
  assert.equal(/localStorage/.test(src), false);
  assert.match(src, /skipWaiting\(\)/);
  assert.match(src, /unregister\(\)/);
});

test('clearOwnScopeCaches deletes complete and incomplete caches of this scope only', async () => {
  const caches = fakeCaches();
  const names = await seedCatalog(caches);
  const deleted = await clearOwnScopeCaches(caches, devScope);
  assert.deepEqual(deleted.sort(), [names.complete, names.incomplete, names.ownedLegacy].sort());
  assert.deepEqual((await caches.keys()).sort(), [names.emptyLegacy, names.mixedLegacy, names.other, names.prod, names.prodIncomplete].sort());
  assert.equal(caches.buckets.get(names.prod).size, 2);
  assert.equal(caches.buckets.has(names.prodIncomplete), true);
});

test('activateKillSwitch unregisters, deletes only this scope, and reloads only this scope\'s clients', async () => {
  const caches = fakeCaches();
  const names = await seedCatalog(caches);
  const navigated = [];
  let unregistered = 0;
  let claimed = 0;
  const scope = {
    caches,
    registration: {
      scope: devScope,
      async unregister() { unregistered++; return true; },
    },
    clients: {
      async claim() { claimed++; },
      async matchAll() {
        return [
          { url: `${devScope}index.html?skipHello=1`, async navigate(url) { navigated.push(url); } },
          { url: `${prodScope}index.html`, async navigate(url) { navigated.push('PROD ' + url); } },
          { url: `${origin}/other/`, async navigate(url) { navigated.push('OTHER ' + url); } },
        ];
      },
    },
  };
  const out = await activateKillSwitch(scope);
  assert.equal(claimed, 1);
  assert.equal(unregistered, 1);
  assert.deepEqual(out.deleted.sort(), [names.complete, names.incomplete, names.ownedLegacy].sort());
  assert.deepEqual(out.reloaded, [`${devScope}index.html?skipHello=1`]);
  assert.deepEqual(navigated, [`${devScope}index.html?skipHello=1`]);
  assert.deepEqual((await caches.keys()).sort(), [names.emptyLegacy, names.mixedLegacy, names.other, names.prod, names.prodIncomplete].sort());
});

test('attachKillSwitch skipWaiting on install and runs the activate path', async () => {
  const caches = fakeCaches();
  await seedCatalog(caches);
  const handlers = {};
  let skipped = 0;
  const until = [];
  const scope = {
    caches,
    addEventListener(type, fn) { handlers[type] = fn; },
    async skipWaiting() { skipped++; },
    registration: { scope: devScope, async unregister() { return true; } },
    clients: { async claim() {}, async matchAll() { return []; } },
  };
  attachKillSwitch(scope);
  handlers.install({ waitUntil: p => until.push(p) });
  handlers.activate({ waitUntil: p => until.push(p) });
  await Promise.all(until);
  assert.equal(skipped, 1);
  const left = await caches.keys();
  assert.equal(left.some(n => n.startsWith('kitphonic:/kitphonic-dev/:')), false);
  assert.equal(left.includes('kitphonic:/kitphonic/:0123456789abcdef'), true);
});
