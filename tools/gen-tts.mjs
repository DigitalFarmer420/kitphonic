// Generate recorded takes with xAI TTS (voice Eve) into audio/takes/<id>.mp3 and point manifest `take` at them.
// Usage: node tools/gen-tts.mjs [--ids a,b] [--speed 0.9] [--out-suffix -calm] [--limit N] [--no-manifest] [--force]
// The key is read from the file named by $XAI_API_KEY_FILE (kept outside the repo) and never printed. Stops at the first
// credit/permission error. rc3 takes were post-processed by tools/audio_qa/process.py (trim, phoneme cuts, -16 LUFS).
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const flag = k => process.argv.includes(k);
if (!process.env.XAI_API_KEY_FILE) { console.error('set XAI_API_KEY_FILE to the path of the xAI key file'); process.exit(1); }
const key = fs.readFileSync(process.env.XAI_API_KEY_FILE, 'utf8').trim();
const mPath = path.join(root, 'audio/manifest.json'), m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
const ids = arg('--ids')?.split(','), speed = +arg('--speed', '1.0'), suffix = arg('--out-suffix', ''), limit = +arg('--limit', '1e9');
const textOverride = arg('--text');
fs.mkdirSync(path.join(root, 'audio/takes'), { recursive: true });
let todo = m.clips.filter(c => c.tts && (ids ? ids.includes(c.id) : flag('--force') || !c.take)).slice(0, limit);
let ok = 0, fail = [], stop = null;
async function one(c) {
  const file = `takes/${c.id}${suffix}.mp3`, body = { text: textOverride ?? c.tts, voice_id: 'eve', language: 'en', speed };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (stop) return;
    const r = await fetch('https://api.x.ai/v1/tts', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (b.length < 200) { fail.push([c.id, 'tiny response']); return; }
      fs.writeFileSync(path.join(root, 'audio', file), b); if (!flag('--no-manifest') && !suffix) c.take = file; ok++; return; }
    const t = (await r.text()).slice(0, 160).replace(/Bearer \S+/g, '');
    if (r.status === 401 || r.status === 402 || r.status === 403) { stop = `${r.status} ${t}`; return; }
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 2000 * (attempt + 1))); continue; }
    fail.push([c.id, `${r.status} ${t}`]); return;
  }
  fail.push([c.id, 'retries exhausted']);
}
const conc = 4; let i = 0;
await Promise.all(Array.from({ length: conc }, async () => { while (i < todo.length && !stop) { const c = todo[i++]; await one(c); if ((ok + fail.length) % 50 === 0) { fs.writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n'); console.log(`progress ${ok}/${todo.length}`); } } }));
fs.writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n');
console.log(JSON.stringify({ requested: todo.length, ok, failed: fail.length, stoppedBy: stop, failures: fail.slice(0, 20) }));
