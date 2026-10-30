#!/usr/bin/env python3
"""Kitphonic touch-target / layout check in headless Chrome (usability pass).

Fails (exit 1) if, at any required viewport, any visible tap target is < 64 CSS px on its short side, the slider knob
is < 80 px, anything interactive is cut off the screen, key elements overlap, the stage leaves an empty band, or
the slider is not in the bottom (thumb) zone in portrait. Saves a screenshot per scene.

  python3 tools/check-sizes.py [--base http://localhost:8099/] [--out screenshots/sizes] [--viewports 360x780,780x360]
Requires: pip install playwright && playwright install chromium; the app served (npm start).
"""
import argparse, json, os, sys
from playwright.sync_api import sync_playwright

REQUIRED = ['360x780', '780x360', '820x1180']
EXTRA = ['390x844', '844x390', '1180x820']
MIN, KNOB = 64, 80
SCENES = [  # name, query, js to run after load
    ('hello', '', None),
    ('word-map', 'skipHello=1&level=2&word=map&seed=1', None),
    ('word-stop', 'skipHello=1&level=4&word=stop&seed=1', None),
    ('check', 'skipHello=1&level=2&word=mat&seed=1', "kitphonic.screen.debugShow('check')"),
    ('cards', 'skipHello=1&level=1&word=at&seed=1', "kitphonic.screen.debugShow('check')"),
    ('map', 'skipHello=1&progress=5&seed=1', None),
    ('map-start', 'skipHello=1&progress=0&seed=1', None),
    ('map-end', 'skipHello=1&progress=12&seed=1', None),
    ('levelup', 'skipHello=1&progress=5&levelup=1&seed=1', "new Promise(r => setTimeout(r, 1800))"),
    ('session', 'skipHello=1&progress=5&seed=1', "document.getElementById('go').click()"),
    ('reveal', 'skipHello=1&level=2&word=mat&seed=1', "kitphonic.screen.debugShow('revealed')"),
    ('letters-hunt', 'skipHello=1&activity=hunt&seed=1', None),
    ('letters-tap', 'skipHello=1&activity=soundTap&seed=1', None),
    ('letters-find', 'skipHello=1&activity=find&seed=1', None),
    ('intro', 'skipHello=1&activity=intro&gpc=s&seed=1', None),
    ('trace', 'skipHello=1&activity=trace&gpc=s&seed=1', None),
    ('star', 'skipHello=1&activity=star&word=the&seed=1', "new Promise(r => setTimeout(r, 2500))"),
    ('sentence', 'skipHello=1&activity=sentence&sentence=map-mat&seed=1', "new Promise(r => setTimeout(r, 1500))"),
    ('sentence-blend', 'skipHello=1&activity=sentence&sentence=map-mat&seed=1', "new Promise(r => setTimeout(r, 3500)).then(() => document.querySelector('#sn-strip .wd').click()).then(() => new Promise(r => setTimeout(r, 1500)))"),
    ('family', 'skipHello=1&activity=family&rime=ap&seed=1', "new Promise(r => setTimeout(r, 2500))"),
    ('family-made', 'skipHello=1&activity=family&rime=ap&seed=1', "new Promise(r => setTimeout(r, 2500)).then(() => { document.querySelector('#fm-tray .ftile').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); dispatchEvent(new PointerEvent('pointerup')); document.getElementById('fm-slot').click(); }).then(() => new Promise(r => setTimeout(r, 2600)))"),
    ('digraph', 'skipHello=1&level=6&word=ship&seed=1', "new Promise(r => setTimeout(r, 800))"),
    ('fuse', 'skipHello=1&activity=intro&gpc=sh&seed=1', "new Promise(r => setTimeout(r, 2200))"),
    ('parent', 'skipHello=1&progress=5&parent=1', "new Promise(r => setTimeout(r, 800))"),
    ('letters-float', 'skipHello=1&activity=float&seed=1', None),
    ('letters-float-4s', 'skipHello=1&activity=float&seed=2', "new Promise(r => setTimeout(r, 4000))"),
]
MEASURE = r"""() => {
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]') && e.offsetParent !== null; };
  const scr = [...document.querySelectorAll('.screen')].find(s => !s.hidden);
  const overlay = scr.querySelector('#check:not([hidden])');
  const root = overlay || scr;
  const box = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const name = e => e.id ? '#' + e.id : (e.className.baseVal ?? e.className).split(' ')[0] + (e.getAttribute('aria-label') ? `[${e.getAttribute('aria-label')}]` : '');
  const targets = [...root.querySelectorAll('button, #handle, #sn-handle, .stop, .ear, .marker .dot, .marker .bar, .ltr .tile, .ltr .ldot, .choice')]
    .filter(vis).filter(e => !(e.classList.contains('marker'))) // a marker button's visible shape is its .dot/.bar
    .map(e => ({ name: name(e), knob: e.id === 'handle' || e.id === 'sn-handle', play: e.id === 'play', scroll: !!e.closest('#pa-body'), adult: !!e.closest('#parent'), ...box(e) }));
  const key = overlay ? [] : [...scr.querySelectorAll('.starbig, .wcard2, #sn-card, #sn-strip .wd, .top .path .peb, #fm-card, #fm-slot, #fm-rime, .fchip, .ftile, #sn-tiles .tile, #sn-handle, #sn-read, .icard, .ipic, .tcard, .ibar > *, .ear, #l-tray, .mkit, .stop, .mlabel, #go, .lv-chip, #lv-next, .lv-badge, .starchip, #card, .tile:not(.ltr .tile), .marker .dot, .marker .bar, #handle, .mascot .bubble, .top .btn, #next, .next, .ltr .tile, .ltr .ldot')]
    .filter(vis).map(e => ({ name: name(e), ...box(e) }));
  const ltr = [...root.querySelectorAll('.ltr .tile, .choice, #st-cards .wcard2')].filter(vis).map(e => Math.round(e.getBoundingClientRect().top));
  const st = document.getElementById('stage').getBoundingClientRect();
  const h = document.getElementById('handle');
  return { screen: scr.id, ltr, targets, key, stage: { w: st.width, h: st.height }, handle: vis(h) ? box(h) : null, vw: innerWidth, vh: innerHeight };
}"""

