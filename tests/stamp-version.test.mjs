import test from 'node:test';
import assert from 'node:assert/strict';
import {
  todayStamp,
  parseTag,
  parseTagList,
  parseVersion,
  tagFor,
  nextBuildVersion,
  resolveVersion,
  stampTree,
  allocateVersion,
  shaEqual,
} from '../tools/stamp-version.mjs';

const DATE = '2026.11.21';
const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

test('legacy and malformed tags are ignored', () => {
  assert.equal(parseTag('v1.0.0-rc10', 'prod'), null);
  assert.equal(parseTag('v1.0.0', 'prod'), null);
  assert.equal(parseTag('v2026.11.21.1-beta', 'prod'), null);
  assert.equal(parseTag('2026.11.21.1', 'prod'), null);
  assert.equal(parseTag('dev-2026.11.21.1', 'prod'), null);
  assert.equal(parseTag('v2026.11.21.1', 'dev'), null);
  assert.deepEqual(parseTag('v2026.11.21.1', 'prod'), {
    version: '2026.11.21.1', date: DATE, n: 1, tag: 'v2026.11.21.1', env: 'prod',
  });
  assert.deepEqual(parseTag('dev-2026.11.21.10', 'dev'), {
    version: '2026.11.21.10', date: DATE, n: 10, tag: 'dev-2026.11.21.10', env: 'dev',
  });
  assert.equal(tagFor('dev', '2026.11.21.2'), 'dev-2026.11.21.2');
  assert.equal(tagFor('prod', '2026.11.21.2'), 'v2026.11.21.2');
});

test('first build of the day is .1 when there are no tags and no floor', () => {
  assert.equal(nextBuildVersion({ tags: [], env: 'dev', date: DATE }), '2026.11.21.1');
  assert.equal(nextBuildVersion({ tags: ['v1.0.0-rc10'], env: 'prod', date: DATE }), '2026.11.21.1');
  assert.equal(nextBuildVersion({
    tags: ['dev-2026.11.20.4', 'v2026.11.21.3'],
    env: 'dev',
    date: DATE,
  }), '2026.11.21.1');
});

test('Nth build of the day uses the highest existing N plus 1', () => {
  assert.equal(nextBuildVersion({
    tags: ['dev-2026.11.21.1', 'dev-2026.11.21.3', 'dev-2026.11.21.2'],
    env: 'dev',
    date: DATE,
  }), '2026.11.21.4');
  assert.equal(nextBuildVersion({
    tags: ['v2026.11.21.9'],
    env: 'prod',
    date: DATE,
  }), '2026.11.21.10');
});

test('a new day resets N to 1', () => {
  assert.equal(nextBuildVersion({
    tags: ['dev-2026.11.21.8', 'v2026.11.21.4'],
    env: 'dev',
    date: '2026.11.22',
    floorVersion: '2026.11.21.1',
  }), '2026.11.22.1');
  assert.equal(nextBuildVersion({
    tags: ['v2026.11.21.4'],
    env: 'prod',
    date: '2026.11.22',
  }), '2026.11.22.1');
});

test('todayStamp follows the America/Los_Angeles calendar date, including the midnight boundary', () => {
  // 2026-11-21 00:30 PT is 2026-11-21 08:30 UTC.
  assert.equal(todayStamp(new Date('2026-11-21T08:30:00Z')), '2026.11.21');
  // 2026-11-21 23:30 PT is 2026-11-22 07:30 UTC; still the 21st in PT.
  assert.equal(todayStamp(new Date('2026-11-22T07:30:00Z')), '2026.11.21');
  // Just after midnight PT is the next day (2026-11-22 00:00 PT = 08:00 UTC).
  assert.equal(todayStamp(new Date('2026-11-22T08:00:00Z')), '2026.11.22');
  // A UTC date that is still the previous evening in PT.
  assert.equal(todayStamp(new Date('2026-11-21T07:59:00Z')), '2026.11.20');
});

test('dev and prod counters are independent', () => {
  const tags = ['dev-2026.11.21.5', 'v2026.11.21.1', 'v1.0.0-rc10'];
  assert.equal(nextBuildVersion({ tags, env: 'dev', date: DATE }), '2026.11.21.6');
  assert.equal(nextBuildVersion({ tags, env: 'prod', date: DATE }), '2026.11.21.2');
  const dev = resolveVersion({ tags, env: 'dev', date: DATE, sha: SHA_A });
  const prod = resolveVersion({ tags, env: 'prod', date: DATE, sha: SHA_A });
  assert.equal(dev.version, '2026.11.21.6');
  assert.equal(dev.tag, 'dev-2026.11.21.6');
  assert.equal(prod.version, '2026.11.21.2');
  assert.equal(prod.tag, 'v2026.11.21.2');
});

