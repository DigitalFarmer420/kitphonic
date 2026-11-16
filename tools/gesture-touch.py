#!/usr/bin/env python3
"""Multi-touch and keyboard coverage for the sentence blend slider and the family tray.

Emulates a real touch screen (CDP Input.dispatchTouchEvent, maxTouchPoints 5) in headless Chromium.
iPad profiles use a Mac-like Safari UA, navigator.platform MacIntel, and maxTouchPoints 5.

Checks, per profile:
  - sentence slider: a second finger cannot move or end the drag; touchcancel and a lostpointercapture
    release the owner so a new finger can slide; Arrow/Home/End and ARIA track the sweep
  - word slider: Arrow keys light sounds and, given time, open the picture check; ARIA stays in sync
  - family tray: a second finger cannot steal a drag or drop a tile; touchcancel and lostpointercapture
    drop the ghost without placing; a later one-finger drop still places; Enter/Space and a click select
  - tracing: after a stroke finishes, a second finger cannot start the next stroke until the owner lifts

  python3 tools/gesture-touch.py [--base http://127.0.0.1:8099/] [--profile pixel-7-portrait ipad-pro-11-portrait]
"""
import argparse, json, sys, time
from playwright.sync_api import sync_playwright

MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
PROFILES = {
    'pixel-7-portrait': ('Pixel 7', False, False),
    'ipad-pro-11-portrait': ('iPad Pro 11', False, True),
}

def launch(p, name):
    dev, land, mac = PROFILES[name]
    d = dict(p.devices[dev]); d.pop('default_browser_type', None)
    if land:
        d['viewport'] = {'width': d['viewport']['height'], 'height': d['viewport']['width']}; d.pop('screen', None)
    if mac:
        d['user_agent'] = MAC_UA
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(**d)
    if mac:
        ctx.add_init_script("Object.defineProperty(navigator,'platform',{get:()=>'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});")
    pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg)
    cdp.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
    def touch(typ, tps):
        cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, x, y in tps]})
    return b, pg, touch

def wait_sentence_slider(pg):
    deadline = time.time() + 15
    while time.time() < deadline:
        st = pg.evaluate("""() => {
          const r = kitphonic.sentenceScreen.run; if (!r) return null;
          const chip = document.querySelector('#sn-strip .wd.cur');
          return { ms: !!r.ms, star: !!(chip && chip.classList.contains('star') && !chip.classList.contains('done')), i: r.i };
        }""")
        if st and st['ms'] and pg.locator('#sn-handle').is_visible():
            return True
        if st and st['star']:
            pg.evaluate("() => document.querySelector('#sn-strip .wd.cur')?.click()")
            pg.wait_for_timeout(850)
        else:
            pg.wait_for_timeout(200)
    return False

def slider_geom(pg):
    return pg.evaluate("""() => {
      const h = document.getElementById('sn-handle').getBoundingClientRect();
      const t = document.getElementById('sn-track').getBoundingClientRect();
      return { hx: h.left + h.width / 2, hy: h.top + h.height / 2, left: t.left, right: t.right, y: h.top + h.height / 2 };
    }""")

def handle_x(pg):
    return pg.evaluate("() => { const r = document.getElementById('sn-handle').getBoundingClientRect(); return r.left + r.width / 2 }")

def open_url(pg, base, query):
    pg.goto(f"{base}?{query}&_={time.time()}", wait_until='domcontentloaded')

