// Fluid board: rem scale tracks the viewport, controls stay at the touch floor, 4K does not grow past 1080p.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stageFor, buttonPx, knobPx, MIN_TOUCH, MIN_KNOB, MAX_SCALE, rootFontPx, readPreferredRootPx, textScale, TEXT_SCALE_MAX, legacyStage, PHONE_MIN_W } from '../js/stage.js';
import { stageBox } from '../js/safe-insets.js';
import { layoutFor, wordLayout } from '../js/layout.js';
import { mapLayout, mapWindow } from '../js/map-layout.js';
import { mapState } from '../js/progress.js';
import { seedProgress } from '../js/dev-seed.js';

const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

// The sweep the layout has to survive. Insets are applied on top of the viewport, not inside it.
const CASES = [
  { name: '320x568', vw: 320, vh: 568 },
  { name: '360x640', vw: 360, vh: 640, insets: { top: 24, right: 0, bottom: 48, left: 0 } },
  { name: '780x360 bars', vw: 780, vh: 360, insets: { top: 24, right: 0, bottom: 48, left: 0 } },
  { name: '360x780', vw: 360, vh: 780 },
  { name: '390x844', vw: 390, vh: 844 },
  { name: '844x390', vw: 844, vh: 390 },
  { name: '820x1180', vw: 820, vh: 1180 },
  { name: '1180x820', vw: 1180, vh: 820 },
  { name: '800x700', vw: 800, vh: 700 },
  { name: '1920x1080', vw: 1920, vh: 1080 },
  { name: '3840x2160', vw: 3840, vh: 2160 },
];

function placed(c) {
  const insets = c.insets || { top: 0, right: 0, bottom: 0, left: 0 };
  return stageBox(c.vw, c.vh, insets, stageFor);
}

