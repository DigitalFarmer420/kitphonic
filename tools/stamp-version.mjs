// Stamp a YYYY.MM.DD.N version into a published tree at deploy time.
// Dev and production each count their own deploys from git tags
// (`dev-YYYY.MM.DD.N` and `vYYYY.MM.DD.N`). The date is America/Los_Angeles.
// The workflows call `deploy`; they do not commit the stamp back to the branch.
//
// Usage:
//   node tools/stamp-version.mjs compute --env dev|prod [--sha SHA] [--now ISO]
//       [--floor VER] [--floor-file PATH] [--tags-file PATH] [--repo DIR]
//   node tools/stamp-version.mjs stamp --version YYYY.MM.DD.N --root DIR
//   node tools/stamp-version.mjs deploy --env dev|prod --root DIR [--repo DIR] [--sha SHA]
import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { todayStamp, writeVersion, VERSION_RE } from './bump-version.mjs';
import { writePlan } from './gen-sw-assets.mjs';

export { todayStamp, writeVersion, VERSION_RE };

export const ENVS = {
  dev: { prefix: 'dev-' },
  prod: { prefix: 'v' },
};

const DATE_N_RE = /^(\d{4}\.\d{2}\.\d{2})\.(\d+)$/;

export function assertEnv(env) {
  if (!ENVS[env]) throw new Error(`unknown env ${env}; use dev or prod`);
  return ENVS[env];
}

export function parseVersion(value) {
  const match = String(value ?? '').trim().match(DATE_N_RE);
  if (!match) return null;
  return { version: `${match[1]}.${Number(match[2])}`, date: match[1], n: Number(match[2]) };
}

export function tagFor(env, version) {
  if (!VERSION_RE.test(version)) throw new Error(`invalid version ${version}`);
  return `${assertEnv(env).prefix}${version}`;
}

export function parseTag(name, env) {
  const { prefix } = assertEnv(env);
  const tag = String(name ?? '').trim();
  if (!tag.startsWith(prefix)) return null;
  const parsed = parseVersion(tag.slice(prefix.length));
  // Exact prefix + YYYY.MM.DD.N, so v1.0.0-rc10 and v2026.11.21.1-beta do not match.
  if (!parsed || tag !== `${prefix}${parsed.date}.${parsed.n}`) return null;
  return { ...parsed, tag, env };
}

export function parseTagList(text) {
  const tags = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [name, object, peeled] = line.split('\t');
    if (!name) continue;
    const sha = (peeled && peeled.trim()) || (object && object.trim()) || '';
    tags.push({ name: name.trim(), sha });
  }
  return tags;
}

export function shaEqual(a, b) {
  if (!a || !b) return false;
  const left = String(a).trim().toLowerCase();
  const right = String(b).trim().toLowerCase();
  if (left === right) return true;
  return left.length >= 7 && right.length >= 7 && (left.startsWith(right) || right.startsWith(left));
}

function tagEntries(tags) {
  return (tags || []).map((tag) => (typeof tag === 'string' ? { name: tag, sha: '' } : tag));
}

export function nextBuildVersion({ tags = [], env, date, floorVersion } = {}) {
  assertEnv(env);
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(date)) throw new Error(`invalid date ${date}`);
  let maxN = 0;
  for (const entry of tagEntries(tags)) {
    const parsed = parseTag(entry.name, env);
    if (parsed && parsed.date === date) maxN = Math.max(maxN, parsed.n);
  }
  const floor = parseVersion(floorVersion);
  if (floor && floor.date === date) maxN = Math.max(maxN, floor.n);
  return `${date}.${maxN + 1}`;
}

export function existingTagForSha({ tags = [], env, sha } = {}) {
  if (!sha) return null;
  const found = [];
  for (const entry of tagEntries(tags)) {
    const parsed = parseTag(entry.name, env);
    if (parsed && shaEqual(entry.sha, sha)) found.push({ ...parsed, sha: entry.sha });
  }
  if (!found.length) return null;
  found.sort((a, b) => a.n - b.n);
  return found[found.length - 1];
}

export function resolveVersion({ tags = [], env, sha, date, floorVersion } = {}) {
  assertEnv(env);
  const existing = existingTagForSha({ tags, env, sha });
  if (existing) {
    return {
      version: existing.version,
      tag: tagFor(env, existing.version),
      reuse: true,
      n: existing.n,
      date: existing.date,
    };
  }
  const version = nextBuildVersion({ tags, env, date, floorVersion });
  const parsed = parseVersion(version);
  return { version, tag: tagFor(env, version), reuse: false, n: parsed.n, date: parsed.date };
}

export function stampTree(root, version, { writeVersionFn = writeVersion, writePlanFn = writePlan } = {}) {
  writeVersionFn(root, version);
  writePlanFn(root);
}