def run_sentence(pg, touch, fails, name, base):
    open_url(pg, base, 'skipHello=1&activity=sentence&sentence=map-mat&seed=1&support=3')
    if not wait_sentence_slider(pg):
        fails.append(f'{name} sentence: slider never appeared'); return
    g = slider_geom(pg)
    span = max(40, g['right'] - g['left'])
    y = g['hy']
    mid = g['hx'] + span * 0.22
    later = g['hx'] + span * 0.42
    far = g['right'] - 6
    touch('touchStart', [(1, g['hx'], y)]); pg.wait_for_timeout(40)
    touch('touchMove', [(1, mid, y)]); pg.wait_for_timeout(40)
    owner = pg.evaluate("() => kitphonic.sentenceScreen.run?.dragId")
    hx = handle_x(pg)
    if owner is None: fails.append(f'{name} sentence: first finger did not own the drag')
    if abs(hx - mid) > 80: fails.append(f'{name} sentence: knob {hx:.0f} did not follow finger 1 at {mid:.0f}')
    touch('touchStart', [(1, mid, y), (2, far, y)]); pg.wait_for_timeout(30)
    touch('touchMove', [(1, mid, y), (2, g['left'] + 8, y)]); pg.wait_for_timeout(30)
    touch('touchEnd', [(2, g['left'] + 8, y)]); pg.wait_for_timeout(40)
    owner2 = pg.evaluate("() => kitphonic.sentenceScreen.run?.dragId")
    hx2 = handle_x(pg)
    if owner2 != owner: fails.append(f'{name} sentence: second finger changed owner {owner} -> {owner2}')
    if abs(hx2 - hx) > 45: fails.append(f'{name} sentence: second finger moved the knob {hx:.0f} -> {hx2:.0f}')
    if not pg.evaluate("() => !!kitphonic.sentenceScreen.run?.ms"): fails.append(f'{name} sentence: second finger ended the blend')
    touch('touchMove', [(1, later, y)]); pg.wait_for_timeout(40)
    hx3 = handle_x(pg)
    if abs(hx3 - later) > 80: fails.append(f'{name} sentence: after the palm lifted, finger 1 did not track ({hx3:.0f} vs {later:.0f})')
    touch('touchCancel', []); pg.wait_for_timeout(80)
    if pg.evaluate("() => kitphonic.sentenceScreen.run?.dragId") is not None:
        fails.append(f'{name} sentence: touchcancel left the owner stuck')
    # a new finger can slide again
    g = slider_geom(pg)
    touch('touchStart', [(3, g['hx'], g['hy'])]); pg.wait_for_timeout(30)
    touch('touchMove', [(3, g['hx'] + span * 0.2, g['hy'])]); pg.wait_for_timeout(40)
    if pg.evaluate("() => kitphonic.sentenceScreen.run?.dragId") is None:
        fails.append(f'{name} sentence: could not start a drag after cancel')
    if abs(handle_x(pg) - (g['hx'] + span * 0.2)) > 80:
        fails.append(f'{name} sentence: post-cancel drag did not move the knob')
    pid = pg.evaluate("() => kitphonic.sentenceScreen.run?.dragId")
    lost = pg.evaluate("""pid => {
      document.getElementById('sn-handle').dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: pid, bubbles: true }));
      return kitphonic.sentenceScreen.run?.dragId ?? null;
    }""", pid)
    if lost is not None: fails.append(f'{name} sentence: lostpointercapture did not release owner {lost}')
    touch('touchEnd', []); pg.wait_for_timeout(40)
    # keyboard / ARIA on a fresh slider (reload so the sweep is at the start)
    open_url(pg, base, 'skipHello=1&activity=sentence&sentence=map-mat&seed=1&support=3')
    if not wait_sentence_slider(pg):
        fails.append(f'{name} sentence keys: slider never appeared'); return
    aria = pg.evaluate("""() => {
      const h = document.getElementById('sn-handle');
      return { min: h.getAttribute('aria-valuemin'), max: h.getAttribute('aria-valuemax'), now: h.getAttribute('aria-valuenow'),
        text: h.getAttribute('aria-valuetext'), role: h.getAttribute('role'), tab: h.tabIndex };
    }""")
    if aria['role'] != 'slider' or aria['min'] != '0' or aria['max'] != '100' or aria['now'] != '0' or aria['tab'] != 0:
        fails.append(f'{name} sentence ARIA at rest {aria}')
    if not (aria['text'] or '').endswith('sounds') and aria['text'] != 'start':
        fails.append(f'{name} sentence valuetext {aria["text"]}')
    i0 = pg.evaluate("() => kitphonic.sentenceScreen.run.i")
    pg.evaluate("() => document.getElementById('sn-handle').focus()")
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(80)
    after = pg.evaluate("""() => {
      const h = document.getElementById('sn-handle');
      return { now: +h.getAttribute('aria-valuenow'), text: h.getAttribute('aria-valuetext'),
        passed: document.querySelectorAll('#sn-tiles .tile.passed').length };
    }""")
    if not (after['now'] > 0 and after['passed'] >= 1 and after['text'].startswith('1 of')):
        fails.append(f'{name} sentence ArrowRight did not pass a sound {after}')
    pg.keyboard.press('Home'); pg.wait_for_timeout(80)
    home = pg.evaluate("() => +document.getElementById('sn-handle').getAttribute('aria-valuenow')")
    if home != 0: fails.append(f'{name} sentence Home left valuenow {home}')
    pg.keyboard.press('End')
    try:
        pg.wait_for_function(f"() => kitphonic.sentenceScreen.run && kitphonic.sentenceScreen.run.i > {i0}", timeout=4000)
    except Exception:
        fails.append(f'{name} sentence End did not advance the word')

