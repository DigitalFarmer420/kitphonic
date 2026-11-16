#!/usr/bin/env python3
"""Welcome bubble must clear the Play button at normal type and at 64px (about 2x) text.

The check sets the root and #hello-bubble font to 64px and does not resize #play.
1x gaps are the short greeting. A negative gap means the bubble covers Play.

  python3 tools/hello-large-text.py [--base http://127.0.0.1:8099/]
"""
import argparse, sys
from playwright.sync_api import sync_playwright

# Measured screen px between the short greeting and Play at the default 24px type.
ONE_X = {'320x568': 56, '1440x900': 60, '390x844': 173, '820x1180': 268}
VIEWS = [(320, 568), (390, 844), (820, 1180), (1440, 900)]

def gap(page):
    return page.evaluate("""() => {
      const b = document.getElementById('hello-bubble').getBoundingClientRect();
      const p = document.getElementById('play').getBoundingClientRect();
      return { gap: p.top - b.bottom, bh: b.height, play: p.height,
        fs: getComputedStyle(document.getElementById('hello-bubble')).fontSize };
    }""")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:8099/')
    args = ap.parse_args()
    fails = []
    with sync_playwright() as p:
        exe = '/usr/bin/google-chrome'
        browser = p.chromium.launch(executable_path=exe, args=['--no-sandbox'])
        for w, h in VIEWS:
            key = f'{w}x{h}'
            pg = browser.new_page(viewport={'width': w, 'height': h})
            pg.goto(args.base, wait_until='domcontentloaded')
            pg.wait_for_timeout(250)
            at1 = gap(pg)
            if abs(at1['gap'] - ONE_X[key]) > 2 or at1['fs'] != '24px':
                fails.append(f'{key} 1x gap {at1["gap"]:.1f} font {at1["fs"]} (want {ONE_X[key]}px, 24px)')
            pg.evaluate("""() => {
              document.documentElement.style.fontSize = '64px';
              document.getElementById('hello-bubble').style.fontSize = '64px';
            }""")
            pg.wait_for_timeout(40)
            at2 = gap(pg)
            if at2['gap'] < 4 or at2['play'] < 100:
                fails.append(f'{key} 2x gap {at2["gap"]:.1f} play {at2["play"]:.0f}')
            else:
                print(f'{key}: 1x {at1["gap"]:.0f}px, 2x {at2["gap"]:.0f}px')
            pg.close()
        browser.close()
    if fails:
        print('FAIL')
        for f in fails: print(' ', f)
        return 1
    print('PASS')
    return 0

if __name__ == '__main__':
    sys.exit(main())
