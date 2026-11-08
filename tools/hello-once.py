#!/usr/bin/env python3
"""Startup Play plays the welcome once. Rapid taps must not queue more greetings over the map.

  python3 tools/hello-once.py [--base http://127.0.0.1:8080/] [--shots DIR]
"""
import argparse, os, sys
from playwright.sync_api import sync_playwright

COUNT = """() => {
  const log = (window.__kitAudioLog || []).filter(e => e.id === 'm-hello');
  const scr = [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id;
  return { hellos: log.length, screen: scr, busy: !!kitphonic.audio.busy,
    going: document.getElementById('play').classList.contains('going'),
    bubble: document.getElementById('hello-bubble').textContent };
}"""

def rapid(pg):
    pg.evaluate("""() => { const b = document.getElementById('play'); for (let i = 0; i < 8; i++) b.click(); }""")

def wait_settled(pg, timeout=20000):
    pg.wait_for_function("() => !kitphonic.audio.busy && [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id === 'map'", timeout=timeout)

def run_view(b, base, name, w, h, shots):
    pg = b.new_page(viewport={'width': w, 'height': h}, has_touch=True)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base, wait_until='networkidle')
    pg.wait_for_timeout(300)
    # in-flight: one click, then more while the welcome is still the current screen
    pg.evaluate("() => document.getElementById('play').click()")
    pg.wait_for_timeout(50)
    rapid(pg)
    accepted = pg.evaluate(COUNT)
    if shots: pg.screenshot(path=f'{shots}/{name}-accepted.png')
    wait_settled(pg)
    done = pg.evaluate(COUNT)
    if shots: pg.screenshot(path=f'{shots}/{name}-map.png')
    # a real second visit (reload) still gets one welcome
    pg.reload(wait_until='networkidle'); pg.wait_for_timeout(200)
    pg.evaluate("() => document.getElementById('play').click()")
    wait_settled(pg)
    again = pg.evaluate(COUNT)
    # keyboard: two Enter activations on a fresh load
    pg.reload(wait_until='networkidle'); pg.wait_for_timeout(200)
    pg.locator('#play').focus()
    pg.keyboard.press('Enter'); pg.keyboard.press('Enter')
    wait_settled(pg)
    keys = pg.evaluate(COUNT)
    pg.close()
    print(name, 'in-flight', accepted, 'settled', done, 'reload', again, 'keyboard', keys, 'pageerrors', errs)
    problems = []
    if accepted['hellos'] != 1 or accepted['going'] is not True: problems.append(f'in-flight {accepted}')
    if done['hellos'] != 1 or done['screen'] != 'map' or done['busy']: problems.append(f'settled {done}')
    if again['hellos'] != 1 or again['screen'] != 'map': problems.append(f'reload {again}')
    if keys['hellos'] != 1 or keys['screen'] != 'map': problems.append(f'keyboard {keys}')
    if errs: problems.append(errs)
    return problems

def lesson(b, base):
    pg = b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base + '?skipHello=1&activity=hunt&seed=1', wait_until='networkidle')
    pg.wait_for_timeout(500)
    st = pg.evaluate("() => { const r = kitphonic.letters.run; return r && r.target; }")
    pg.locator(f".ltr[data-l='{st}'] .tile").first.click(force=True)
    pg.wait_for_timeout(1500)
    info = pg.evaluate("""() => {
      const log = window.__kitAudioLog || [];
      const span = e => (e.a != null && e.b != null) ? [e.a, e.b] : [e.t, e.end];
      const heard = log.filter(e => { const [a,b] = span(e); return b == null || b > a; }).sort((a,b) => span(a)[0] - span(b)[0]);
      const ov = [];
      for (let i = 1; i < heard.length; i++) {
        const a1 = span(heard[i-1])[1], b0 = span(heard[i])[0];
        if (a1 != null && b0 < a1 - 5) ov.push([heard[i-1].id, heard[i].id]);
      }
      return { ids: log.map(e => e.id), ov };
    }""")
    pg.close()
    print('lesson', st, info, 'pageerrors', errs)
    if errs or info['ov'] or not info['ids']: return [f'lesson {info} {errs}']
    return []

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:8080/')
    ap.add_argument('--shots', default='/tmp/hello-once')
    a = ap.parse_args()
    if not a.base.endswith('/'): a.base += '/'
    os.makedirs(a.shots, exist_ok=True)
    exe = '/usr/bin/google-chrome'
    bad = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe, args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        bad += run_view(b, a.base, 'phone', 390, 844, a.shots)
        bad += run_view(b, a.base, 'ipad', 820, 1180, a.shots)
        bad += lesson(b, a.base)
        b.close()
    print('OK' if not bad else 'FAIL ' + '; '.join(bad))
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
