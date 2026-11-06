#!/usr/bin/env python3
"""rc8: repeated real completions of "at" open the next stop (p), and stay open.

Seeds a fresh profile at the "at" stop (m s a t passed, same response shape as play), drives the
word screen with a slow slide and the right word card, presses Home, reloads, then does it again.
A fast slide must not open the check. An older log of finished-but-unscored "at" trials stays put.

  python3 tools/at-unlock-repro.py [--base http://127.0.0.1:8080/] [--shots DIR]
"""
import argparse, os, sys, time
from playwright.sync_api import sync_playwright

SEED = """() => {
  let t = Date.now() - 3600e3; const log = [];
  for (const g of ['m', 's', 'a', 't']) for (let i = 0; i < 5; i++)
    log.push({ skill: 'sound:' + g, itemId: g, correct: true, firstAttempt: true, assisted: false, scored: true, timestamp: t += 1000, sessionId: 'letters' });
  localStorage.setItem('kitphonic.v1.responses', JSON.stringify(log));
  localStorage.removeItem('kitphonic.v1.seen');
}"""
MAP = """() => { const m = kitphonic.map(); const cur = document.querySelector('#map .stop.current');
  return { index: m.index, id: m.current && m.current.id, label: m.current && m.current.label,
    stars: m.stops.filter(s => s.status === 'passed').length, shown: cur ? cur.textContent : null }; }"""
BLENDS = """() => kitphonic.store.all().filter(r => r.skill === 'blend:L1').map(r =>
  r.itemId + (r.modelled ? 'M' : '') + (r.scored === false ? 'U' : 'S') + (r.fling ? 'F' : '') + (r.fast ? 'f' : '') + '@' + (r.sweepMs || 0))"""


def shot(pg, path):
    if path: os.makedirs(os.path.dirname(path), exist_ok=True); pg.screenshot(path=path)


def slide(pg, steps, step_ms):
    hb = pg.locator('#handle').bounding_box(); tb = pg.locator('#tiles').bounding_box()
    y = hb['y'] + hb['height'] / 2; x0 = hb['x'] + hb['width'] / 2; x1 = tb['x'] + tb['width'] - 2
    pg.mouse.move(x0, y); pg.mouse.down()
    for k in range(1, steps + 1):
        pg.mouse.move(x0 + (x1 - x0) * k / steps, y); pg.wait_for_timeout(step_ms)
    pg.mouse.up()


def play_words(pg, timeout, slow=True, limit=None):
    """Drive the word screen until it goes away, or until `limit` words have been finished."""
    t0, seen, finished = time.time(), [], 0
    while time.time() - t0 < timeout:
        scr = pg.evaluate("() => [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id")
        if scr != 'word':
            if seen: return seen
            pg.wait_for_timeout(200); continue
        if not seen or seen[-1] != 'word': seen.append('word')
        state = pg.evaluate("() => kitphonic.screen.state")
        if state == 'slide':
            slide(pg, 40 if slow else 8, 45 if slow else 12)
            pg.wait_for_timeout(400)
        elif state == 'check':
            pg.wait_for_timeout(800)
            wd = pg.evaluate("() => kitphonic.screen.entry.w")
            pg.locator(f".choice[data-w='{wd}']").first.click()
            pg.wait_for_timeout(900)
        elif state == 'revealed' and pg.locator('#next').is_visible():
            finished += 1
            if limit and finished >= limit: return seen
            pg.locator('#next').click(); pg.wait_for_timeout(400)
        else:
            pg.wait_for_timeout(250)
    raise SystemExit('timed out on the word screen')


def home(pg):
    btn = [x for x in pg.locator('.screen:not([hidden]) .top button[aria-label="Home"]').all() if x.is_visible()]
    if not btn: raise SystemExit('no Home button')
    btn[0].click(); pg.wait_for_timeout(700)


