import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url);
const read = rel => readFileSync(new URL(rel, root), 'utf8');
const sha = rel => createHash('sha256').update(readFileSync(new URL(rel, root))).digest('hex');
const MASTER = '4a45274b45d588c5b697b72a7d16e4aeb36c05afdd72e9bfac64f393c8204871';

test('approved speaking-book master is unchanged', () => {
  assert.equal(sha('icons/symbol-1024.png'), MASTER);
  assert.equal(readFileSync(new URL('icons/symbol-1024.png', root)).length, 439220);
});

test('favicon links replace the empty icon and do not add a service worker', () => {
  const html = read('index.html');
  assert.match(html, /href="icons\/favicon-32.png"/);
  assert.match(html, /href="icons\/favicon-48.png"/);
  assert.match(html, /href="icons\/apple-touch-180.png"/);
  assert.equal(html.includes('data:,'), false);
  assert.equal(html.includes('serviceWorker'), false);
  assert.equal(html.includes('manifest.webmanifest'), false);
  assert.match(html, /id="kit"/);
  assert.equal(read('VERSION').trim(), '1.0.0-rc10');
});

test('launch theme points the system splash at the safe-fit icon', () => {
  const css = read('android-icons/res/values/styles.xml');
  assert.match(css, /parent="Theme\.SplashScreen"/);
  assert.match(css, /android:background">@drawable\/splash/);
  assert.match(css, /windowSplashScreenBackground">@color\/ic_launcher_background/);
  assert.match(css, /windowSplashScreenAnimatedIcon">@drawable\/splash_icon/);
  assert.equal(css.includes('fitsSystemWindows'), false);
  assert.equal(css.includes('windowSplashScreenIconBackgroundColor'), false);
  let foundV31 = false;
  const walk = (dir) => {
    for (const name of readdirSync(new URL(dir, root))) {
      const rel = dir + name;
      const st = statSync(new URL(rel, root));
      if (st.isDirectory()) walk(rel + '/');
      else if (name.includes('preview') || name.includes('contact') || rel.includes('values-v31')) foundV31 = true;
    }
  };
  walk('android-icons/');
  walk('icons/');
  assert.equal(foundV31, false);
});

test('generator is bound to the master and keeps both rays inside the splash circle', () => {
  const run = spawnSync('python3', ['tools/build-app-icon.py', '--check'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(read('android-icons/build-report.json'));
  assert.equal(report.master_sha256, MASTER);
  assert.equal(report.adaptive_yellow_inside_72dp_circle, true);
  assert.ok(report.favicon32_yellow_sides[0] >= 1 && report.favicon32_yellow_sides[1] >= 1);
  assert.ok(report.favicon48_yellow_sides[0] >= 1 && report.favicon48_yellow_sides[1] >= 1);
  assert.equal(report.background, '#FFF8E6');
  assert.equal(sha('android-icons/res/drawable-nodpi/splash_icon.png'), report.outputs['android-icons/res/drawable-nodpi/splash_icon.png'].sha256);
});
