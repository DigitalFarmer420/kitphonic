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
        exe = os.environ.get('CHROME') or next((c for c in ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'] if os.path.exists(c)), None)
        browser = p.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe else p.chromium.launch()
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
                    root = pg.evaluate("() => parseFloat(getComputedStyle(document.documentElement).fontSize)")
                    # 24 stage px portrait, 20 stage px short: both are rem, so the used px is design × u.
                    design = 24 if vname == 'portrait' else 20
                    size = float(str(b['size']).replace('px', '')) if b else 0
                    check(f'{vname} welcome still wraps', b and b['text'].startswith('Hi!')
                          and b['whiteSpace'] == 'normal' and b['align'] == 'center'
                          and abs(size - design / 16 * root) < 1.5 and separated, b)
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

        # Grown-ups is counter-zoomed by 1/scale inside the stage, so a CSS px is a screen px.
        # Adult controls must be at least 48 screen px, the scrollport must stay in the safe
        # rectangle, and each control must scroll fully into it. Scroll-to-end must not park
        # Reset above the status bar (the sounds column used to stretch one shared scroller).
        def parent_fit(pg, top, bottom):
            return pg.evaluate("""([top, bottom]) => {
              const safeTop = top, safeBottom = innerHeight - bottom;
              const body = document.getElementById('pa-body');
              const buttons = [...document.querySelectorAll('#parent button, #parent .plink')];
              const info = el => {
                const r = el.getBoundingClientRect();
                return { name: el.id || el.textContent.trim().slice(0, 22), h: r.height, y: r.top,
                  inside: r.top >= safeTop - 1 && r.bottom <= safeBottom + 1 && r.left >= -1 && r.right <= innerWidth + 1 };
              };
              const scroller = el => {
                for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
                  const cs = getComputedStyle(n);
                  if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
                }
                return body;
              };
              const saved = new Map();
              const reached = buttons.map(el => {
                const sc = scroller(el);
                if (!saved.has(sc)) saved.set(sc, sc.scrollTop);
                const br = sc.getBoundingClientRect(), s = el.getBoundingClientRect();
                sc.scrollTop += (s.top + s.height / 2) - (br.top + br.height / 2);
                return info(el);
              });
              const reset = document.getElementById('pa-reset');
              const sc = scroller(reset);
              sc.scrollTop = sc.scrollHeight;
              const tail = info(reset);
              const br = body.getBoundingClientRect();
              tail.inBody = tail.y >= br.top - 1;
              const close = info(document.getElementById('pa-close'));
              for (const [n, top0] of saved) n.scrollTop = top0;
              return { reached, close, tail, scrolls: sc.scrollHeight > sc.clientHeight + 1,
                bodyInside: br.top >= safeTop - 1 && br.bottom <= safeBottom + 1 };
            }""", [top, bottom])

        for label, w, h in (('short', 780, 360), ('portrait', 360, 640)):
            ctx, pg = page_at('?skipHello=1&parent=1&reducedMotion=1', w, h)
            pg.wait_for_function("() => document.querySelector('#pa-test')", timeout=8000)
            apply_insets(pg, 24, 0, 48, 0)
            fit = parent_fit(pg, 24, 48)
            small = [x['name'] for x in fit['reached'] if x['h'] < 47.5]
            missed = [x['name'] for x in fit['reached'] if not x['inside']]
            check(f'{label} grown-ups controls fit the safe area',
                  fit['bodyInside'] and fit['scrolls'] and fit['close']['inside'] and fit['close']['h'] >= 48
                  and fit['tail']['inside'] and fit['tail']['inBody'] and not small and not missed,
                  {'small': small, 'missed': missed, 'tail': fit['tail'], 'close': fit['close']})
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
