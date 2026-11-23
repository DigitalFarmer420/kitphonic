// List the files sw.js precaches. `node tools/gen-sw-assets.mjs` writes sw-assets.json and the
// cache name in sw.js. `--check` fails when either committed file is stale.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CACHE_LINE = /^export const CACHE = '(kitphonic-[0-9a-f]+)';$/m;

function exists(root, rel) {
  try { return statSync(join(root, rel)).isFile(); }
  catch { return false; }
}

function sizeOf(root, rel) {
  return statSync(join(root, rel)).size;
}

export function cacheLine(source) {
  const match = source.match(CACHE_LINE);
  return match ? match[1] : null;
}

export function buildPlan(root) {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const webManifest = /<link rel="manifest" href="manifest\.webmanifest">/.test(html) ? ['manifest.webmanifest'] : [];
  const manifestIcons = webManifest.length
    ? JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8')).icons.map(icon => icon.src)
    : [];
  const icons = [...new Set([...[...html.matchAll(/"(icons\/[^"]+)"/g)].map(m => m[1]), ...manifestIcons])].sort();
  if (!icons.length) throw new Error('index.html does not reference icons/');
  const js = readdirSync(join(root, 'js')).filter(name => name.endsWith('.js')).sort().map(name => `js/${name}`);
  const fonts = readdirSync(join(root, 'fonts')).filter(name => name.endsWith('.css') || name.endsWith('.woff2')).sort().map(name => `fonts/${name}`);
  const manifest = JSON.parse(readFileSync(join(root, 'audio/manifest.json'), 'utf8'));
  const audio = [...new Set(manifest.clips.filter(clip => clip.take).map(clip => `audio/${clip.take}`))].sort();
  const shell = [...new Set([
    'index.html', ...webManifest, 'css/app.css', ...fonts, ...js, ...icons, 'audio/manifest.json', 'sw-assets.json',
  ])];
  const hashed = [...shell.filter(path => path !== 'sw-assets.json'), ...audio].sort();
  for (const rel of hashed) {
    if (!exists(root, rel)) throw new Error(`missing shipped file ${rel}`);
  }
  const hash = createHash('sha256');
  let bytes = 0;
  for (const rel of hashed) {
    const body = readFileSync(join(root, rel));
    bytes += body.length;
    hash.update(rel);
    hash.update('\0');
    hash.update(body);
    hash.update('\0');
  }
  const audioSet = new Set(audio);
  let audioBytes = 0;
  for (const rel of hashed) if (audioSet.has(rel)) audioBytes += sizeOf(root, rel);
  const cache = `kitphonic-${hash.digest('hex').slice(0, 16)}`;
  const json = `${JSON.stringify({ cache, shell, audio }, null, 2)}\n`;
  const shellBytes = bytes - audioBytes + Buffer.byteLength(json);
  bytes = shellBytes + audioBytes;
  return {
    cache, shell, audio, json, bytes, shellBytes, audioBytes,
    files: shell.length + audio.length, shellFiles: shell.length, audioFiles: audio.length,
  };
}

export function diffPlan(expected, actual) {
  const problems = [];
  if (expected.cache !== actual.cache) problems.push('cache');
  if (JSON.stringify(expected.shell) !== JSON.stringify(actual.shell)) problems.push('shell');
  if (JSON.stringify(expected.audio) !== JSON.stringify(actual.audio)) problems.push('audio');
  return problems;
}

export function committedProblems(root, plan = buildPlan(root)) {
  const problems = [];
  let committed;
  try { committed = JSON.parse(readFileSync(join(root, 'sw-assets.json'), 'utf8')); }
  catch { return ['sw-assets.json missing']; }
  for (const kind of diffPlan(plan, committed)) problems.push(`${kind} list is stale`);
  const name = cacheLine(readFileSync(join(root, 'sw.js'), 'utf8'));
  if (name !== plan.cache) problems.push(`sw.js CACHE is ${name || 'missing'}, expected ${plan.cache}`);
  return problems;
}

export function writePlan(root, plan = buildPlan(root)) {
  writeFileSync(join(root, 'sw-assets.json'), plan.json);
  const swPath = join(root, 'sw.js');
  const source = readFileSync(swPath, 'utf8');
  if (!CACHE_LINE.test(source)) throw new Error('sw.js has no CACHE line to stamp');
  writeFileSync(swPath, source.replace(CACHE_LINE, `export const CACHE = '${plan.cache}';`));
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const plan = buildPlan(root);
  if (process.argv.includes('--check')) {
    const problems = committedProblems(root, plan);
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log(`ok ${plan.files} files ${plan.bytes} bytes ${plan.cache} shell ${plan.shellFiles} ${plan.shellBytes} audio ${plan.audioFiles} ${plan.audioBytes}`);
    return;
  }
  writePlan(root, plan);
  console.log(`wrote ${plan.files} files ${plan.bytes} bytes ${plan.cache} shell ${plan.shellFiles} ${plan.shellBytes} audio ${plan.audioFiles} ${plan.audioBytes}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