def instant_correct_tap(pg, base):
    """Slow valid slide, then the correct card the instant it exists. Returns the logged read."""
    pg.goto(base + '?skipHello=1&direct=1&level=1&word=at&seed=3&support=3', wait_until='networkidle')
    pg.wait_for_timeout(700)
    pg.evaluate('kitphonic.audio.unlock()')
    pg.evaluate("""() => {
      window.__tap = null;
      const check = document.getElementById('check');
      new MutationObserver(() => {
        if (check.hidden || window.__tap) return;
        const w = kitphonic.screen.entry.w;
        const btn = document.querySelector('#choices .choice[data-w="' + w + '"]');
        if (!btn) return;
        window.__tap = {visibleAt: performance.now()};
        btn.click();
        window.__tap.clickedAt = performance.now();
      }).observe(check, {attributes: true, childList: true, subtree: true});
    }""")
    slide(pg, 40, 45)
    pg.wait_for_timeout(1500)
    return pg.evaluate("""() => {
      const r = kitphonic.store.all().filter(x => (x.skill || '').startsWith('blend:')).at(-1);
      return {tap: window.__tap, state: kitphonic.screen.state,
        logged: r && {correct: r.correct, scored: r.scored, fast: !!r.fast, modelled: !!r.modelled, latencyMs: r.latencyMs, sweepMs: r.sweepMs}};
    }""")


