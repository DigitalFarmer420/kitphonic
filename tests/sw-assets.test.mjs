// The committed precache list has to match the files that actually ship. Same shape as the
// app-icon generator check: --check fails the test when sw-assets.json or the sw.js cache name is stale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPlan, diffPlan, committedProblems, cacheLine } from '../tools/gen-sw-assets.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('generator --check passes against the committed asset list', () => {
  const run = spawnSync(process.execPath, ['tools/gen-sw-assets.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});

test('a stale shell, take, or cache name does not match the build', () => {
  const plan = buildPlan(root);
  assert.deepEqual(committedProblems(root, plan), []);
  const take = plan.audio.find(path => path.endsWith('/snd-s.mp3'));
  assert.ok(take, 'snd-s take is part of the shipped list');
  assert.deepEqual(diffPlan(plan, { cache: plan.cache, shell: plan.shell, audio: plan.audio.filter(path => path !== take) }), ['audio']);
  assert.deepEqual(diffPlan(plan, { cache: plan.cache, shell: plan.shell.filter(path => path !== 'index.html'), audio: plan.audio }), ['shell']);
  assert.deepEqual(diffPlan(plan, { cache: 'kitphonic-ffffffffffffffff', shell: plan.shell, audio: plan.audio }), ['cache']);
  assert.equal(cacheLine("export const CACHE = 'kitphonic-0123abcd0123abcd';\n"), 'kitphonic-0123abcd0123abcd');
  assert.equal(cacheLine('export const CACHE = "nope";'), null);
  assert.ok(plan.shell.includes('index.html'));
  assert.ok(plan.shell.includes('css/app.css'));
  assert.ok(plan.shell.includes('js/app.js'));
  assert.ok(plan.shell.includes('js/sw-register.js'));
  assert.ok(plan.shell.includes('audio/manifest.json'));
  assert.ok(plan.shell.includes('fonts/andika-700.woff2'));
  assert.ok(plan.shell.includes('icons/favicon-32.png'));
  assert.equal(plan.shell.includes('icons/symbol-1024.png'), false);
  assert.equal(plan.shell.includes('sw.js'), false);
  assert.ok(plan.audio.every(path => path.startsWith('audio/takes/') && path.endsWith('.mp3')));
});
