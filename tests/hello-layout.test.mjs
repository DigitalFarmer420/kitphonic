// Welcome bubble: the long greeting wraps inside the existing border. Font, color, radius, and padding stay put.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const GREETING = "Hi! I'm Kit. Let's read together!";

function decls(selector) {
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sels = m[1].split(',').map(s => s.trim());
    if (sels.includes(selector)) out.push(m[2]);
  }
  return out;
}

test('hello greeting text is unchanged and is not hard-wrapped', () => {
  const hits = app.match(/hello-bubble'\)\.textContent = "([^"]+)"/g) || [];
  assert.equal(hits.length, 2);
  assert.ok(app.includes(`textContent = "${GREETING}"`));
  assert.equal(app.includes('<br'), false);
  assert.equal(css.includes('line-clamp'), false);
});

test('hello bubble wraps in an auto-height box and keeps 24px type', () => {
  const [bubble] = decls('#hello .bubble');
  assert.ok(bubble, 'missing #hello .bubble');
  assert.match(bubble, /font-size:24px/);
  assert.match(bubble, /white-space:normal/);
  assert.match(bubble, /height:auto/);
  assert.match(bubble, /width:max-content/);
  assert.match(bubble, /text-wrap:balance/);
  assert.match(bubble, /text-align:center/);
  assert.equal(bubble.includes('nowrap'), false);
  assert.equal(/height:\d/.test(bubble), false);
  assert.equal(bubble.includes('max-height'), false);
  assert.equal(bubble.includes('overflow'), false);
});

test('shared bubble chrome is unchanged', () => {
  const [bubble] = decls('.bubble');
  assert.match(bubble, /background:#fff/);
  assert.match(bubble, /border:2px solid var\(--line\)/);
  assert.match(bubble, /border-radius:22px/);
  assert.match(bubble, /padding:12px 18px/);
  assert.match(bubble, /font-weight:700/);
  assert.match(bubble, /max-width:330px/);
});

test('portrait and short hello bubbles do not cap lines or shrink type', () => {
  const [portrait] = decls('.portrait #hello .bubble');
  const [short] = decls('.short #hello .bubble');
  assert.match(portrait, /top:calc\(var\(--h\) \* \.13 \+ 228px\)/);
  assert.equal(portrait.includes('font-size'), false);
  assert.equal(portrait.includes('text-align'), false);
  assert.equal(portrait.includes('nowrap'), false);
  assert.equal(portrait.includes('max-height'), false);
  assert.match(short, /font-size:20px/);
  assert.match(short, /max-width:calc\(var\(--w\) - 48px\)/);
  assert.equal(short.includes('text-align'), false);
  assert.equal(short.includes('nowrap'), false);
  assert.equal(short.includes('max-height'), false);
  assert.equal(/height:\d/.test(short), false);
});