test('stylesheet is fluid: dvh root, rem controls, clamp floors, no counter-zoom', () => {
  assert.match(css, /height:100dvh/);
  assert.match(css, /min-height:100svh/);
  assert.match(css, /font-size:clamp\(12px, 4vw, 32px\)/);
  assert.match(css, /4dvh/);
  assert.match(css, /\.btn,#speaker\{width:clamp\(64px, 4\.5rem, 9rem\)/);
  assert.match(css, /#handle,#sn-handle\{width:clamp\(80px, 5\.625rem, 11\.25rem\)/);
  assert.match(css, /#parent\{position:fixed/);
  assert.equal(css.includes('zoom:calc'), false);
  assert.match(css, /\.ptile\{min-width:48px;min-height:48px/);
  assert.match(app, /letters\?\.relayout/);
});

test('each screen is an inline-size container and the theme is unchanged', () => {
  assert.match(css, /\.screen\{position:absolute;inset:0;container-type:inline-size;container-name:screen\}/);
  assert.equal(css.includes('container-type:size'), false); // block-size containment can clip overflow:visible
  assert.equal(/#stage\{[^}]*container/.test(css), false);
  assert.equal(css.includes('#turn'), false);
  assert.match(css, /--cream:#FFF8EC;--cream2:#FBEFDC;--ink:#3A2E28/);
  assert.match(css, /font-family:'Nunito',system-ui,sans-serif/);
  assert.match(css, /font-family:'Andika',sans-serif/);
  assert.match(css, /font-family:'Fredoka'/);
});

test('a normal text setting keeps the 16px root and a larger setting scales every rem', () => {
  assert.equal(rootFontPx(1), 16);
  assert.equal(rootFontPx(2), 32);
  assert.equal(rootFontPx(0), 16);
  assert.equal(textScale(16), 1);
  assert.equal(textScale(12), 1); // smaller text never shrinks the touch targets
  assert.equal(textScale(24), 1.5);
  assert.equal(textScale(64), TEXT_SCALE_MAX);
  const doc = (medium, body) => {
    const probe = { style: { cssText: '', font: '' }, setAttribute() {}, remove() {} };
    return {
      documentElement: { appendChild() {}, removeChild() {} },
      createElement() { return probe; },
      defaultView: { getComputedStyle: (el) => ({ fontSize: (el.style.font === '-apple-system-body' ? body : medium) + 'px' }) },
    };
  };
  assert.equal(readPreferredRootPx(doc(16, 16)), 16); // Chrome, system font ignored
  assert.equal(readPreferredRootPx(doc(16, 17)), 16); // iOS default system body is 17
  assert.equal(readPreferredRootPx(doc(24, 17)), 24); // desktop large text
  assert.ok(Math.abs(readPreferredRootPx(doc(16, 28)) - (28 / 17) * 16) < 0.01); // iOS larger text
});

test('buttons >= 64 and knobs >= 80 at every sweep viewport, including insets and 4K', () => {
  for (const c of CASES) {
    const s = placed(c);
    assert.ok(buttonPx(s.u) >= MIN_TOUCH, `${c.name} button ${buttonPx(s.u)}`);
    assert.ok(knobPx(s.u) >= MIN_KNOB, `${c.name} knob ${knobPx(s.u)}`);
    assert.ok(s.w <= c.vw + 1 && s.h <= c.vh + 1, `${c.name} board ${s.w}x${s.h}`);
    const L = layoutFor(s);
    for (let n = 1; n <= 5; n++) {
      const lay = wordLayout(n, L);
      assert.ok(lay.tileW + 0.6 >= Math.min(64, s.w / n), `${c.name} n=${n} tile ${lay.tileW}`);
      assert.ok(lay.rowLeft >= -1 && lay.rowLeft + lay.rowW <= s.w + 1, `${c.name} n=${n} row`);
      assert.ok(lay.knob >= MIN_KNOB, `${c.name} knob geom ${lay.knob}`);
    }
  }
});

test('tested phone and tablet boards still fill the screen at the old scale', () => {
  const phone = stageFor(360, 780);
  assert.equal(phone.mode, 'portrait');
  assert.ok(Math.abs(phone.u - 0.9) < 0.02, phone.u);
  assert.ok(phone.w >= 360 * 0.97 && phone.h >= 780 * 0.97);
  const pad = stageFor(820, 1180);
  assert.ok(Math.abs(pad.u - 1.3) < 0.03);
  const desk = stageFor(1920, 1080);
  assert.ok(Math.abs(desk.u - 2) < 0.02);
  assert.ok(desk.w >= 1920 * 0.97 && desk.h >= 1080 * 0.97);
});

test('4K caps the scale at the 1080p size and fills the window with board', () => {
  const s = stageFor(3840, 2160);
  assert.equal(s.u, MAX_SCALE);
  assert.equal(s.w, 3840);
  assert.equal(s.h, 2160);
  assert.equal(buttonPx(s.u), 144);
  assert.equal(knobPx(s.u), 180);
});

test('small and inset boards floor the controls instead of shrinking with u', () => {
  const tiny = stageFor(320, 568);
  assert.ok(tiny.u < MIN_TOUCH / 72, `expected u under the old 0.9 assumption, got ${tiny.u}`);
  assert.equal(buttonPx(tiny.u), MIN_TOUCH);
  assert.equal(knobPx(tiny.u), MIN_KNOB);
  const barred = placed(CASES[2]); // 780x360 with 24+48
  assert.equal(barred.mode, 'short');
  assert.ok(barred.u < 0.8, barred.u);
  assert.equal(buttonPx(barred.u), MIN_TOUCH);
  assert.equal(knobPx(barred.u), MIN_KNOB);
});

test('map stops do not overlap each other or the go button across the sweep', () => {
  for (const c of CASES) {
    const s = placed(c);
    for (const n of [0, 5, 20, 47]) {
      const pts = mapLayout(mapWindow(mapState(seedProgress(n)).stops, n), s);
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        assert.ok(d + 0.5 >= pts[i].r + pts[j].r, `${c.name} n=${n} ${pts[i].label}/${pts[j].label} ${d.toFixed(0)}`);
      }
    }
  }
});

test('a mid-session rotate swaps portrait for short landscape and back', () => {
  const portrait = stageFor(390, 844);
  const land = stageFor(844, 390);
  assert.equal(portrait.mode, 'portrait');
  assert.equal(land.mode, 'short');
  assert.ok(portrait.h > portrait.w && land.w > land.h);
  assert.ok(buttonPx(portrait.u) >= MIN_TOUCH && buttonPx(land.u) >= MIN_TOUCH);
  assert.ok(knobPx(portrait.u) >= MIN_KNOB && knobPx(land.u) >= MIN_KNOB);
  const layP = wordLayout(4, layoutFor(portrait)), layL = wordLayout(4, layoutFor(land));
  assert.notEqual(layP.rowLeft, layL.rowLeft);
  const back = stageFor(390, 844);
  assert.equal(back.mode, 'portrait');
  assert.equal(back.w, portrait.w);
  assert.equal(back.h, portrait.h);
});

test('wide and squat windows fill the board instead of letterboxing, at today\'s control size', () => {
  for (const [vw, vh] of [[1280, 480], [1280, 720], [2560, 1080], [1000, 1040], [844, 390], [500, 540], [1440, 600], [390, 844]]) {
    const s = stageFor(vw, vh);
    assert.equal(s.w, vw, `${vw}x${vh} w`);
    assert.equal(s.h, vh, `${vw}x${vh} h`);
    const legacy = legacyStage(vw, vh);
    assert.ok(Math.abs(s.u - Math.min(legacy.scale, MAX_SCALE)) < 1e-9, `${vw}x${vh} u unchanged`);
    // The board in design units is never smaller than the composition the screens were laid out for.
    assert.ok(s.w / s.u >= s.designW - 1 && s.h / s.u >= s.designH - 1, `${vw}x${vh} design room`);
  }
  const squat = stageFor(1280, 480);
  assert.equal(squat.mode, 'short');
});

test('large text scales the whole app by laying out a smaller composition', () => {
  const pad = stageFor(820, 1180), padL = stageFor(820, 1180, 1.5);
  assert.ok(padL.u > pad.u * 1.25, `${pad.u} -> ${padL.u}`);
  assert.equal(padL.designW, 400); // phone composition, drawn larger
  const wide = stageFor(1280, 720), wideL = stageFor(1280, 720, 1.5);
  assert.equal(wide.mode, 'tall');
  assert.equal(wideL.mode, 'short');
  assert.ok(wideL.u > wide.u * 1.3, `${wide.u} -> ${wideL.u}`);
  for (const [vw, vh] of [[390, 844], [1280, 720], [1280, 480], [820, 1180], [1440, 900], [320, 568]]) {
    const s = stageFor(vw, vh, 1.5);
    assert.ok(s.u >= stageFor(vw, vh).u - 1e-9, `${vw}x${vh} never smaller`);
    assert.ok(s.w / s.u >= s.designW - 1 && s.h / s.u >= s.designH - 1, `${vw}x${vh} composition still fits`);
  }
  // A phone in portrait is already the 400-wide composition: large text narrows it to PHONE_MIN_W.
  const phoneL = stageFor(390, 844, 1.5);
  assert.equal(phoneL.designW, PHONE_MIN_W);
  assert.ok(Math.abs(phoneL.u - 390 / PHONE_MIN_W) < 1e-9, phoneL.u);
  assert.ok(buttonPx(phoneL.u) >= MIN_TOUCH);
});

test('flow layout rules: wide trace column, Grown-ups follows text size, no new UI', () => {
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.tall #lesson\.tracing \.tcard\{top:5\.75rem;bottom:0\.875rem\}/);
  assert.match(css, /\.tall #trace \.ibar\{[^}]*flex-direction:column/);
  assert.match(css, /#parent\{zoom:var\(--k, 1\)\}/);
  assert.equal(css.includes('#turn'), false);
  assert.equal(/\.narrow [^{]*\{[^}]*(color|background|font-family)/.test(css), false); // narrow only resizes
});
