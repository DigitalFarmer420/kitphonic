// Welcome bubble: the long greeting wraps inside the existing border. Font, color, radius, and padding stay put.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
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
  assert.match(bubble, /font-size:1\.5rem/); // 24 stage px, screen size follows the root rem scale
  assert.match(bubble, /white-space:normal/);
  assert.match(bubble, /height:auto/);
  assert.match(bubble, /width:max-content/);
  assert.match(bubble, /text-wrap:balance/);
  assert.match(bubble, /text-align:center/);
  assert.equal(bubble.includes('nowrap'), false);
  assert.equal(/(?:^|;)height:\d/.test(';' + bubble), false); // never a fixed height
  assert.match(bubble, /margin-top:max\(1rem, calc\(14\.75rem - var\(--h\) \* \.34\)\)/);
  // No overlap (Vinh, Nov 20): the bubble never collapses or scrolls; Kit (with the paw) shrinks instead.
  assert.equal(bubble.includes('max-height'), false);
  assert.equal(/overflow-y:(auto|scroll)/.test(bubble), false);
  assert.match(bubble, /flex:none/);
  const [kit] = decls('#hello .kitwrap');
  assert.match(kit, /flex:0 1 auto/);
  assert.match(kit, /aspect-ratio:1/);
  const [paw] = decls('#hello .paw');
  assert.match(paw, /right:-?[\d.]+%;top:[\d.]+%;width:[\d.]+%;height:[\d.]+%/); // the paw scales with Kit
  assert.equal(bubble.includes('position:absolute'), false);
  const [hello] = decls('#hello');
  assert.match(hello, /display:flex/);
  assert.match(hello, /flex-direction:column/);
  assert.match(hello, /padding-top:calc\(var\(--h\) \* \.1\)/);
  assert.match(hello, /padding-bottom:calc\(var\(--h\) \* \.12\)/);
});

test('shared bubble chrome is unchanged', () => {
  const [bubble] = decls('.bubble');
  assert.match(bubble, /background:#fff/);
  assert.match(bubble, /border:0\.125rem solid var\(--line\)/);
  assert.match(bubble, /border-radius:1\.375rem/);
  assert.match(bubble, /padding:0\.75rem 1\.125rem/);
  assert.match(bubble, /font-weight:700/);
  assert.match(bubble, /max-width:20\.625rem/);
});

test('hello bubble can be focused from the keyboard without a live region', () => {
  const tag = html.match(/<div class="bubble" id="hello-bubble"[^>]*>/);
  assert.ok(tag, 'missing #hello-bubble');
  assert.match(tag[0], /tabindex="0"/);
  assert.match(tag[0], /role="region"/);
  assert.match(tag[0], /aria-label="Kit says"/);
  assert.equal(tag[0].includes('aria-live'), false);
  const [ring] = decls('#hello-bubble:focus-visible');
  assert.match(ring, /outline:4px solid var\(--skyd\)/);
  assert.match(ring, /outline-offset:3px/);
});

test('portrait and short hello bubbles do not cap lines or shrink type', () => {
  const [portrait] = decls('.portrait #hello .bubble');
  const [short] = decls('.short #hello .bubble');
  assert.match(portrait, /margin-top:max\(0\.5rem, calc\(14\.25rem - var\(--h\) \* \.34\)\)/);
  assert.equal(portrait.includes('font-size'), false);
  assert.equal(portrait.includes('text-align'), false);
  assert.equal(portrait.includes('nowrap'), false);
  assert.equal(portrait.includes('max-height'), false);
  assert.match(short, /margin-top:0\.5rem/);
  assert.match(short, /font-size:1\.25rem/);
  assert.match(short, /max-width:calc\(var\(--w\) - 3rem\)/);
  assert.equal(short.includes('text-align'), false);
  assert.equal(short.includes('nowrap'), false);
  assert.equal(short.includes('max-height'), false);
  assert.equal(/height:\d/.test(short), false);
});