def drive_until_end(pg, timeout):
    """Play the open session until the practice screen or the level-up. Returns which one."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        scr = pg.evaluate("() => [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id")
        if scr in ('done', 'levelup'): return scr
        if scr == 'word':
            state = pg.evaluate("() => kitphonic.screen.state")
            if state == 'slide': slide(pg, 40, 45); pg.wait_for_timeout(300)
            elif state == 'check':
                pg.wait_for_timeout(200); wd = pg.evaluate("() => kitphonic.screen.entry.w")
                pg.locator(f".choice[data-w='{wd}']").first.click(); pg.wait_for_timeout(700)
            elif state == 'revealed' and pg.locator('#next').is_visible():
                pg.locator('#next').click(); pg.wait_for_timeout(250)
            else: pg.wait_for_timeout(200)
        elif scr == 'star':
            st = pg.evaluate("() => { const r = kitphonic.starScreen.run; return r && { busy: !!r.busy, w: r.star.w, cards: document.querySelectorAll('#st-cards .wcard2').length } }")
            if not st or st['busy'] or not st['cards']: pg.wait_for_timeout(250); continue
            pg.locator(f"#st-cards .wcard2[data-w='{st['w']}']").click(); pg.wait_for_timeout(900)
        elif scr == 'letters':
            st = pg.evaluate("() => { const r = kitphonic.letters.run; return r && { scored: !!r.def.scored, target: r.target, busy: !!r.busy } }")
            if not st or st['busy']: pg.wait_for_timeout(200); continue
            if st['scored']:
                pg.wait_for_timeout(400); pg.locator(f".ltr[data-l='{st['target']}'] .tile").first.click(force=True); pg.wait_for_timeout(600)
            else:
                for t in pg.locator('.ltr .tile').all()[:3]: t.click(force=True); pg.wait_for_timeout(120)
                if pg.locator('#l-next').is_visible(): pg.locator('#l-next').click()
        else:
            pg.wait_for_timeout(200)
    raise SystemExit('session did not end')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:8080/')
    ap.add_argument('--shots', default='/tmp/at-unlock')
    ap.add_argument('--headed', action='store_true')
    a = ap.parse_args()
    exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe, headless=not a.headed,
                              args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-position=20,20'])
        ctx = b.new_context(viewport={'width': 820, 'height': 1180}, has_touch=True)
        pg = ctx.new_page()
        quick = instant_correct_tap(pg, a.base)
        print('instant correct tap', quick)
        logged = quick['logged'] or {}
        if not (logged.get('correct') and logged.get('scored') and not logged.get('fast') and logged.get('sweepMs', 0) >= 500 and logged.get('latencyMs', 0) >= 600):
            raise SystemExit(f'a tap at the moment the cards appear did not count: {quick}')
        if quick['state'] not in ('revealed', 'picked'): raise SystemExit(f'correct tap did not finish the word: {quick}')
        pg.goto(a.base + '?skipHello=1', wait_until='networkidle')
        pg.evaluate(SEED); pg.goto(a.base + '?skipHello=1', wait_until='networkidle'); pg.wait_for_timeout(600)
        pg.evaluate('kitphonic.audio.unlock()')
        before = pg.evaluate(MAP)
        print('boot', before)
        shot(pg, f'{a.shots}/01-map-at.png')
        if before['id'] != 'words:L1': raise SystemExit(f"expected to start on at, got {before}")
        pg.locator('#go').click(); pg.wait_for_timeout(400)
        plan = pg.evaluate("() => kitphonic.session.plan.items.map(i => i.type + ':' + (i.why||'') + (i.words ? '['+i.words.map(w=>w.w).join(',')+']' : ''))")
        print('session1 plan', plan)
        # Modelled session: finish it. The end screen must offer more practice, not the step-complete celebration.
        end1 = drive_until_end(pg, 180)
        practice = pg.evaluate("""() => ({
          screen: [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id,
          kind: document.getElementById('done').dataset.kind,
          bubble: document.getElementById('done-bubble').textContent,
          stop: document.getElementById('done-stop').textContent,
          again: !document.getElementById('done-again').hidden,
          home: !document.getElementById('done-home').hidden,
          levelup: !document.getElementById('levelup').hidden,
        })""")
        print('session 1 end', end1, practice)
        shot(pg, f'{a.shots}/02-practice-again.png')
        if end1 != 'done' or practice['kind'] != 'practice' or practice['bubble'] != "Let's read it again." or practice['stop'] != 'at':
            raise SystemExit(f'modelled session looked like a passed stop: {practice}')
        if not practice['again'] or not practice['home'] or practice['levelup']: raise SystemExit(f'continue/break missing: {practice}')
        # Break: the recorded "all done for today" line, then the map, still on at.
        pg.locator('#done-home').click()
        pg.wait_for_selector('#map:not([hidden])', timeout=8000)
        mid = pg.evaluate(MAP); print('break after modelled session', mid)
        shot(pg, f'{a.shots}/02b-break-still-at.png')
        if mid['id'] != 'words:L1' or mid['stars'] != before['stars']: raise SystemExit(f'break moved the map: {mid}')
        pg.goto(a.base + '?skipHello=1&reload=1', wait_until='networkidle'); pg.wait_for_timeout(500)
        rel1 = pg.evaluate(MAP); print('reload after session 1', rel1)
        if rel1['id'] != 'words:L1' or rel1['stars'] < before['stars']: raise SystemExit(f'reload lost or moved: {rel1}')
        # Home in the middle of the scored session must not pass the stop.
        pg.locator('#go').click(); pg.wait_for_timeout(500)
        play_words(pg, 120, limit=2)
        home(pg)
        mid2 = pg.evaluate(MAP); print('home mid scored session', mid2, pg.evaluate(BLENDS))
        if mid2['id'] != 'words:L1': raise SystemExit(f'home mid-session passed the stop: {mid2}')
        pg.goto(a.base + '?skipHello=1&reload=1b', wait_until='networkidle'); pg.wait_for_timeout(400)
        if pg.evaluate(MAP)['id'] != 'words:L1': raise SystemExit('reload after partial scored session moved the map')
        pg.locator('#go').click(); pg.wait_for_timeout(400)
        end2 = drive_until_end(pg, 240)
        if end2 != 'levelup':
            done = pg.evaluate("() => document.getElementById('done-bubble') && document.getElementById('done-bubble').textContent")
            raise SystemExit(f'scored session ended on {end2} ({done}) not the unlock')
        pg.wait_for_timeout(400); shot(pg, f'{a.shots}/03-levelup.png')
        up = pg.evaluate("() => ({say: document.querySelector('#levelup .lv-say').textContent, levelup: !document.getElementById('levelup').hidden})")
        print('level up', up)
        if up['say'] != 'You did it!': raise SystemExit(f'unlock copy changed: {up}')
        pg.locator('#lv-next').click(); pg.wait_for_timeout(800)
        after = pg.evaluate(MAP); print('after session 2', after)
        print('blends', pg.evaluate(BLENDS))
        shot(pg, f'{a.shots}/04-map-p.png')
        if after['id'] != 'sound:p': raise SystemExit(f"next stop did not open: {after}")
        if after['stars'] < mid['stars']: raise SystemExit('stars dropped')
        pg.goto(a.base + '?skipHello=1&reload=2', wait_until='networkidle'); pg.wait_for_timeout(400)
        rel2 = pg.evaluate(MAP); print('reload after unlock', rel2)
        shot(pg, f'{a.shots}/05-reload-p.png')
        if rel2['id'] != 'sound:p' or rel2['stars'] < after['stars']: raise SystemExit(f'reload did not keep p: {rel2}')
        # Home during the next lesson must not walk back.
        pg.locator('#go').click(); pg.wait_for_timeout(800); home(pg)
        back = pg.evaluate(MAP); print('home during p', back)
        if back['index'] < rel2['index'] or back['stars'] < rel2['stars']: raise SystemExit(f'walked back {back}')
        # Fast slide does not open the check; a slow slide does.
        pg.goto(a.base + '?skipHello=1&direct=1&level=1&word=at&seed=1', wait_until='networkidle'); pg.wait_for_timeout(800)
        slide(pg, 6, 10); pg.wait_for_timeout(500)
        fast = pg.evaluate("() => ({ state: kitphonic.screen.state, check: !document.getElementById('check').hidden })")
        print('fast slide', fast); shot(pg, f'{a.shots}/06-fast-reslide.png')
        if fast['check'] or fast['state'] == 'check': raise SystemExit(f'fast slide opened the check: {fast}')
        slide(pg, 40, 45); pg.wait_for_timeout(1200)
        slow = pg.evaluate("() => ({ state: kitphonic.screen.state, check: !document.getElementById('check').hidden })")
        print('slow slide', slow); shot(pg, f'{a.shots}/07-slow-check.png')
        if not slow['check']: raise SystemExit(f'slow slide did not open the check: {slow}')
        # Representative old history: completed modelled flings do not pass "at", and are not deleted.
        ctx2 = b.new_context(viewport={'width': 390, 'height': 844})
        pg2 = ctx2.new_page(); pg2.goto(a.base + '?skipHello=1', wait_until='networkidle')
        pg2.evaluate(SEED)
        pg2.evaluate("""() => { const log = JSON.parse(localStorage.getItem('kitphonic.v1.responses')); let t = Date.now() - 100000;
          for (let i = 0; i < 10; i++) log.push({ skill: 'blend:L1', itemId: i % 2 ? 'at' : 'am', correct: true, firstAttempt: true,
            scored: false, modelled: true, fling: true, support: 4, pattern: 'VC', timestamp: t += 1000, sessionId: 'old' });
          localStorage.setItem('kitphonic.v1.responses', JSON.stringify(log)); }""")
        pg2.goto(a.base + '?skipHello=1&old=1', wait_until='networkidle'); pg2.wait_for_timeout(400)
        old = pg2.evaluate(MAP)
        n = pg2.evaluate("() => kitphonic.store.all().filter(r => r.skill === 'blend:L1').length")
        print('old fling history', old, 'blend rows', n)
        shot(pg2, f'{a.shots}/08-old-history-still-at.png')
        if old['id'] != 'words:L1' or n < 10: raise SystemExit(f'old history not preserved or wrongly passed: {old} n={n}')
        b.close()
    print('OK')

if __name__ == '__main__':
    main()