def run_word_keys(pg, fails, name, base):
    open_url(pg, base, 'skipHello=1&level=1&word=at&support=3&seed=1')
    try:
        pg.wait_for_function("() => kitphonic.screen.state === 'slide' && document.getElementById('handle')", timeout=10000)
    except Exception:
        fails.append(f'{name} word: slider never ready'); return
    pg.wait_for_timeout(300)
    aria = pg.evaluate("""() => { const h = document.getElementById('handle');
      return { min: h.getAttribute('aria-valuemin'), max: h.getAttribute('aria-valuemax'), now: h.getAttribute('aria-valuenow'), text: h.getAttribute('aria-valuetext') }; }""")
    if aria['min'] != '0' or aria['max'] != '100' or aria['now'] != '0' or 'of' not in (aria['text'] or ''):
        fails.append(f'{name} word ARIA {aria}')
    pg.evaluate("() => document.getElementById('handle').focus()")
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(100)
    step = pg.evaluate("""() => ({ now: +document.getElementById('handle').getAttribute('aria-valuenow'),
      lit: document.querySelectorAll('#tiles .tile.lit, #markers .marker.lit').length })""")
    if step['now'] <= 0 or step['lit'] < 1: fails.append(f'{name} word ArrowRight {step}')
    # two sounds + the end, slower than the fling guard (250 ms per sound)
    pg.wait_for_timeout(450); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(450); pg.keyboard.press('ArrowRight')
    try:
        pg.wait_for_function("() => ['blending','check','picked','revealed'].includes(kitphonic.screen.state)", timeout=4000)
    except Exception:
        st = pg.evaluate("() => ({ state: kitphonic.screen.state, now: document.getElementById('handle').getAttribute('aria-valuenow'), bubble: document.getElementById('bubble')?.textContent })")
        fails.append(f'{name} word keys did not blend {st}')

def centers(pg):
    return pg.evaluate("""() => {
      const box = e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      return { tiles: [...document.querySelectorAll('#fm-tray .ftile')].map(e => ({ g: e.dataset.g, ...box(e) })), slot: box(document.getElementById('fm-slot')) };
    }""")

def wait_family(pg):
    pg.wait_for_function("() => { const r = kitphonic.familyScreen.run; return !!(r && !r.busy && document.querySelector('#fm-tray .ftile')); }", timeout=15000)

def drag_tile_to_slot(pg, touch, tile, slot):
    touch('touchStart', [(1, tile['x'], tile['y'])]); pg.wait_for_timeout(30)
    for k in range(1, 9):
        x = tile['x'] + (slot['x'] - tile['x']) * k / 8
        y = tile['y'] + (slot['y'] - tile['y']) * k / 8
        touch('touchMove', [(1, x, y)]); pg.wait_for_timeout(20)
    touch('touchEnd', [(1, slot['x'], slot['y'])])

