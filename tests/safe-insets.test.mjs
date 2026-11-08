import test from 'node:test';
import assert from 'node:assert/strict';
import { stageFor, MIN_TOUCH, MIN_KNOB } from '../js/stage.js';
import { resolveSafeInsets, stageBox, envInsetsAllowed } from '../js/safe-insets.js';
import { layoutFor, wordLayout, KNOB } from '../js/layout.js';

const styleOf = (vars) => ({ getPropertyValue: name => vars[name] ?? '' });
const ANDROID124 = 'Mozilla/5.0 (Linux; Android 15; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.219 Mobile Safari/537.36';
const ANDROID140 = ANDROID124.replace('Chrome/124', 'Chrome/140');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test('explicit zero CSS insets win over env(), so native padding is not doubled', () => {
  const css = { top: 0, right: 0, bottom: 0, left: 0 };
  const got = resolveSafeInsets({ cssVars: css, envInsets: { top: 40, right: 0, bottom: 48, left: 0 }, userAgent: ANDROID140 });
  assert.equal(got.source, 'css-var');
  assert.deepEqual([got.top, got.right, got.bottom, got.left], [0, 0, 0, 0]);
  const box = stageBox(360, 780, got, stageFor);
  const plain = stageFor(360, 780);
  assert.equal(box.w, plain.w);
  assert.equal(box.h, plain.h);
  assert.equal(box.scale, plain.scale);
  assert.equal(box.mode, plain.mode);
});

test('WebView older than 140 does not trust env() when Capacitor has not set variables', () => {
  assert.equal(envInsetsAllowed(ANDROID124), false);
  assert.equal(envInsetsAllowed(ANDROID140), true);
  assert.equal(envInsetsAllowed(IPHONE), true);
  const got = resolveSafeInsets({
    cssVars: { top: null, right: null, bottom: null, left: null },
    envInsets: { top: 59, right: 0, bottom: 34, left: 0 },
    userAgent: ANDROID124,
  });
  assert.equal(got.source, 'native');
  assert.deepEqual([got.top, got.bottom], [0, 0]);
});

test('WebView 140 and iOS use real insets, and only once', () => {
  const env = { top: 32, right: 0, bottom: 48, left: 0 };
  const fromEnv = resolveSafeInsets({ cssVars: {}, envInsets: env, userAgent: ANDROID140 });
  assert.equal(fromEnv.source, 'env');
  assert.deepEqual([fromEnv.top, fromEnv.bottom], [32, 48]);
  const fromVar = resolveSafeInsets({ cssVars: { top: 32, right: 0, bottom: 48, left: 0 }, envInsets: { top: 32, right: 0, bottom: 48, left: 0 }, userAgent: ANDROID140 });
  assert.equal(fromVar.source, 'css-var');
  assert.deepEqual([fromVar.top, fromVar.bottom], [32, 48]);
  const iphone = resolveSafeInsets({ cssVars: {}, envInsets: { top: 59, right: 0, bottom: 34, left: 0 }, userAgent: IPHONE });
  assert.equal(iphone.source, 'env');
  assert.equal(iphone.top, 59);
});

function screenBox(box) {
  const sw = box.w * box.scale, sh = box.h * box.scale;
  return { left: box.cx - sw / 2, top: box.cy - sh / 2, right: box.cx + sw / 2, bottom: box.cy + sh / 2, sw, sh };
}

test('portrait, short landscape, and side cutout keep the stage inside the safe rect', () => {
  const cases = [
    { name: 'portrait bars', vw: 360, vh: 780, insets: { top: 32, right: 0, bottom: 48, left: 0 }, mode: 'portrait' },
    { name: 'short landscape bars', vw: 780, vh: 360, insets: { top: 24, right: 0, bottom: 48, left: 0 }, mode: 'short' },
    { name: 'short landscape cutout', vw: 844, vh: 390, insets: { top: 0, right: 0, bottom: 24, left: 47 }, mode: 'short' },
    { name: 'tall tablet', vw: 1180, vh: 820, insets: { top: 24, right: 0, bottom: 24, left: 0 }, mode: 'tall' },
  ];
  for (const c of cases) {
    const box = stageBox(c.vw, c.vh, c.insets, stageFor);
    const scr = screenBox(box);
    assert.equal(box.mode, c.mode, c.name);
    assert.ok(scr.top >= c.insets.top - 1, `${c.name} top ${scr.top}`);
    assert.ok(scr.left >= c.insets.left - 1, `${c.name} left ${scr.left}`);
    assert.ok(scr.bottom <= c.vh - c.insets.bottom + 1, `${c.name} bottom ${scr.bottom}`);
    assert.ok(scr.right <= c.vw - c.insets.right + 1, `${c.name} right ${scr.right}`);
    const safeW = c.vw - c.insets.left - c.insets.right, safeH = c.vh - c.insets.top - c.insets.bottom;
    const fitted = stageFor(safeW, safeH);
    assert.equal(box.scale, fitted.scale, c.name);
    assert.ok(scr.sw <= safeW + 1.5 && scr.sh <= safeH + 1.5, `${c.name} overflow ${scr.sw}x${scr.sh}`);
    assert.ok(Math.abs(scr.sw - safeW) <= 1.5 || Math.abs(scr.sh - safeH) <= 1.5, `${c.name} does not fill ${scr.sw}x${scr.sh} of ${safeW}x${safeH}`);
    assert.ok(72 * box.scale >= 48, `${c.name} button ${72 * box.scale}`);
  }
});

test('portrait phone with status and three-button bars still meets the 64px target', () => {
  const box = stageBox(360, 780, { top: 32, right: 0, bottom: 48, left: 0 }, stageFor);
  assert.ok(72 * box.scale >= MIN_TOUCH, `buttons ${72 * box.scale}`);
  assert.ok(KNOB * box.scale >= MIN_KNOB, `knob ${KNOB * box.scale}`);
  const lay = wordLayout(3, layoutFor(box));
  assert.ok(lay.rowLeft >= 0 && lay.rowLeft + lay.rowW <= box.w);
});

test('a keyboard that already shrank the viewport is not inset a second time', () => {
  const open = stageBox(390, 844 - 320, { top: 32, right: 0, bottom: 0, left: 0 }, stageFor);
  const scr = screenBox(open);
  assert.ok(scr.bottom <= (844 - 320) + 1);
  assert.ok(scr.top >= 31);
  const doubled = stageBox(390, 844 - 320, { top: 32, right: 0, bottom: 320, left: 0 }, stageFor);
  assert.ok(screenBox(doubled).sh < scr.sh - 100);
});

test('css var reader treats blank as unset and zero as set', async () => {
  const { cssVarsFromInline } = await import('../js/safe-insets.js');
  const blank = cssVarsFromInline(styleOf({}));
  assert.deepEqual(blank, { top: null, right: null, bottom: null, left: null });
  const zero = cssVarsFromInline(styleOf({
    '--safe-area-inset-top': '0px', '--safe-area-inset-right': '0px',
    '--safe-area-inset-bottom': '0px', '--safe-area-inset-left': '0px',
  }));
  assert.deepEqual(zero, { top: 0, right: 0, bottom: 0, left: 0 });
});
