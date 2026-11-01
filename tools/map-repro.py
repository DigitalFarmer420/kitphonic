#!/usr/bin/env python3
"""rc7: does the map ever move the child backwards? Plays real sessions (tools/play-session.py's child) in ONE browser
profile with fresh storage, several sessions a day over several (faked) days, and after every session returns home and
reloads. Prints the map position (index + current stop) before / after / after reload, the stars, and the storage keys.
Exit 1 if the position ever goes down.

  python3 tools/map-repro.py [--base URL] [--days 3] [--per-day 3] [--wrong 0.25] [--seed 1] [--until words:L1]
"""
import argparse, importlib.util, json, os, random, sys, time
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location('ps', os.path.join(os.path.dirname(__file__), 'play-session.py')); ps = importlib.util.module_from_spec(spec); spec.loader.exec_module(ps)
CLOCK = """(() => { const off = +(localStorage.getItem('__dayoff') || 0) * 864e5; if (!off) return; const RD = Date;
  class D extends RD { constructor(...a) { a.length ? super(...a) : super(RD.now() + off); } static now() { return RD.now() + off; } }
  window.Date = D; })();"""
MAP = "() => { const m = kitphonic.map(); return { index: m.index, cur: m.current?.id ?? 'done', stars: m.stops.filter(s => s.status === 'passed').length, shown: document.querySelector('#map .stop.current, #map [data-current]')?.dataset?.id ?? null } }"
STORE = "() => Object.fromEntries(Object.keys(localStorage).filter(k => k !== '__dayoff').map(k => [k, (localStorage.getItem(k) || '').length]))"

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--base', default='https://digitalfarmer420.github.io/kitphonic/'); ap.add_argument('--days', type=int, default=3)
    ap.add_argument('--per-day', type=int, default=3); ap.add_argument('--wrong', type=float, default=0.0); ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--until', default=''); ap.add_argument('--home-every', type=int, default=0, help='every Nth session: press Home after ~45 s (mid-session exit)'); ap.add_argument('--vp', default='820x1180'); a = ap.parse_args(); rng = random.Random(a.seed)
    w, h = map(int, a.vp.split('x')); hi, back = -1, []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_init_script(CLOCK); pg = ctx.new_page()
        pg.goto(a.base + '?skipHello=1', wait_until='networkidle'); pg.evaluate('localStorage.clear()')
        for day in range(a.days):
            for k in range(a.per_day):
                pg.evaluate(f"localStorage.setItem('__dayoff', '{day}')"); pg.goto(f"{a.base}?skipHello=1&_={time.time()}", wait_until='networkidle'); pg.wait_for_timeout(500)
                before, st0 = pg.evaluate(MAP), pg.evaluate(STORE)
                if pg.locator('#go').is_visible(): pg.locator('#go').click(); pg.wait_for_timeout(500)
                plan = pg.evaluate("() => kitphonic.session ? kitphonic.session.plan.items.map(i => i.activity + (i.targets ? ':' + i.targets.join('') : '') + (i.why ? '(' + i.why + ')' : '')) : []")
                n_s = day * a.per_day + k + 1; home = a.home_every and n_s % a.home_every == 0
                seen = ps.drive(pg, 45 if home else 300, wrong=a.wrong, rng=rng)
                if home:
                    btn = [x for x in pg.locator('.screen:not([hidden]) .top button[aria-label="Home"]').all() if x.is_visible()]
                    if btn: btn[0].click(); pg.wait_for_timeout(600)
                    plan.append('[HOME pressed]')
                after = pg.evaluate(MAP)
                if pg.locator('#done:not([hidden]) button, #done:not([hidden]) #home').count(): pass
                pg.goto(f"{a.base}?skipHello=1&_={time.time()}", wait_until='networkidle'); pg.wait_for_timeout(500)
                rel, st1 = pg.evaluate(MAP), pg.evaluate(STORE)
                misses = pg.evaluate("() => kitphonic.store.all().filter(r => r.correct === false).length")
                print(f"day {day + 1} s{k + 1}: map {before['index']:2} {before['cur']:12} -> after {after['index']:2} {after['cur']:12} -> reload {rel['index']:2} {rel['cur']:12} stars {before['stars']}->{rel['stars']}  misses {misses}  plan {' '.join(plan)}")
                print(f"           storage {json.dumps(st0)} -> {json.dumps(st1)}")
                for x in (after['index'], rel['index']):
                    if x < hi: back.append((day + 1, k + 1, hi, x, rel['cur']))
                    hi = max(hi, x)
                if a.until and any(s['id'] == a.until and s['status'] == 'passed' for s in pg.evaluate("() => kitphonic.map().stops")) and k == a.per_day - 1 and day >= 1: pass
        b.close()
    print('BACKWARDS:', back if back else 'never'); sys.exit(1 if back else 0)

if __name__ == '__main__': main()