test('the committed VERSION is a same-day floor so a shipped number is not reused', () => {
  assert.equal(nextBuildVersion({
    tags: [],
    env: 'dev',
    date: DATE,
    floorVersion: '2026.11.21.1',
  }), '2026.11.21.2');
  assert.equal(nextBuildVersion({
    tags: ['dev-2026.11.21.2'],
    env: 'dev',
    date: DATE,
    floorVersion: '2026.11.21.1',
  }), '2026.11.21.3');
  assert.equal(nextBuildVersion({
    tags: [],
    env: 'prod',
    date: DATE,
    floorVersion: '2026.11.20.4',
  }), '2026.11.21.1');
});

test('a re-run of the same commit reuses that environment tag and does not increment', () => {
  const tags = [
    { name: 'dev-2026.11.21.2', sha: SHA_A },
    { name: 'v2026.11.21.1', sha: SHA_B },
  ];
  const reused = resolveVersion({ tags, env: 'dev', sha: SHA_A, date: DATE });
  assert.deepEqual(reused, {
    version: '2026.11.21.2', tag: 'dev-2026.11.21.2', reuse: true, n: 2, date: DATE,
  });
  // A short sha still matches.
  const short = resolveVersion({ tags, env: 'dev', sha: SHA_A.slice(0, 7), date: DATE });
  assert.equal(short.reuse, true);
  assert.equal(short.version, '2026.11.21.2');
  // The same sha on prod has no tag, so prod still increments.
  const prod = resolveVersion({ tags, env: 'prod', sha: SHA_A, date: DATE, floorVersion: '2026.11.21.1' });
  assert.equal(prod.reuse, false);
  assert.equal(prod.version, '2026.11.21.2');
  // A different sha on dev gets the next N.
  const next = resolveVersion({ tags, env: 'dev', sha: SHA_B, date: DATE });
  assert.equal(next.reuse, false);
  assert.equal(next.version, '2026.11.21.3');
});

test('parseTagList prefers the peeled commit sha of an annotated tag', () => {
  const tags = parseTagList([
    'dev-2026.11.21.2\tabcdtagobject\t' + SHA_A,
    'v1.0.0-rc10\t' + SHA_B + '\t',
  ].join('\n'));
  assert.equal(tags[0].name, 'dev-2026.11.21.2');
  assert.equal(tags[0].sha, SHA_A);
  assert.equal(tags[1].sha, SHA_B);
  assert.equal(shaEqual(SHA_A, SHA_A.slice(0, 12)), true);
  assert.equal(shaEqual(SHA_A, SHA_B), false);
  assert.equal(parseVersion('1.0.0-rc10'), null);
});

test('stampTree writes the version and then refreshes the service-worker plan', () => {
  const calls = [];
  stampTree('/tmp/site', '2026.11.21.2', {
    writeVersionFn: (root, version) => calls.push(['version', root, version]),
    writePlanFn: (root) => calls.push(['plan', root]),
  });
  assert.deepEqual(calls, [
    ['version', '/tmp/site', '2026.11.21.2'],
    ['plan', '/tmp/site'],
  ]);
});

test('allocateVersion retries when a tag push collides, and reuses a tag that appears on this sha', async () => {
  let listing = [];
  const pushes = [];
  const first = await allocateVersion({
    env: 'dev',
    sha: SHA_A,
    date: DATE,
    floorVersion: '2026.11.21.1',
    sleep: async () => {},
    listTags: async () => listing,
    pushTag: async ({ tag, sha }) => {
      pushes.push(tag);
      if (pushes.length === 1) {
        listing = [{ name: 'dev-2026.11.21.2', sha: SHA_B }];
        return { ok: false, message: 'already exists' };
      }
      listing = [...listing, { name: tag, sha }];
      return { ok: true };
    },
  });
  assert.equal(first.version, '2026.11.21.3');
  assert.equal(first.reuse, false);
  assert.deepEqual(pushes, ['dev-2026.11.21.2', 'dev-2026.11.21.3']);

  const reused = await allocateVersion({
    env: 'dev',
    sha: SHA_A,
    date: DATE,
    listTags: async () => listing,
    pushTag: async () => { throw new Error('should not push when reusing'); },
  });
  assert.equal(reused.reuse, true);
  assert.equal(reused.version, '2026.11.21.3');
});

test('allocateVersion stops immediately on a fatal tag push error', async () => {
  await assert.rejects(() => allocateVersion({
    env: 'prod',
    sha: SHA_A,
    date: DATE,
    listTags: async () => [],
    pushTag: async () => ({ ok: false, fatal: true, message: 'permission denied' }),
  }), /permission denied/);
});
