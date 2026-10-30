#!/usr/bin/env python3
"""Play a whole Kitphonic session in headless Chrome like a (perfect, slow) child: taps the target letter, slides the
slider slowly, picks the right picture / word card, presses next, until the all-done screen. Prints the plan, the
screens visited and the responses logged. Exit 1 if the session does not reach all-done.

  python3 tools/play-session.py [--base http://localhost:8099/] [--q 'progress=4&seed=1&minutes=5'] [--vp 390x844] [--shots DIR]
"""
import argparse, json, os, sys, time
from playwright.sync_api import sync_playwright

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8099/'); ap.add_argument('--q', default='progress=4&seed=1&minutes=5')
    ap.add_argument('--vp', default='390x844'); ap.add_argument('--shots', default=None); ap.add_argument('--timeout', type=int, default=240); a = ap.parse_args()
    w, h = map(int, a.vp.split('x'))
    with sync_playwright() as p:
        exe = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
        b = p.chromium.launch(executable_path=exe, args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required']) if exe else p.chromium.launch()
        pg = b.new_page(viewport={'width': w, 'height': h}, has_touch=False)
        pg.goto(f"{a.base}?skipHello=1&{a.q}", wait_until='networkidle'); pg.wait_for_timeout(600)
        if pg.locator('#go').is_visible(): pg.locator('#go').click(); pg.wait_for_timeout(500)
        plan = pg.evaluate("() => kitphonic.session && kitphonic.session.plan.items.map(i => ({type: i.type, activity: i.activity, level: i.level, why: i.why, targets: i.targets, words: i.words && i.words.map(w => w.w)}))")
        print('plan:', json.dumps(plan))
        t0, seen, shot = time.time(), [], 0
        while time.time() - t0 < a.timeout:
            scr = pg.evaluate("() => [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id")
            if scr == 'done': break
            if scr == 'levelup':
                if not seen or seen[-1] != scr: seen.append(scr)
                pg.wait_for_timeout(1700); pg.locator('#lv-next').click(); pg.wait_for_timeout(1500)
                if a.shots: pg.screenshot(path=f"{a.shots}/{shot:02d}-map-after.png")
                seen.append('map'); break
            if a.shots and (not seen or seen[-1] != scr): os.makedirs(a.shots, exist_ok=True); pg.screenshot(path=f"{a.shots}/{shot:02d}-{scr}.png"); shot += 1
            if not seen or seen[-1] != scr: seen.append(scr)
            if scr == 'letters':
                st = pg.evaluate("() => { const r = kitphonic.letters.run; return r && { scored: !!r.def.scored, target: r.target, busy: !!r.busy, act: r.activity } }")
                if not st or st['busy']: pg.wait_for_timeout(300); continue
                if st['scored']:
                    pg.wait_for_timeout(700)  # think time (> fast-pick guard)
                    pg.locator(f".ltr[data-l='{st['target']}'] .tile").first.click(force=True); pg.wait_for_timeout(1100)
                else:
                    for t in pg.locator('.ltr .tile').all()[:4]: t.click(force=True); pg.wait_for_timeout(250)
                    pg.wait_for_timeout(300)
                    if pg.locator('#l-next').is_visible(): pg.locator('#l-next').click()
            elif scr == 'lesson':
                if pg.locator('#intro').is_visible():
                    pg.wait_for_timeout(600); pg.locator('#ic-letter').click(); pg.wait_for_timeout(400); pg.locator('#ic-pic').click(); pg.wait_for_timeout(400); pg.locator('#ic-next').click(); pg.wait_for_timeout(400)
                elif pg.locator('#tr-next').is_visible(): pg.locator('#tr-next').click(); pg.wait_for_timeout(400)
                else:
                    pts = pg.evaluate("() => kitphonic.lesson.run?.debugPoints?.() ?? []")
                    if not pts: pg.wait_for_timeout(300); continue
                    pg.mouse.move(*pts[0]); pg.mouse.down()
                    for x, y in pts[1:]: pg.mouse.move(x, y); pg.wait_for_timeout(12)
                    pg.mouse.up(); pg.wait_for_timeout(250)
            elif scr == 'star':
                st = pg.evaluate("() => { const r = kitphonic.starScreen.run; return r && { busy: !!r.busy, w: r.star.w, cards: document.querySelectorAll('#st-cards .wcard2').length } }")
                if not st or st['busy'] or not st['cards']: pg.wait_for_timeout(300); continue
                pg.wait_for_timeout(800); pg.locator(f"#st-cards .wcard2[data-w='{st['w']}']").click(); pg.wait_for_timeout(1300)
            elif scr == 'sentence':
                st = pg.evaluate("() => { const r = kitphonic.sentenceScreen.run; return r && { i: r.i, kind: r.tokens[r.i]?.kind, blend: !!r.ms, read: !document.getElementById('sn-read').disabled, reading: !!r.reading } }")
                if not st or st['reading']: pg.wait_for_timeout(400); continue
                if st['read']: pg.locator('#sn-read').click(); pg.wait_for_timeout(800); continue
                if st['kind'] == 'star': pg.wait_for_timeout(500); pg.locator('#sn-strip .chip').nth(st['i']).click(); pg.wait_for_timeout(900); continue
                if st['blend'] and pg.locator('#sn-handle').is_visible():
                    hb = pg.locator('#sn-handle').bounding_box(); tb = pg.locator('#sn-tiles .tile').last.bounding_box()
                    y = hb['y'] + hb['height'] / 2; x0 = hb['x'] + hb['width'] / 2; x1 = tb['x'] + tb['width'] + 8
                    pg.mouse.move(x0, y); pg.mouse.down()
                    for k in range(1, 41): pg.mouse.move(x0 + (x1 - x0) * k / 40, y); pg.wait_for_timeout(45)
                    pg.mouse.up(); pg.wait_for_timeout(900); continue
                pg.wait_for_timeout(300)
            elif scr == 'word':
                state = pg.evaluate("() => kitphonic.screen.state")
                if state == 'slide':
                    hb = pg.locator('#handle').bounding_box(); tb = pg.locator('#tiles').bounding_box()
                    y = hb['y'] + hb['height'] / 2; x0 = hb['x'] + hb['width'] / 2; x1 = tb['x'] + tb['width'] - 2
                    pg.mouse.move(x0, y); pg.mouse.down()
                    for k in range(1, 41): pg.mouse.move(x0 + (x1 - x0) * k / 40, y); pg.wait_for_timeout(45)
                    pg.mouse.up(); pg.wait_for_timeout(500)
                elif state == 'check':
                    pg.wait_for_timeout(800)
                    wd = pg.evaluate("() => kitphonic.screen.entry.w"); pg.locator(f".choice[data-w='{wd}']").first.click(); pg.wait_for_timeout(900)
                elif state == 'revealed' and pg.locator('#next').is_visible(): pg.locator('#next').click(); pg.wait_for_timeout(400)
                else: pg.wait_for_timeout(300)
            else: pg.wait_for_timeout(300)
        done = pg.evaluate("() => !document.getElementById('done').hidden || !document.getElementById('map').hidden")
        log = pg.evaluate("() => kitphonic.store.all().filter(r => !r.seeded).map(r => r.skill + (r.correct ? '+' : '-') + (r.scored === false ? '(unscored)' : ''))")
        if a.shots: pg.screenshot(path=f"{a.shots}/{shot:02d}-end.png")
        print('screens:', ' > '.join(seen + (['done'] if done else [])))
        print(f"responses ({len(log)}):", ' '.join(log))
        print(f"{'ALL DONE' if done else 'DID NOT FINISH'} in {time.time() - t0:.0f}s")
        b.close(); sys.exit(0 if done else 1)

if __name__ == '__main__':
    main()
