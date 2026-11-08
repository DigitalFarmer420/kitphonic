#!/usr/bin/env python3
"""Desktop Chrome check that the stage stays inside synthetic system-bar insets.

This is not an Android WebView run. It does not record an API level or a WebView
package, and it does not prove gesture navigation, three-button mode, or a cutout.
Capacitor's published CSS variables are simulated with documentElement style.

  python3 tools/safe-insets-layout.py [--base http://127.0.0.1:8099/] [--shots DIR]
"""
import argparse, json, os, sys
from playwright.sync_api import sync_playwright

def inside(rect, safe, slack=2):
    if not rect or rect.get('w', 0) < 8 or rect.get('h', 0) < 8:
        return False
    return (rect['x'] >= safe['left'] - slack and rect['y'] >= safe['top'] - slack
            and rect['x'] + rect['w'] <= safe['right'] + slack
            and rect['y'] + rect['h'] <= safe['bottom'] + slack)

def measure(page, selectors):
    return page.evaluate("""(sels) => {
      const stage = document.getElementById('stage').getBoundingClientRect();
      const root = document.documentElement.style;
      const controls = {};
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) { controls[sel] = null; continue; }
        const r = el.getBoundingClientRect();
        const hidden = el.closest('[hidden]') != null;
        controls[sel] = { x: r.x, y: r.y, w: r.width, h: r.height, hidden };
      }
      const bubble = document.getElementById('hello-bubble');
      const cs = bubble ? getComputedStyle(bubble) : null;
      const br = bubble ? bubble.getBoundingClientRect() : null;
      return {
        inner: [innerWidth, innerHeight],
        stage: { x: stage.x, y: stage.y, w: stage.width, h: stage.height },
        source: document.getElementById('stage').dataset.insetSource,
        vars: ['top','right','bottom','left'].map(k => root.getPropertyValue('--safe-area-inset-' + k).trim()),
        controls,
        bubble: bubble && { text: bubble.textContent, whiteSpace: cs.whiteSpace, align: cs.textAlign, size: cs.fontSize,
          x: br.x, y: br.y, w: br.width, h: br.height },
      };
    }""", selectors)

def apply_insets(page, top, right, bottom, left):
    page.evaluate("""([t, r, b, l]) => {
      const s = document.documentElement.style;
      s.setProperty('--safe-area-inset-top', t + 'px');
      s.setProperty('--safe-area-inset-right', r + 'px');
      s.setProperty('--safe-area-inset-bottom', b + 'px');
      s.setProperty('--safe-area-inset-left', l + 'px');
    }""", [top, right, bottom, left])
    page.wait_for_timeout(60)

