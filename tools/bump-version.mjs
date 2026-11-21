// Set the visible app version in VERSION and js/version.js.
// The number is the date in America/Los_Angeles, YYYY.MM.DD.N, where N starts at 1
// and goes up for later releases on the same day.
// Usage: node tools/bump-version.mjs
// js/version.js is precached, so this also refreshes sw-assets.json and the sw.js CACHE line.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writePlan } from './gen-sw-assets.mjs';

export const VERSION_RE = /^\d{4}\.\d{2}\.\d{2}\.\d+$/;
const DATE_N_RE = /^(\d{4}\.\d{2}\.\d{2})\.(\d+)$/;

export function todayStamp(now = new Date(), timeZone = 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}.${get('month')}.${get('day')}`;
}

export function nextVersion(current, today) {
  const match = String(current).trim().match(DATE_N_RE);
  if (match && match[1] === today) return `${today}.${Number(match[2]) + 1}`;
  return `${today}.1`;
}

export function versionJsSource(version) {
  return `// Visible version (parent view footer). Keep in sync with /VERSION (tests/parent.test.mjs checks).\nexport const VERSION = '${version}';\n`;
}

export function writeVersion(root, version) {
  if (!VERSION_RE.test(version)) throw new Error(`invalid version ${version}`);
  writeFileSync(join(root, 'VERSION'), `${version}\n`);
  writeFileSync(join(root, 'js/version.js'), versionJsSource(version));
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const current = readFileSync(join(root, 'VERSION'), 'utf8').trim();
  const version = nextVersion(current, todayStamp());
  writeVersion(root, version);
  writePlan(root);
  console.log(`${current} -> ${version}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
