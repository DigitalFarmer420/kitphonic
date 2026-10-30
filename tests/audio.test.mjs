// rc3: recorded takes (xAI Eve, upbeat) replace browser speech. Every spoken clip must ship a take file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CONFIG } from '../js/config.js';
import { HOT } from '../js/audio.js';

const root = new URL('../audio/', import.meta.url);
const m = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const ffprobe = (() => { try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const dur = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();

test('every manifest clip with tts has an existing, non-trivial take file', () => {
  const spoken = m.clips.filter(c => c.tts);
  assert.ok(spoken.length > 800);
  for (const c of spoken) {
    assert.ok(c.take, `${c.id} has no take`);
    const f = new URL(c.take, root);
    assert.ok(existsSync(f), `${c.id}: ${c.take} missing`);
    assert.ok(statSync(f).size > 1000, `${c.id}: ${c.take} too small`);
  }
});

test('no stray files in audio/takes (style tests etc. stay out of the app)', () => {
  const used = new Set(m.clips.map(c => c.take).filter(Boolean).map(t => t.replace(/^takes\//, '')));
  for (const f of readdirSync(new URL('takes/', root)).filter(f => !f.startsWith('.'))) assert.ok(used.has(f), `unreferenced take ${f}`);
});

test('the upbeat "slide it again" take is the default', () => {
  assert.equal(CONFIG.voice, 'upbeat');
  assert.ok(m.clips.find(c => c.id === 'm-slide-again-upbeat')?.take);
});

test('hot set (warmed after unlock) is small: letter sounds/names, Kit lines, sfx only', () => {
  const hot = m.clips.filter(c => HOT.test(c.id));
  assert.ok(hot.length < 200, `${hot.length} hot clips`);
  assert.ok(!hot.some(c => /^(word|reveal|sent|pic|star)-/.test(c.id)));
});

test('phoneme takes: held ~1 s (<= 1.3 s), short sounds brief (stops <= 0.35 s)', { skip: !ffprobe && 'ffprobe not installed' }, () => {
  const STOPS = new Set(['t', 'p', 'd', 'c', 'k', 'ck', 'g', 'b', 'j']);
  for (const c of m.clips.filter(c => c.id.startsWith('snd-'))) {
    const d = dur(new URL(c.take, root).pathname), g = c.id.slice(4).replace(/-held$/, '');
    if (c.kind === 'letter-sound-held') assert.ok(d >= 0.6 && d <= 1.3, `${c.id} ${d}s`);
    else if (STOPS.has(g)) assert.ok(d <= 0.35, `${c.id} ${d}s (stop sounds are clipped short)`);
    else assert.ok(d <= 0.9, `${c.id} ${d}s`);
  }
});

test('rc4: early clips (hello, sfx, first lesson prompt) are takes, preloaded in index.html at their conventional path', async () => {
  const { EARLY_CLIPS, earlyFile } = await import('../js/audio.js');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(EARLY_CLIPS.includes('m-hello') && EARLY_CLIPS.includes('sfx-chime') && EARLY_CLIPS.includes('sfx-tap'));
  for (const id of EARLY_CLIPS) {
    const c = m.clips.find(x => x.id === id);
    assert.equal(c?.take, earlyFile(id), id);
    assert.ok(html.includes(`<link rel="preload" href="audio/${earlyFile(id)}" as="fetch" crossorigin>`), `preload ${id}`);
    assert.ok(statSync(new URL(c.take, root)).size < 30000, `${id} small`);
  }
  assert.ok(html.includes('<link rel="preload" href="audio/manifest.json" as="fetch" crossorigin>'));
});

test('rc4: Start registers on pointerdown; locked sentence words nudge the current word (reduced motion = still glow)', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  const sn = readFileSync(new URL('../js/star-screen.js', import.meta.url), 'utf8');
  assert.match(app, /\$\('play'\)\.addEventListener\('pointerdown'[^\n]*classList\.add\('pressed'\)/);
  assert.match(css, /#play\.pressed\{/);
  assert.match(css, /\.wd:not\(\.cur\)\{min-width:0;pointer-events:none\}/); // locked words stay inert
  assert.match(css, /\.wd\.cur\.nudge\{animation:wdbounce/); assert.match(css, /\.wd\.cur\.nudge-still\{/);
  assert.match(sn, /reduced\(\) \? 'nudge-still' : 'nudge'/); assert.match(sn, /audio\.play\('sfx-tap'\)/);
});