def run():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:8099/')
    ap.add_argument('--shots', default='')
    args = ap.parse_args()
    shots = args.shots
    if shots: os.makedirs(shots, exist_ok=True)
    fails = []
    notes = []

    def check(name, ok, detail):
        notes.append({'name': name, 'pass': bool(ok), 'detail': detail})
        if not ok: fails.append(name)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        def page_at(path, w, h):
            ctx = browser.new_context(viewport={'width': w, 'height': h}, has_touch=True)
            ctx.add_init_script("localStorage.clear()")
            pg = ctx.new_page()
            pg.goto(args.base + path, wait_until='networkidle')
            pg.wait_for_timeout(200)
            return ctx, pg

        # Zero published insets: stage fills the viewport. Explicit 0 must not shrink it.
        ctx, pg = page_at('?skipHello=1&reducedMotion=1', 360, 780)
        zero = measure(pg, ['#go'])
        sw, sh = zero['stage']['w'], zero['stage']['h']
        check('zero-inset fills portrait', abs(zero['stage']['x']) <= 2 and abs(zero['stage']['y']) <= 2
              and abs(sw - zero['inner'][0]) <= 2 and abs(sh - zero['inner'][1]) <= 2, zero['stage'])
        apply_insets(pg, 0, 0, 0, 0)
        z2 = measure(pg, ['#go'])
        check('explicit 0px does not add a second pad', z2['source'] == 'css-var'
              and abs(z2['stage']['h'] - sh) <= 2 and abs(z2['stage']['w'] - sw) <= 2, z2['stage'])
        ctx.close()

        views = [
            ('portrait', 360, 780, (32, 0, 48, 0)),
            ('short', 780, 360, (24, 0, 48, 0)),
            ('cutout', 844, 390, (0, 0, 24, 47)),
        ]
        screens = [
            ('hello', '', ['#play', '#speaker']),
            ('map', '?skipHello=1&reducedMotion=1', ['#go']),
            ('word', '?skipHello=1&reducedMotion=1&direct=1&level=1&word=at&support=4', ['#home', '#slider', '#handle']),
            ('trace', '?skipHello=1&reducedMotion=1&activity=trace&gpc=s', ['#ls-home', '.tcard']),
        ]
        for vname, w, h, insets in views:
            for sname, path, sels in screens:
                ctx, pg = page_at(path, w, h)
                if sname == 'trace':
                    pg.wait_for_function("() => !document.getElementById('trace').hidden", timeout=8000)
                apply_insets(pg, *insets)
                if sname == 'hello':
                    pg.wait_for_timeout(100)
                m = measure(pg, sels)
                top, right, bottom, left = insets
                safe = {'left': left, 'top': top, 'right': w - right, 'bottom': h - bottom}
                stage_ok = inside(m['stage'], safe)
                ctrl_ok = all(inside(m['controls'][s], safe) for s in sels)
                check(f'{vname} {sname} stage inside bars', stage_ok, {'stage': m['stage'], 'safe': safe, 'source': m['source']})
                check(f'{vname} {sname} controls inside bars', ctrl_ok, m['controls'])
                if sname == 'hello':
                    b = m['bubble']
                    play = m['controls']['#play']
                    separated = b and play and (b['y'] + b['h'] <= play['y'] + 2 or play['y'] + play['h'] <= b['y'] + 2)
                    check(f'{vname} welcome still wraps', b and b['text'].startswith('Hi!')
                          and b['whiteSpace'] == 'normal' and b['align'] == 'center'
                          and b['size'] == ('24px' if vname == 'portrait' else '20px') and separated, b)
                if shots and sname in ('hello', 'word', 'trace') and vname in ('portrait', 'short'):
                    pg.screenshot(path=f'{shots}/pass-{vname}-{sname}.png')
                ctx.close()

        # Rotate portrait -> landscape on the word screen, then back. Insets change with the bars.
        ctx, pg = page_at('?skipHello=1&reducedMotion=1&direct=1&level=1&word=at&support=4', 360, 780)
        apply_insets(pg, 32, 0, 48, 0)
        pg.set_viewport_size({'width': 780, 'height': 360})
        apply_insets(pg, 24, 0, 48, 0)
        pg.wait_for_timeout(80)
        land = measure(pg, ['#home', '#slider', '#handle'])
        safe = {'left': 0, 'top': 24, 'right': 780, 'bottom': 360 - 48}
        check('rotate to short landscape', inside(land['stage'], safe) and all(inside(land['controls'][s], safe) for s in ['#home', '#slider', '#handle']), land)
        pg.set_viewport_size({'width': 360, 'height': 780})
        apply_insets(pg, 32, 0, 48, 0)
        pg.wait_for_timeout(80)
        back = measure(pg, ['#slider'])
        safe = {'left': 0, 'top': 32, 'right': 360, 'bottom': 780 - 48}
        check('rotate back to portrait', inside(back['stage'], safe) and inside(back['controls']['#slider'], safe), back)
        if shots: pg.screenshot(path=f'{shots}/pass-rotate-back-word.png')
        ctx.close()

        # IME: viewport already shortened, bottom variable 0. Stage uses the new height once.
        ctx, pg = page_at('?skipHello=1&reducedMotion=1', 390, 844)
        apply_insets(pg, 32, 0, 0, 0)
        pg.set_viewport_size({'width': 390, 'height': 524})
        apply_insets(pg, 32, 0, 0, 0)
        pg.wait_for_timeout(80)
        ime = measure(pg, ['#go'])
        check('keyboard shrink is not applied twice', ime['source'] == 'css-var'
              and ime['stage']['y'] >= 30 and ime['stage']['y'] + ime['stage']['h'] <= 526
              and ime['stage']['h'] > 400, ime['stage'])
        ctx.close()
        browser.close()

    print(json.dumps({'fail': len(fails), 'checks': notes}, indent=2))
    return 1 if fails else 0

if __name__ == '__main__':
    sys.exit(run())
