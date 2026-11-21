import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { todayStamp, nextVersion, writeVersion, versionJsSource, VERSION_RE } from '../tools/bump-version.mjs';

test('VERSION file matches js/version.js and uses YYYY.MM.DD.N', async () => {
  const { VERSION } = await import('../js/version.js');
  const file = readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
  assert.equal(file, VERSION);
  assert.match(VERSION, VERSION_RE);
});

test('next version is .1 on a new day, and N goes up on the same day', () => {
  assert.equal(nextVersion('1.0.0-rc13', '2026.11.21'), '2026.11.21.1');
  assert.equal(nextVersion('2026.11.20.4', '2026.11.21'), '2026.11.21.1');
  assert.equal(nextVersion('2026.11.21.1', '2026.11.21'), '2026.11.21.2');
  assert.equal(nextVersion('2026.11.21.9', '2026.11.21'), '2026.11.21.10');
  assert.equal(nextVersion(' 2026.11.21.2\n', '2026.11.21'), '2026.11.21.3');
});

test('todayStamp is the calendar date in America/Los_Angeles', () => {
  // 2026-11-21 00:30 PT is 2026-11-21 08:30 UTC.
  assert.equal(todayStamp(new Date('2026-11-21T08:30:00Z')), '2026.11.21');
  // 2026-11-21 23:30 PT is 2026-11-22 07:30 UTC; still the 21st in PT.
  assert.equal(todayStamp(new Date('2026-11-22T07:30:00Z')), '2026.11.21');
  // Just after midnight PT is the next day.
  assert.equal(todayStamp(new Date('2026-11-22T08:00:00Z')), '2026.11.22');
  // January keeps a leading zero on the month and day.
  assert.equal(todayStamp(new Date('2026-01-05T20:00:00Z')), '2026.01.05');
});

test('writeVersion updates VERSION and js/version.js together', () => {
  const root = mkdtempSync(join(tmpdir(), 'kp-version-'));
  mkdirSync(join(root, 'js'));
  writeFileSync(join(root, 'VERSION'), '1.0.0-rc13\n');
  writeFileSync(join(root, 'js/version.js'), versionJsSource('1.0.0-rc13'));
  writeVersion(root, '2026.11.21.1');
  assert.equal(readFileSync(join(root, 'VERSION'), 'utf8'), '2026.11.21.1\n');
  assert.equal(readFileSync(join(root, 'js/version.js'), 'utf8'), versionJsSource('2026.11.21.1'));
  assert.throws(() => writeVersion(root, '1.0.0-rc14'), /invalid version/);
});
