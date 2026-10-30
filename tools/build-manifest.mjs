// npm run manifest — regenerate audio/manifest.json and the placeholder SFX (ffmpeg, if installed).
import { readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../js/manifest.js';

const audio = fileURLToPath(new URL('../audio/', import.meta.url));
mkdirSync(audio + 'takes', { recursive: true }); mkdirSync(audio + 'placeholder', { recursive: true });
const takes = readdirSync(audio + 'takes').filter(f => !f.startsWith('.'));
const m = buildManifest(takes);
writeFileSync(audio + 'manifest.json', JSON.stringify(m, null, 2) + '\n');

// Placeholder SFX: soft two-note chime (C6+E6 then G6, quick decay, <1 s) and a tiny tap tick.
const sfx = {
  'sfx-chime.wav': "aevalsrc='0.22*(sin(2*PI*1046.5*t)+0.8*sin(2*PI*1318.5*t))*exp(-5*t)+0.18*sin(2*PI*1568*t)*exp(-6*max(t-0.12,0))*gte(t,0.12)':s=44100:d=0.8",
  'sfx-tap.wav': "aevalsrc='0.25*sin(2*PI*880*t)*exp(-40*t)':s=44100:d=0.12",
};
for (const [f, src] of Object.entries(sfx)) {
  const out = audio + 'placeholder/' + f;
  if (existsSync(out)) continue;
  try { execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', src, '-ac', '1', out]); }
  catch { console.warn(`ffmpeg unavailable; ${f} not generated (app falls back to a WebAudio tone)`); }
}
console.log(`manifest: ${m.count} clips, ${m.clips.filter(c => c.take).length} recorded takes -> audio/manifest.json`);
