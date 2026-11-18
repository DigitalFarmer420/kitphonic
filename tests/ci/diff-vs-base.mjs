// Screenshot diff of this PR against its base branch (usually develop), part of the report-only "uiux" job.
//   node tests/ci/diff-vs-base.mjs --head http://127.0.0.1:4310 --base http://127.0.0.1:4311 --browser webkit --out diff-out
// For every Uiux size and VISUAL_SCREENS screen it saves base.png, head.png, diff.png (pixelmatch: changed pixels in
// red) and marked.png (head with a red box around each changed region), plus summary.json. Exit code is always 0.
import { chromium, webkit } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { SCREENS, VISUAL_SCREENS, openScreen } from './screens.js';
import { UIUX_SIZES } from './playwright.ci.config.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const head = arg('head'), base = arg('base'), browserName = arg('browser', 'chromium'), out = arg('out', 'diff-out');
const only = arg('sizes', '').split(',').filter(Boolean); // e.g. --sizes 390x844 (local runs)
const CELL = 16;

function regions(diff, w, h) {
  // changed 16 px cells, grouped into connected boxes
  const cw = Math.ceil(w / CELL), ch = Math.ceil(h / CELL), hot = new Uint8Array(cw * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (diff[i] === 255 && diff[i + 1] === 0 && diff[i + 2] === 0) hot[Math.floor(y / CELL) * cw + Math.floor(x / CELL)] = 1;
  }
  const seen = new Uint8Array(cw * ch), boxes = [];
  for (let s = 0; s < hot.length; s++) {
    if (!hot[s] || seen[s]) continue;
    let x0 = cw, y0 = ch, x1 = 0, y1 = 0; const st = [s]; seen[s] = 1;
    while (st.length) {
      const c = st.pop(), cx = c % cw, cy = (c - cx) / cw;
      x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, n = ny * cw + nx;
        if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && hot[n] && !seen[n]) { seen[n] = 1; st.push(n); }
      }
    }
    boxes.push({ x: x0 * CELL, y: y0 * CELL, w: Math.min(w, (x1 + 1) * CELL) - x0 * CELL, h: Math.min(h, (y1 + 1) * CELL) - y0 * CELL });
  }
  return boxes;
}
function mark(png, boxes) {
  const out = PNG.sync.read(PNG.sync.write(png));
  const put = (x, y) => { if (x < 0 || y < 0 || x >= out.width || y >= out.height) return; const i = (y * out.width + x) * 4; out.data[i] = 230; out.data[i + 1] = 0; out.data[i + 2] = 0; out.data[i + 3] = 255; };
  for (const b of boxes) for (let t = 0; t < 3; t++) {
    for (let x = b.x - t; x <= b.x + b.w + t; x++) { put(x, b.y - t); put(x, b.y + b.h + t); }
    for (let y = b.y - t; y <= b.y + b.h + t; y++) { put(b.x - t, y); put(b.x + b.w + t, y); }
  }
  return out;
}

const browser = await (browserName === 'webkit' ? webkit : chromium).launch();
const rows = [];
for (const [w, h] of UIUX_SIZES) {
  if (only.length && !only.includes(`${w}x${h}`)) continue;
  for (const name of VISUAL_SCREENS) {
    const s = SCREENS.find((x) => x.name === name);
    const shot = async (url) => {
      const ctx = await browser.newContext({ baseURL: url, viewport: { width: w, height: h }, hasTouch: w < 1280, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      try { await openScreen(page, s); return PNG.sync.read(await page.screenshot({ animations: 'disabled', caret: 'hide' })); }
      catch (e) { return { error: String(e.message || e).split('\n')[0] }; }
      finally { await ctx.close(); }
    };
    const [b, hd] = [await shot(base), await shot(head)];
    const dir = `${out}/${browserName}/${w}x${h}/${name}`; mkdirSync(dir, { recursive: true });
    if (b.error || hd.error) { rows.push({ browser: browserName, size: `${w}x${h}`, screen: name, error: b.error ? `base: ${b.error}` : `head: ${hd.error}` }); continue; }
    const diff = new PNG({ width: w, height: h });
    const changed = pixelmatch(b.data, hd.data, diff.data, w, h, { threshold: 0.1, diffColor: [255, 0, 0], alpha: 0.2 });
    const boxes = changed ? regions(diff.data, w, h) : [];
    writeFileSync(`${dir}/base.png`, PNG.sync.write(b)); writeFileSync(`${dir}/head.png`, PNG.sync.write(hd));
    if (changed) { writeFileSync(`${dir}/diff.png`, PNG.sync.write(diff)); writeFileSync(`${dir}/marked.png`, PNG.sync.write(mark(hd, boxes))); }
    rows.push({ browser: browserName, size: `${w}x${h}`, screen: name, changedPixels: changed, ratio: +(changed / (w * h)).toFixed(5), regions: boxes.length });
    console.log(`${browserName} ${w}x${h} ${name}: ${changed} px changed, ${boxes.length} region(s)`);
  }
}
await browser.close();
writeFileSync(`${out}/${browserName}/summary.json`, JSON.stringify(rows, null, 1));
