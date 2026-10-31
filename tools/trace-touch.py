#!/usr/bin/env python3
"""rc6 regression: real touch drags on the trace screen (CDP Input.dispatchTouchEvent) in Chromium iPad / phone
emulation. iPad profiles use a Mac-like Safari UA + navigator.platform 'MacIntel' + maxTouchPoints 5 (iPadOS reports a
Mac). For every grapheme with strokes, each stroke is traced by finger 1 while a second touch (a resting palm) lands
mid-stroke, moves a little and lifts before finger 1 does. Also: palm down first, a touchcancel mid-stroke (the ink must
stay and the child resumes), and the page must never scroll / zoom. Exit 1 on any failure.

  python3 tools/trace-touch.py [--base http://127.0.0.1:8099/] [--profile ipad-pro-11-portrait ...] [--letters s,a,t]
"""
import argparse, json, sys, time
from playwright.sync_api import sync_playwright

MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
PROFILES = {  # name: (device descriptor, landscape?, mac-like iPadOS UA?)
    'ipad-pro-11-portrait': ('iPad Pro 11', False, True), 'ipad-pro-11-landscape': ('iPad Pro 11', True, True),
    'ipad-gen7-portrait': ('iPad (gen 7)', False, True), 'ipad-gen7-landscape': ('iPad (gen 7)', True, True),
    'iphone-13-portrait': ('iPhone 13', False, False), 'iphone-13-landscape': ('iPhone 13', True, False),
    'pixel-7-portrait': ('Pixel 7', False, False),
}
GRAPHEMES = 'm s a t p i n o d f c k u g e r h b l j v x y w z q ck ff ll ss zz qu sh ch th ng nk'.split()

def run_profile(p, base, name, letters, log):
    dev, land, mac = PROFILES[name]; d = dict(p.devices[dev]); d.pop('default_browser_type', None)
    if land: d['viewport'] = {'width': d['viewport']['height'], 'height': d['viewport']['width']}; d.pop('screen', None)
    if mac: d['user_agent'] = MAC_UA
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(**d)
    if mac: ctx.add_init_script("Object.defineProperty(navigator,'platform',{get:()=>'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});")
    pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg); fails = []
    cdp.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})  # real phones / iPads track 5+ touches; some emulated profiles default to 1
    T = lambda typ, tps: cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, x, y in tps]})
    view = "() => ({sx: scrollX, sy: scrollY, vs: visualViewport.scale, vt: visualViewport.pageTop, st: JSON.stringify(document.getElementById('stage').getBoundingClientRect())})"
    stars = "() => document.querySelectorAll('#tr-tray .emoji:not(.off)').length"
    for g in letters:
        pg.goto(f"{base}?skipHello=1&activity=trace&gpc={g}&_={time.time()}", wait_until='networkidle'); pg.wait_for_timeout(700)
        v0 = pg.evaluate(view); info = pg.evaluate("() => ({ua: navigator.userAgent.includes('Macintosh'), mtp: navigator.maxTouchPoints, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, svg: (r => [Math.round(r.width), Math.round(r.height)])(document.getElementById('tr-svg').getBoundingClientRect())})")
        palm = pg.evaluate("() => { const r = document.getElementById('tr-svg').getBoundingClientRect(); return [r.right - 12, r.bottom - 12] }")
        rep_ok, k = [], 0
        for rep in range(3 if g in ('s', 'a') else 1):
            while True:
                pts = pg.evaluate("() => kitphonic.lesson.run?.debugPoints?.() ?? []")
                if not pts: break
                cov = pg.evaluate(f"() => {{ const e = document.elementFromPoint({pts[0][0]}, {pts[0][1]}); return e && e.closest('#tr-svg') ? '' : (e?.id || e?.className || e?.tagName || 'nothing') }}")
                if cov: fails.append(f'{g} rep {rep + 1}: start dot covered by {cov}')
                k += 1; mode = ['palm-mid', 'palm-first', 'cancel-resume'][k % 3] if g in ('s', 'a') or k % 2 else 'palm-mid'
                if mode == 'palm-first': T('touchStart', [(2, *palm)]); pg.wait_for_timeout(40)
                T('touchStart', [(1, *pts[0])] + ([(2, *palm)] if mode == 'palm-first' else []))
                palm_on = mode == 'palm-first'; mid = len(pts) // 2
                for j, q in enumerate(pts[1:], 1):
                    if mode == 'palm-mid' and j == max(1, len(pts) // 4): T('touchStart', [(1, *q), (2, *palm)]); palm_on = True
                    if palm_on and j == mid + 2: T('touchEnd', [(2, *palm)]); palm_on = False  # the palm lifts first (CDP touchEnd lists the points released): finger 1 keeps going
                    if mode == 'cancel-resume' and j == mid:
                        T('touchCancel', []); pg.wait_for_timeout(60)
                        ink = pg.evaluate("() => document.querySelectorAll('#tr-svg .ink').length")
                        if not ink: fails.append(f'{g}: touchcancel wiped the ink')
                        T('touchStart', [(1, *pts[j - 1])])
                    T('touchMove', [(1, *q)] + ([(2, palm[0] - 3 * (j % 3), palm[1])] if palm_on else [])); pg.wait_for_timeout(12)
                T('touchEnd', []); pg.wait_for_timeout(120)
                if pg.evaluate("() => kitphonic.lesson.run?.busy") or len(pg.evaluate("() => kitphonic.lesson.run?.debugPoints?.() ?? []")) == 0:
                    pass
                if pg.evaluate("() => kitphonic.lesson.run?.debugPoints?.() ?? []") == pts: fails.append(f'{g} rep {rep + 1}: stroke did not complete ({mode})'); break
            pg.wait_for_timeout(1400); rep_ok.append(pg.evaluate(stars))
        v1 = pg.evaluate(view)
        if v1 != v0: fails.append(f'{g}: page moved {v0} -> {v1}')
        if rep_ok != list(range(1, len(rep_ok) + 1)): fails.append(f'{g}: stars {rep_ok}')
        log(f"  {name} {g:3} stars {rep_ok} {'OK' if not [f for f in fails if f.startswith(g + ' ') or f.startswith(g + ':')] else 'FAIL'}")
    b.close(); return info, fails

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://127.0.0.1:8099/'); ap.add_argument('--profile', nargs='*', default=list(PROFILES))
    ap.add_argument('--letters', default=','.join(GRAPHEMES)); ap.add_argument('--quiet', action='store_true'); a = ap.parse_args()
    letters = a.letters.split(','); bad = 0
    with sync_playwright() as p:
        for name in a.profile:
            info, fails = run_profile(p, a.base, name, letters, (lambda s: None) if a.quiet else print)
            print(f"{name}: {json.dumps(info)} -> {len(letters)} graphemes, {'PASS' if not fails else 'FAIL ' + json.dumps(fails[:8])}"); bad += bool(fails)
    sys.exit(1 if bad else 0)

if __name__ == '__main__': main()
