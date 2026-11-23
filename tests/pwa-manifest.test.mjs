// Android Chrome only offers "Install app" when index.html links a valid web app manifest.
// These checks keep the manifest installable for both deployments (/kitphonic/ and /kitphonic-dev/).
// tests/e2e/pwa-install.spec.js asks Chrome itself (Page.getInstallabilityErrors).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const read = rel => readFileSync(new URL(rel, root));
const manifest = JSON.parse(read('manifest.webmanifest').toString('utf8'));

function pngSize(buf) {
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test('index.html links the manifest with a relative href', () => {
  const html = read('index.html').toString('utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  // iOS keeps its own tags.
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-180.png">/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
});

test('manifest has the fields Chrome needs to install', () => {
  assert.equal(manifest.name, 'Kitphonic');
  assert.equal(manifest.short_name, 'Kitphonic');
  assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display));
  assert.notEqual(manifest.prefer_related_applications, true);
  assert.match(manifest.background_color, /^#[0-9A-F]{6}$/i);
  assert.match(manifest.theme_color, /^#[0-9A-F]{6}$/i);
});

test('start_url, scope and id stay inside each deployment path', () => {
  for (const base of ['https://digitalfarmer420.github.io/kitphonic/', 'https://digitalfarmer420.github.io/kitphonic-dev/']) {
    const murl = new URL('manifest.webmanifest', base);
    const start = new URL(manifest.start_url, murl);
    const scope = new URL(manifest.scope, murl);
    const id = new URL(manifest.id, start);
    assert.equal(start.href, base);
    assert.equal(scope.href, base);
    assert.equal(id.href, base, 'each deployment installs as its own app');
    assert.ok(start.href.startsWith(scope.href));
  }
  for (const key of ['start_url', 'scope', 'id']) assert.ok(!manifest[key].startsWith('/'), `${key} must be relative`);
});

test('icons are real PNGs at their stated sizes, with 192, 512 and a maskable one', () => {
  const have = new Set();
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith('/'), `${icon.src} must be relative`);
    assert.equal(icon.type, 'image/png');
    const [w, h] = pngSize(read(icon.src));
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
    have.add(`${icon.sizes}:${icon.purpose || 'any'}`);
  }
  assert.ok(have.has('192x192:any'));
  assert.ok(have.has('512x512:any'));
  assert.ok(have.has('512x512:maskable'));
});

test('the worker precaches the manifest and its icons', () => {
  const assets = JSON.parse(read('sw-assets.json').toString('utf8'));
  assert.ok(assets.shell.includes('manifest.webmanifest'));
  for (const icon of manifest.icons) assert.ok(assets.shell.includes(icon.src), icon.src);
});

test('the dev deploy names the dev install "Kitphonic DEV" and keeps paths relative', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kp-devsite-'));
  writeFileSync(join(dir, 'index.html'), read('index.html'));
  writeFileSync(join(dir, 'manifest.webmanifest'), read('manifest.webmanifest'));
  for (let i = 0; i < 2; i++) {
    const run = spawnSync('python3', ['.github/dev/inject-dev-badge.py', join(dir, 'index.html')], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  }
  const dev = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(dev.name, 'Kitphonic DEV');
  assert.equal(dev.short_name, 'Kitphonic DEV');
  assert.deepEqual({ ...dev, name: manifest.name, short_name: manifest.short_name }, manifest);
});