def run_family(pg, touch, fails, name, base):
    open_url(pg, base, 'skipHello=1&activity=family&rime=ap&seed=1')
    try: wait_family(pg)
    except Exception:
        fails.append(f'{name} family: tray never ready'); return
    c = centers(pg)
    if len(c['tiles']) < 2: fails.append(f'{name} family: need two tiles'); return
    a, b, slot = c['tiles'][0], c['tiles'][1], c['slot']
    # finger 1 drags halfway; finger 2 tries to drop the other tile on the slot
    mid = {'x': (a['x'] + slot['x']) / 2, 'y': (a['y'] + slot['y']) / 2}
    touch('touchStart', [(1, a['x'], a['y'])]); pg.wait_for_timeout(30)
    touch('touchMove', [(1, mid['x'], mid['y'])]); pg.wait_for_timeout(40)
    owner = pg.evaluate("() => kitphonic.familyScreen.run?.dragId")
    if owner is None or not pg.evaluate("() => !!document.querySelector('.fdrag')"):
        fails.append(f'{name} family: finger 1 did not pick up a tile')
    touch('touchStart', [(1, mid['x'], mid['y']), (2, b['x'], b['y'])]); pg.wait_for_timeout(30)
    for k in range(1, 6):
        touch('touchMove', [(1, mid['x'], mid['y']), (2, b['x'] + (slot['x'] - b['x']) * k / 5, b['y'] + (slot['y'] - b['y']) * k / 5)])
        pg.wait_for_timeout(16)
    touch('touchEnd', [(2, slot['x'], slot['y'])]); pg.wait_for_timeout(50)
    if pg.evaluate("() => kitphonic.familyScreen.run?.dragId") != owner:
        fails.append(f'{name} family: second finger stole the drag')
    if pg.evaluate("() => kitphonic.familyScreen.run.made.size") != 0:
        fails.append(f'{name} family: second finger placed a word')
    if not pg.evaluate("() => !!document.querySelector('.fdrag')"):
        fails.append(f'{name} family: second finger ended finger 1\'s drag')
    # lift finger 1 back on the tray: must not place
    touch('touchMove', [(1, a['x'], a['y'])]); pg.wait_for_timeout(20)
    touch('touchEnd', [(1, a['x'], a['y'])]); pg.wait_for_timeout(80)
    if pg.evaluate("() => kitphonic.familyScreen.run.made.size") != 0:
        fails.append(f'{name} family: lifting away from the slot placed a word')
    if pg.evaluate("() => !!document.querySelector('.fdrag')"):
        fails.append(f'{name} family: ghost left behind after lift')
    # cancel aborts without placing, then a real drop works
    c = centers(pg); tile = c['tiles'][0]
    touch('touchStart', [(1, tile['x'], tile['y'])]); pg.wait_for_timeout(20)
    touch('touchMove', [(1, (tile['x'] + c['slot']['x']) / 2, (tile['y'] + c['slot']['y']) / 2)]); pg.wait_for_timeout(30)
    if not pg.evaluate("() => !!document.querySelector('.fdrag')"):
        fails.append(f'{name} family: no ghost before cancel')
    touch('touchCancel', []); pg.wait_for_timeout(80)
    if pg.evaluate("() => kitphonic.familyScreen.run?.dragId") is not None or pg.evaluate("() => !!document.querySelector('.fdrag')"):
        fails.append(f'{name} family: touchcancel did not clear the drag')
    if pg.evaluate("() => kitphonic.familyScreen.run.made.size") != 0:
        fails.append(f'{name} family: touchcancel placed a word')
    # lost capture is deferred so a real lift can still commit; with no lift, the ghost goes and nothing is placed
    c = centers(pg); tile = c['tiles'][0]
    touch('touchStart', [(1, tile['x'], tile['y'])]); pg.wait_for_timeout(20)
    touch('touchMove', [(1, tile['x'] + 40, tile['y'] - 40)]); pg.wait_for_timeout(30)
    lost = pg.evaluate("""() => new Promise(resolve => {
      const pid = kitphonic.familyScreen.run?.dragId;
      const el = document.querySelector('#fm-tray .ftile.dragging');
      const before = !!document.querySelector('.fdrag');
      el && el.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: pid, bubbles: true }));
      const syncGhost = !!document.querySelector('.fdrag');
      const syncId = kitphonic.familyScreen.run?.dragId ?? null;
      setTimeout(() => resolve({ pid, before, syncGhost, syncId, after: !!document.querySelector('.fdrag'), dragId: kitphonic.familyScreen.run?.dragId ?? null, made: kitphonic.familyScreen.run.made.size }), 40);
    })""")
    if not lost['before'] or not lost['syncGhost'] or lost['syncId'] != lost['pid']:
        fails.append(f'{name} family: lostpointercapture aborted before pointerup could commit {lost}')
    if lost['after'] or lost['dragId'] is not None or lost['made'] != 0:
        fails.append(f'{name} family: lost capture did not abort cleanly {lost}')
    touch('touchEnd', []); pg.wait_for_timeout(40)
    if pg.evaluate("() => kitphonic.familyScreen.run.made.size") != 0:
        fails.append(f'{name} family: lift after lost capture placed a word')
    # one finger can still drop a tile on the slot
    try: wait_family(pg)
    except Exception:
        fails.append(f'{name} family: busy after cancel'); return
    c = centers(pg)
    drag_tile_to_slot(pg, touch, c['tiles'][0], c['slot'])
    try:
        pg.wait_for_function("() => document.getElementById('fm-slot').classList.contains('filled') || kitphonic.familyScreen.run.made.size > 0", timeout=4000)
    except Exception:
        fails.append(f'{name} family: one-finger drop did not place')
    # keyboard and click, on a fresh board
    open_url(pg, base, 'skipHello=1&activity=family&rime=ap&seed=1')
    try: wait_family(pg)
    except Exception:
        fails.append(f'{name} family keys: tray never ready'); return
    pg.evaluate("() => document.querySelector('#fm-tray .ftile').focus()")
    pg.keyboard.press('Enter'); pg.wait_for_timeout(50)
    sel = pg.evaluate("""() => { const t = document.querySelector('#fm-tray .ftile');
      return { pressed: t.getAttribute('aria-pressed'), sel: t.classList.contains('sel') }; }""")
    if sel['pressed'] != 'true' or not sel['sel']: fails.append(f'{name} family Enter did not select {sel}')
    pg.keyboard.press(' '); pg.wait_for_timeout(50)
    if pg.evaluate("() => document.querySelector('#fm-tray .ftile').getAttribute('aria-pressed')") != 'false':
        fails.append(f'{name} family Space did not toggle the tile off')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(40)
    pg.evaluate("() => document.getElementById('fm-slot').focus()")
    pg.keyboard.press('Enter'); pg.wait_for_timeout(80)
    if not pg.evaluate("() => document.getElementById('fm-slot').classList.contains('filled')"):
        fails.append(f'{name} family keyboard did not place on the slot')
    # focus ring is visible for keyboard, and a pointer click selects exactly once
    open_url(pg, base, 'skipHello=1&activity=family&rime=at&seed=2')
    try: wait_family(pg)
    except Exception:
        fails.append(f'{name} family click: tray never ready'); return
    for _ in range(12):
        pg.keyboard.press('Tab')
        if pg.evaluate("() => document.activeElement?.classList?.contains('ftile')"): break
    ring = pg.evaluate("""() => { const s = getComputedStyle(document.activeElement);
      return { tag: document.activeElement?.className || '', style: s.outlineStyle, width: s.outlineWidth }; }""")
    if 'ftile' not in ring['tag'] or ring['style'] == 'none' or float(ring['width'].replace('px', '') or 0) < 3:
        fails.append(f'{name} family focus ring {ring}')
    pg.locator('#fm-tray .ftile').first.click(); pg.wait_for_timeout(80)
    clicked = pg.evaluate("""() => { const t = document.querySelector('#fm-tray .ftile');
      return { pressed: t.getAttribute('aria-pressed'), sel: t.classList.contains('sel') }; }""")
    if clicked['pressed'] != 'true' or not clicked['sel']:
        fails.append(f'{name} family click selected {clicked} (a pointer tap must not toggle twice)')