ADULT = 44  # grown-ups area: adult targets (Apple HIG 44pt); the mockup uses 48px segmented controls

def overlaps(a, b, pad=2):
    return a['x'] + pad < b['x'] + b['w'] and b['x'] + pad < a['x'] + a['w'] and a['y'] + pad < b['y'] + b['h'] and b['y'] + pad < a['y'] + a['h']

def check(m, vp, scene):
    errs = []
    for t in m['targets']:
        short = min(t['w'], t['h']); need = KNOB if t['knob'] else (ADULT if t.get('adult') else MIN)
        if short < need - 0.5: errs.append(f"{t['name']} {t['w']:.0f}x{t['h']:.0f} < {need}")
        if not t.get('scroll') and (t['x'] < -1 or t['y'] < -1 or t['x'] + t['w'] > m['vw'] + 1 or t['y'] + t['h'] > m['vh'] + 1):
            errs.append(f"{t['name']} cut off at ({t['x']:.0f},{t['y']:.0f})")
        if t['play'] and not (110 <= short <= 175): errs.append(f"#play {short:.0f}px (want ~120)")
    k = m['key']
    for i in range(len(k)):
        for j in range(i + 1, len(k)):
            a, b = k[i], k[j]
            if a['name'] == b['name'] == 'tile' and False: continue
            if overlaps(a, b): errs.append(f"overlap {a['name']} / {b['name']}")
    if m['ltr'] and 'float' not in scene:  # balanced grid: rows differ by <= 1, never a lone tile (Uiux r2)
        rows = {}
        for y in m['ltr']: rows[y] = rows.get(y, 0) + 1
        c = list(rows.values())
        if len(c) > 1 and (min(c) == 1 or max(c) - min(c) > 1): errs.append(f"unbalanced grid {c}")
    if m['stage']['w'] < m['vw'] * .97 and m['stage']['h'] < m['vh'] * .97: errs.append('stage does not fill the screen')
    if m['stage']['h'] < m['vh'] * .97 and m['vh'] > m['vw']: errs.append(f"empty band: stage {m['stage']['h']:.0f} of {m['vh']}px tall")
    if m['handle'] and m['vh'] > m['vw']:
        bottom_gap = m['vh'] - (m['handle']['y'] + m['handle']['h'])
        if bottom_gap > m['vh'] * .25: errs.append(f"slider not in thumb zone ({bottom_gap:.0f}px above the bottom)")
    return errs

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8099/'); ap.add_argument('--out', default='screenshots/sizes')
    ap.add_argument('--viewports', default=','.join(REQUIRED + EXTRA)); ap.add_argument('--scenes', default=''); a = ap.parse_args()
    only = set(filter(None, a.scenes.split(',')))
    os.makedirs(a.out, exist_ok=True); fails = 0; rows = []
    with sync_playwright() as p:
        exe = os.environ.get('CHROME') or next((c for c in ['/usr/bin/google-chrome', '/usr/bin/chromium'] if os.path.exists(c)), None)
        b = p.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe else p.chromium.launch()
        for vp in a.viewports.split(','):
            w, h = map(int, vp.split('x'))
            for scene, q, js in SCENES:
                if only and scene not in only: continue
                pg = b.new_page(viewport={'width': w, 'height': h}, has_touch=True)
                pg.goto(a.base + ('?' + q if q else ''), wait_until='networkidle'); pg.wait_for_timeout(500)
                if js: pg.evaluate(js); pg.wait_for_timeout(700)
                m = pg.evaluate(MEASURE); errs = check(m, vp, scene)
                pg.screenshot(path=f"{a.out}/{scene}-{vp}.png"); pg.close()
                smallest = min((min(t['w'], t['h']) for t in m['targets'] if not t['knob']), default=0)
                knob = next((min(t['w'], t['h']) for t in m['targets'] if t['knob']), None)
                rows.append((vp, scene, len(m['targets']), smallest, knob, errs)); fails += bool(errs)
        b.close()
    print(f"{'viewport':9} {'scene':13} {'n':>3} {'min':>5} {'knob':>5}  result")
    for vp, sc, n, sm, kn, errs in rows:
        print(f"{vp:9} {sc:13} {n:3} {sm:5.0f} {('-' if kn is None else f'{kn:.0f}'):>5}  {'OK' if not errs else 'FAIL: ' + '; '.join(errs)}")
    print(f"\n{len(rows) - fails}/{len(rows)} scenes pass (min {MIN}px, knob {KNOB}px)")
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
