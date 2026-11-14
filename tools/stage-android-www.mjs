// Packaging-only: copy the rc8 static app into www/ for Capacitor. Does not modify sources.
// Included: index.html, js/, css/, self-hosted fonts, and audio/ (manifest, takes, placeholders).
// Excluded: tests, tools, design, screenshots, mockups, and this script's output.
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');
await rm(www, { recursive: true, force: true });
await mkdir(www, { recursive: true });
await cp(join(root, 'index.html'), join(www, 'index.html'));
for (const dir of ['js', 'css', 'audio']) {
  await cp(join(root, dir), join(www, dir), { recursive: true });
}
await mkdir(join(www, 'fonts'), { recursive: true });
for (const file of ['fonts.css', 'andika-400.woff2', 'andika-700.woff2', 'fredoka-var.woff2', 'nunito-var.woff2']) {
  await cp(join(root, 'fonts', file), join(www, 'fonts', file));
}
console.log('staged rc8 web assets in', www);