def run_trace_owner(pg, touch, fails, name, base):
    open_url(pg, base, 'skipHello=1&activity=trace&gpc=t')
    pg.wait_for_timeout(800)
    pts = pg.evaluate("() => kitphonic.lesson.run?.debugPoints?.() ?? []")
    if len(pts) < 2: fails.append(f'{name} trace: no stroke points'); return
    touch('touchStart', [(1, *pts[0])])
    last = pts[0]
    for q in pts[1:]:
        touch('touchMove', [(1, *q)]); pg.wait_for_timeout(12); last = q
        st = pg.evaluate("() => kitphonic.lesson.run?.debugState?.()")
        if st and st.get('stroke', 0) >= 1: break
    st = pg.evaluate("() => kitphonic.lesson.run?.debugState?.()")
    owner = pg.evaluate("() => kitphonic.lesson.run?.debugOwner?.()")
    if not st or st.get('stroke') != 1 or st.get('k', 1) != 0:
        fails.append(f'{name} trace: first stroke did not finish cleanly {st}'); touch('touchEnd', []); return
    if owner is None: fails.append(f'{name} trace: owner released when the stroke finished')
    pts2 = pg.evaluate("() => kitphonic.lesson.run?.debugPoints?.() ?? []")
    if len(pts2) < 2: fails.append(f'{name} trace: no second stroke'); touch('touchEnd', []); return
    touch('touchStart', [(1, *last), (2, *pts2[0])])
    for q in pts2[1:]:
        touch('touchMove', [(1, *last), (2, *q)]); pg.wait_for_timeout(10)
    touch('touchEnd', [(2, *pts2[-1])]); pg.wait_for_timeout(40)
    st2 = pg.evaluate("() => kitphonic.lesson.run?.debugState?.()")
    if not st2 or st2.get('stroke') != 1 or st2.get('k', 1) > 2:
        fails.append(f'{name} trace: second finger started the next stroke {st2}')
    if pg.evaluate("() => kitphonic.lesson.run?.debugOwner?.()") != owner:
        fails.append(f'{name} trace: second finger cleared the owner')
    touch('touchEnd', [(1, *last)]); pg.wait_for_timeout(40)
    if pg.evaluate("() => kitphonic.lesson.run?.debugOwner?.()") is not None:
        fails.append(f'{name} trace: owner stuck after the finger lifted')
    pts2 = pg.evaluate("() => kitphonic.lesson.run?.debugPoints?.() ?? []")
    if len(pts2) < 2: fails.append(f'{name} trace: stroke not resumable after lift'); return
    touch('touchStart', [(1, *pts2[0])])
    for q in pts2[1:]:
        touch('touchMove', [(1, *q)]); pg.wait_for_timeout(12)
    touch('touchEnd', []); pg.wait_for_timeout(80)
    done = pg.evaluate("() => { const s = kitphonic.lesson.run?.debugState?.(); return s && (s.done || s.letterDone); }")
    if not done: fails.append(f'{name} trace: owning finger could not finish the next stroke after lifting')

def run_profile(p, base, name):
    b, pg, touch = launch(p, name)
    fails = []
    try:
        run_sentence(pg, touch, fails, name, base)
        run_word_keys(pg, fails, name, base)
        run_family(pg, touch, fails, name, base)
        run_trace_owner(pg, touch, fails, name, base)
    finally:
        b.close()
    return fails

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:8099/')
    ap.add_argument('--profile', nargs='*', default=list(PROFILES))
    a = ap.parse_args()
    base = a.base if a.base.endswith('/') else a.base + '/'
    bad = 0
    with sync_playwright() as p:
        for name in a.profile:
            if name not in PROFILES: print(f'unknown profile {name}'); bad += 1; continue
            fails = run_profile(p, base, name)
            print(f"{name}: {'PASS' if not fails else 'FAIL ' + json.dumps(fails)}")
            bad += bool(fails)
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