export async function allocateVersion({
  env, sha, date, floorVersion, listTags, pushTag, maxAttempts = 5, sleep = delay,
} = {}) {
  assertEnv(env);
  if (typeof listTags !== 'function' || typeof pushTag !== 'function') {
    throw new Error('listTags and pushTag are required');
  }
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const tags = await listTags();
    const resolved = resolveVersion({ tags, env, sha, date, floorVersion });
    if (resolved.reuse) return resolved;
    const result = await pushTag({ tag: resolved.tag, sha, version: resolved.version, attempt });
    if (!result || result.ok) return resolved;
    if (result.fatal) {
      throw result.error || new Error(result.message || `failed to push ${resolved.tag}`);
    }
    lastError = result.error || result.message || `tag ${resolved.tag} rejected`;
    if (attempt < maxAttempts) await sleep(attempt * 200);
  }
  throw new Error(`could not allocate a ${env} version tag after ${maxAttempts} attempts: ${lastError}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function runGit(repo, args, { allowFail = false } = {}) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (result.status !== 0 && !allowFail) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

export function readTagsFromGit(repo) {
  const result = runGit(repo, [
    'for-each-ref', 'refs/tags', '--format=%(refname:short)\t%(objectname)\t%(*objectname)',
  ]);
  return parseTagList(result.stdout);
}

export function readTagsFromFile(path) {
  return parseTagList(readFileSync(path, 'utf8'));
}

export function readFloor(path) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}

function isTagRejected(result) {
  const text = `${result.stderr || ''}\n${result.stdout || ''}`.toLowerCase();
  return result.status !== 0 && (
    text.includes('already exists')
    || text.includes('rejected')
    || text.includes('failed to push some refs')
    || text.includes('reference already exists')
  );
}

export function gitPushTag({ repo, tag, sha, message }) {
  const existing = runGit(repo, ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { allowFail: true });
  if (existing.status === 0) {
    runGit(repo, ['tag', '-d', tag], { allowFail: true });
  }
  runGit(repo, ['tag', '-a', tag, sha, '-m', message]);
  const pushed = runGit(repo, ['push', 'origin', `refs/tags/${tag}`], { allowFail: true });
  if (pushed.status === 0) return { ok: true };
  runGit(repo, ['tag', '-d', tag], { allowFail: true });
  if (isTagRejected(pushed)) {
    return { ok: false, message: (pushed.stderr || pushed.stdout || 'tag rejected').trim() };
  }
  const detail = (pushed.stderr || pushed.stdout || '').trim();
  return { ok: false, fatal: true, message: detail || `git push refs/tags/${tag} failed` };
}

function writeOutputs(resolved, extra = {}) {
  const lines = [
    `version=${resolved.version}`,
    `tag=${resolved.tag}`,
    `reuse=${resolved.reuse}`,
    `n=${resolved.n}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const reused = resolved.reuse ? 'reused existing tag' : 'allocated new tag';
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Version\n\nStamped \`${resolved.version}\` (\`${resolved.tag}\`, ${reused}).\n`,
    );
  }
  return { ...resolved, ...extra };
}

function argValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (index === args.length - 1) throw new Error(`${name} needs a value`);
  return args[index + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function resolveNow(value) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid --now ${value}`);
  return date;
}

function floorFromArgs(args, repo) {
  if (hasFlag(args, '--floor')) return argValue(args, '--floor');
  return readFloor(argValue(args, '--floor-file', join(repo, 'VERSION')));
}

function computeFromArgs(args) {
  const env = argValue(args, '--env');
  const repo = argValue(args, '--repo', '.');
  const sha = argValue(args, '--sha', '');
  const date = todayStamp(resolveNow(argValue(args, '--now')));
  const floor = floorFromArgs(args, repo);
  const tags = hasFlag(args, '--tags-file')
    ? readTagsFromFile(argValue(args, '--tags-file'))
    : readTagsFromGit(repo);
  return resolveVersion({ tags, env, sha, date, floorVersion: floor });
}

async function deployFromArgs(args) {
  const env = argValue(args, '--env');
  const repo = argValue(args, '--repo', '.');
  const root = argValue(args, '--root', repo);
  const sha = argValue(args, '--sha') || runGit(repo, ['rev-parse', 'HEAD']).stdout.trim();
  const date = todayStamp(resolveNow(argValue(args, '--now')));
  const floor = floorFromArgs(args, repo);
  const maxAttempts = Number(argValue(args, '--max-attempts', '5')) || 5;

  runGit(repo, ['fetch', 'origin', '--tags', '--force']);
  const resolved = await allocateVersion({
    env,
    sha,
    date,
    floorVersion: floor,
    maxAttempts,
    listTags: () => {
      runGit(repo, ['fetch', 'origin', '--tags', '--force']);
      return readTagsFromGit(repo);
    },
    pushTag: ({ tag, sha: tagSha, version }) => gitPushTag({
      repo,
      tag,
      sha: tagSha,
      message: `Kitphonic ${env} ${version} (${tagSha})`,
    }),
  });
  stampTree(root, resolved.version);
  return resolved;
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (command === 'compute') {
    writeOutputs(computeFromArgs(args));
    return;
  }
  if (command === 'stamp') {
    const version = argValue(args, '--version');
    const root = argValue(args, '--root', '.');
    if (!version) throw new Error('stamp needs --version');
    stampTree(root, version);
    process.stdout.write(`stamped ${version} into ${root}\n`);
    return;
  }
  if (command === 'deploy') {
    writeOutputs(await deployFromArgs(args));
    return;
  }
  throw new Error('usage: node tools/stamp-version.mjs compute|stamp|deploy [options]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

export { main };
