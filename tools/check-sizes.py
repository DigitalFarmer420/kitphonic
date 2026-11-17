#!/usr/bin/env python3
"""Kitphonic touch-target / layout check in headless Chrome (usability pass).

Fails (exit 1) if, at any required viewport, any visible tap target is < 64 CSS px on its short side, the slider knob
is < 80 px, anything interactive is cut off the screen, key elements overlap, the stage leaves an empty band, or
the slider is not in the bottom (thumb) zone in portrait. Saves a screenshot per scene.

  python3 tools/check-sizes.py [--base http://localhost:8099/] [--out screenshots/sizes] [--viewports 360x780,780x360]
Viewports run in parallel, one browser each (KITPHONIC_SIZES_WORKERS overrides the pool size).
Each scene opens a new browser context. Requires: pip install playwright && playwright install chromium; the app served (npm start).
"""
import argparse, json, os, sys
from concurrent.futures import ThreadPoolExecutor
from playwright.sync_api import sync_playwright

# 320x568 and 568x320 are the small phone where a scaled stage drops buttons to 58px and the knob to 72px.
REQUIRED = ['320x568', '568x320', '360x640', '360x780', '780x360', '820x1180']
EXTRA = ['390x844', '844x390', '1180x820']
# u is capped at 2. 1280x800 sits flush on the tray; the three larger windows double the 540-tall board onto it.
LARGE = ['1280x800', '1920x1080', '2560x1440', '3840x2160']
MIN, KNOB = 64, 80
# make n words in the family screen (tap a tile, tap the slot), waiting for each word to finish
MAKE = "(async n => { const k = kitphonic.familyScreen, idle = () => new Promise(r => { const t = setInterval(() => (!k.run || !k.run.busy) && (clearInterval(t), r()), 50); }); for (let i = 0; i < n; i++) { await idle(); const t = document.querySelector('#fm-tray .ftile:not(.made)'); t.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); dispatchEvent(new PointerEvent('pointerup')); document.getElementById('fm-slot').click(); await new Promise(r => setTimeout(r, 150)); } })(%d)"
SCENES = [  # name, query, js to run after load
    ('hello', '', None),
    ('word-map', 'skipHello=1&level=2&word=map&seed=1', None),
    ('word-stop', 'skipHello=1&level=4&word=stop&seed=1', None),
    ('check', 'skipHello=1&level=2&word=mat&seed=1', "kitphonic.screen.debugShow('check')"),
    ('cards', 'skipHello=1&level=1&word=at&seed=1', "kitphonic.screen.debugShow('check')"),
    ('map', 'skipHello=1&progress=5&seed=1', None),
    ('map-start', 'skipHello=1&progress=0&seed=1', None),
    ('map-end', 'skipHello=1&progress=56&seed=1', None),
    ('map-L6', 'skipHello=1&progress=47&seed=1', None),
    ('map-s', 'skipHello=1&progress=1&seed=1', None),
    ('map-th', 'skipHello=1&progress=49&seed=1', None),
    ('word-L5', 'skipHello=1&level=5&word=sand&seed=1', "new Promise(r => setTimeout(r, 800))"),
    ('word-S1', 'skipHello=1&level=2&word=mat&support=1&seed=1', "new Promise(r => setTimeout(r, 900))"),  # v2 V2 read it: check at once + help
    ('word-S1-cards', 'skipHello=1&level=2&word=sat&support=1&seed=1', "new Promise(r => setTimeout(r, 900))"),  # S1 word cards
    ('word-S2-rime', 'skipHello=1&level=2&word=man&support=2&seed=1', "new Promise(r => setTimeout(r, 900))"),  # L2 onset + rime bar
    ('word-S2', 'skipHello=1&level=2&word=mat&support=2&seed=1', "new Promise(r => setTimeout(r, 900))"),  # silent dots
    ('hunt-digraph', 'skipHello=1&activity=hunt&pool=x,y,zz,qu,sh,ck&seed=1', None),
    ('levelup', 'skipHello=1&progress=5&levelup=1&seed=1', "new Promise(r => setTimeout(r, 1800))"),
    ('practice-end', 'skipHello=1&progress=4&practiceEnd=1&seed=1', None),  # rc8: more practice (continue + break), not the level-up
    ('practice-break', 'skipHello=1&progress=4&practiceEnd=break&seed=1', None),  # rc8: take a break, all-done line, home only
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
    ('sentence-S1', 'skipHello=1&activity=sentence&sentence=map-mat&support=1&seed=1', "new Promise(r => setTimeout(r, 3500)).then(() => document.querySelector('#sn-strip .wd').click()).then(() => new Promise(r => setTimeout(r, 1500)))"),  # known issue 7: S1 taps on
    ('story', 'skipHello=1&activity=story&story=king&seed=1', "new Promise(r => setTimeout(r, 1800))"),
    ('story-ask', 'skipHello=1&activity=story&story=king&seed=1', "new Promise(r => setTimeout(r, 1500)).then(() => { const r = kitphonic.sentenceScreen.run; r.page = r.story.pages.length - 1; kitphonic.sentenceScreen.debugAsk(); }).then(() => new Promise(r => setTimeout(r, 600)))"),
    ('sentence-pick', 'skipHello=1&activity=sentence&sentence=map-mat&seed=1', "new Promise(r => setTimeout(r, 1500)).then(() => kitphonic.sentenceScreen.debugAsk()).then(() => new Promise(r => setTimeout(r, 600)))"),
    ('family', 'skipHello=1&activity=family&rime=ap&seed=1', "new Promise(r => setTimeout(r, 2500))"),
    ('family-made', 'skipHello=1&activity=family&rime=ap&seed=1', "new Promise(r => setTimeout(r, 2500)).then(() => { document.querySelector('#fm-tray .ftile').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); dispatchEvent(new PointerEvent('pointerup')); document.getElementById('fm-slot').click(); }).then(() => new Promise(r => setTimeout(r, 2600)))"),
    ('family-made3', 'skipHello=1&activity=family&rime=at&familyMax=7&seed=1', MAKE % 3 + ".then(() => new Promise(r => { const t = setInterval(() => !kitphonic.familyScreen.run.busy && (clearInterval(t), r()), 50); }))"),  # several made words: chips vs tray collision
    ('family-5', 'skipHello=1&activity=family&rime=at&familyMax=5&seed=1', "new Promise(r => setTimeout(r, 2500))"),  # Oct 30: a secure family grows to 5 -> 3 + 2 centred
    ('family-7', 'skipHello=1&activity=family&rime=at&familyMax=7&seed=1', "new Promise(r => setTimeout(r, 2500))"),  # Uiux rc1: 7 choices -> balanced 4 + 3
    ('family-done', 'skipHello=1&activity=family&rime=at&seed=1', MAKE % 4 + ".then(() => new Promise(r => { const t = setInterval(() => document.querySelector('.fchip.star') && (clearInterval(t), r()), 50); }))"),
    ('check-plural', 'skipHello=1&level=7&word=cats&seed=1', "kitphonic.screen.debugShow('check')"),  # known issue 6: two-of pictures, singular distractor
    ('reveal-plural', 'skipHello=1&level=7&word=pigs&seed=1', "kitphonic.screen.debugShow('revealed')"),
    ('check-sad', 'skipHello=1&level=3&word=sad&seed=1', "kitphonic.screen.debugShow('check')"),
    ('digraph', 'skipHello=1&level=6&word=ship&seed=1', "new Promise(r => setTimeout(r, 800))"),
    ('intro-i', 'skipHello=1&activity=intro&gpc=i&seed=1', "new Promise(r => setTimeout(r, 900))"),  # v2 V10: decodable word, no picture
    ('intro-p', 'skipHello=1&activity=intro&gpc=p&seed=3', "new Promise(r => setTimeout(r, 900))"),
    ('intro-m', 'skipHello=1&activity=intro&gpc=m&seed=1', "new Promise(r => setTimeout(r, 900))"),
    ('fuse', 'skipHello=1&activity=intro&gpc=sh&seed=1', "new Promise(r => setTimeout(r, 2200))"),
    ('parent', 'skipHello=1&progress=5&parent=1', "new Promise(r => setTimeout(r, 800))"),
    ('parent-end', 'skipHello=1&progress=56&parent=1', "new Promise(r => setTimeout(r, 800))"),
    ('letters-float', 'skipHello=1&activity=float&seed=1', None),
    ('letters-float-4s', 'skipHello=1&activity=float&seed=2', "new Promise(r => setTimeout(r, 4000))"),
]
MEASURE = r"""() => {
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' && !e.closest('[hidden]') && e.offsetParent !== null; }; // pointer-events:none = not a tap target
  const scr = [...document.querySelectorAll('.screen')].find(s => !s.hidden);
  const overlay = scr.querySelector('#check:not([hidden])');
  const root = overlay || scr;
  const box = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const name = e => e.id ? '#' + e.id : (e.className.baseVal ?? e.className).split(' ')[0] + (e.getAttribute('aria-label') ? `[${e.getAttribute('aria-label')}]` : '');
  const targets = [...root.querySelectorAll('button, #handle, #sn-handle, .stop, .ear, .marker .dot, .marker .bar, .ltr .tile, .ltr .ldot, .choice')]
    .filter(vis).filter(e => !(e.classList.contains('marker'))) // a marker button's visible shape is its .dot/.bar
    .map(e => ({ name: name(e), knob: e.id === 'handle' || e.id === 'sn-handle', play: e.id === 'play', scroll: !!e.closest('#pa-body'), adult: !!e.closest('#parent'), ...box(e) }));
  const key = overlay ? [] : [...scr.querySelectorAll('.starbig, .wcard2, #sn-card, #sn-strip .wd, .top .path .peb, #fm-card, #fm-slot, #fm-rime, .fchip, .ftile, #sn-tiles .tile, #sn-handle, #sn-read, #sn-choices .pc, .icard, .ipic, .tcard, .ibar > *, .ear, #l-tray, .mkit, .stop, .mlabel, #go, .lv-chip, #lv-next, .lv-badge, .starchip, #card, .tile:not(.ltr .tile), .marker .dot, .marker .bar, #handle, .mascot .bubble, .top .btn, #next, .next, .ltr .tile, .ltr .ldot, #done-kit, #done-bubble, #done-stop, #stickers, #done-again, #done-home')]
    .filter(vis).map(e => ({ name: name(e), ...box(e) }));
  const ltr = [...root.querySelectorAll('.ltr .tile, .choice, #st-cards .wcard2')].filter(vis).map(e => Math.round(e.getBoundingClientRect().top));
  const st = document.getElementById('stage').getBoundingClientRect();
  const h = document.getElementById('handle');
  // Uiux r7: a stop's cue picture never covers another stop, a label, Kit or a star
  const R = e => e.getBoundingClientRect(), hit = (a, b) => a.left + 2 < b.right && b.left + 2 < a.right && a.top + 2 < b.bottom && b.top + 2 < a.bottom;
  const cueHits = [...scr.querySelectorAll('.stop .cue')].filter(vis).flatMap(c => [...scr.querySelectorAll('.stop, .mlabel, .mkit, .stop .st')]
    .filter(o => vis(o) && o !== c.parentElement && !o.contains(c) && hit(R(c), R(o))).map(o => `cue ${c.textContent} / ${name(o)}`));
  // Uiux r8: no visible button is blank (it shows text, an icon or a picture)
  const empty = [...root.querySelectorAll('button, .marker .bar, .marker .dot')].filter(vis).filter(e => !e.textContent.trim() && !e.matches('[data-dropslot]') && !e.querySelector('svg, img, .emoji')).map(name);
  // Uiux rc1: grown-ups sound grid tiles never shrink below 32 px (the card scrolls instead)
  const ptiles = [...document.querySelectorAll('#parent:not([hidden]) .ptile')].map(e => ({ name: 'ptile[' + e.textContent.trim() + ']', ...box(e) }));
  const tray = document.getElementById('l-tray');
  const huntTray = [];
  if (tray && vis(tray) && scr.classList.contains('hunt')) {
    const tr = tray.getBoundingClientRect();
    for (const tile of scr.querySelectorAll('.ltr .tile')) {
      if (!vis(tile)) continue;
      const r = tile.getBoundingClientRect();
      const overlap = r.left + 2 < tr.right && tr.left + 2 < r.right && r.top + 2 < tr.bottom && tr.top + 2 < r.bottom;
      if (overlap) huntTray.push(`tile[${tile.getAttribute('aria-label') || tile.textContent.trim()}] / #l-tray`);
    }
  }
  // A hidden screen that still paints (a display rule beating [hidden]) steals the tap. The centre of every control must hit that control or something inside it.
  const covered = [];
  const clipped = (e, x, y) => {
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true;
    for (let n = e.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflow)) continue;
      const b = n.getBoundingClientRect();
      if (x < b.left || x > b.right || y < b.top || y > b.bottom) return true;
    }
    return false;
  };
  for (const e of [...root.querySelectorAll('button, #handle, #sn-handle, .stop, .ear, .marker .dot, .marker .bar, .ltr .tile, .ltr .ldot, .choice')].filter(vis).filter(el => !el.classList.contains('marker'))) {
    const r = e.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (clipped(e, x, y)) continue; // scrolled out of #pa-body is not a tap the child can miss
    const hit = document.elementFromPoint(x, y);
    if (!hit || (hit !== e && !e.contains(hit))) covered.push(name(e) + ' -> ' + (hit ? (hit.id ? '#' + hit.id : (hit.className.baseVal ?? hit.className).toString().split(' ')[0]) : 'nothing'));
  }
  const card = document.getElementById('card');
  const picEl = card && !card.hidden && card.classList.contains('revealed') ? card.querySelector('.pic') : null;
  const edge = e => { const b = e.getBoundingClientRect(); return { top: b.top, right: b.right, bottom: b.bottom, left: b.left }; };
  const revealPic = picEl && vis(picEl) ? { card: edge(card), pic: edge(picEl), art: edge(picEl.querySelector('svg, .emoji') || picEl) } : null;
  const stageEl = document.getElementById('stage');
  return { ptiles, empty, cueHits, covered, huntTray, revealPic, screen: scr.id, ltr, targets, key, stage: { w: st.width, h: st.height, x: st.left, y: st.top }, handle: vis(h) ? box(h) : null, vw: innerWidth, vh: innerHeight,
    turn: !!stageEl?.classList.contains('turn'), hmin: Number(stageEl?.dataset.hmin || 0),
    turnText: (document.getElementById('turn')?.innerText || '').replace(/\s+/g, ' ').trim() };
}"""

ADULT = 48  # grown-ups controls stay 48 CSS px on every window (the child floor is 64)
CLASSIC = {'360x780', '780x360', '820x1180', '390x844', '844x390', '1180x820'}

def overlaps(a, b, pad=2):
    return a['x'] + pad < b['x'] + b['w'] and b['x'] + pad < a['x'] + a['w'] and a['y'] + pad < b['y'] + b['h'] and b['y'] + pad < a['y'] + a['h']

def boxInside(inner, outer, pad=1):
    """The picture is inside the card only when all four edges of the real border box are."""
    if not inner or not outer: return True
    return (inner['top'] >= outer['top'] - pad and inner['bottom'] <= outer['bottom'] + pad
            and inner['left'] >= outer['left'] - pad and inner['right'] <= outer['right'] + pad)

def check(m, vp, scene, insets=(0, 0, 0, 0)):
    errs = []
    top, right, bottom, left = insets
    safe_w = m['vw'] - left - right
    safe_h = m['vh'] - top - bottom
    hmin = float(m.get('hmin') or 0)
    turned = bool(m.get('turn'))
    if turned and m.get('turnText'): errs.append('turn card has text')
    if turned and safe_h + 0.5 >= hmin: errs.append(f"turn card but this screen fits ({safe_h:.0f} >= {hmin:.0f})")
    if not turned and hmin and safe_h + 0.5 < hmin: errs.append(f"turn card missing ({safe_h:.0f} < {hmin:.0f})")
    if turned: return errs
    for t in m['targets']:
        short = min(t['w'], t['h']); need = KNOB if t['knob'] else (ADULT if t.get('adult') else MIN)
        if short < need - 0.5: errs.append(f"{t['name']} {t['w']:.0f}x{t['h']:.0f} < {need}")
        if not t.get('scroll') and (t['x'] < left - 1 or t['y'] < top - 1 or t['x'] + t['w'] > m['vw'] - right + 1 or t['y'] + t['h'] > m['vh'] - bottom + 1):
            errs.append(f"{t['name']} cut off at ({t['x']:.0f},{t['y']:.0f})")
        if t['play'] and vp in CLASSIC and not (110 <= short <= 175): errs.append(f"#play {short:.0f}px (want ~120)")
    errs += [f'overlap {h}' for h in m.get('cueHits', [])]
    errs += [f'covered {c}' for c in m.get('covered', [])]
    errs += [f'hunt overlap {c}' for c in m.get('huntTray', [])]
    pic = m.get('revealPic')
    if pic and not boxInside(pic.get('art'), pic.get('card')): errs.append('reveal picture outside #card')
    if pic and not boxInside(pic.get('pic'), pic.get('card')): errs.append('reveal picture box outside #card')
    errs += [f'empty button {n}' for n in m.get('empty', [])]
    errs += [f"{t['name']} {t['w']:.0f}x{t['h']:.0f} < 48" for t in m.get('ptiles', []) if min(t['w'], t['h']) < 47.5]
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
    # A capped desktop board (u = 2, the 1080p composition) is centered in a larger window on purpose.
    capped = m['vw'] > 2000 or m['vh'] > 1400
    if not capped and m['stage']['w'] < safe_w * .97 and m['stage']['h'] < safe_h * .97: errs.append('stage does not fill the safe rect')
    if not capped and m['stage']['h'] < safe_h * .97 and safe_h > safe_w: errs.append(f"empty band: stage {m['stage']['h']:.0f} of {safe_h:.0f}px tall")
    if m['handle'] and safe_h > safe_w:
        bottom_gap = (m['vh'] - bottom) - (m['handle']['y'] + m['handle']['h'])
        if bottom_gap > safe_h * .25: errs.append(f"slider not in thumb zone ({bottom_gap:.0f}px above the bottom)")
    return errs

GOTO_TIMEOUT_MS = 15000

def launch_browser(p):
    exe = os.environ.get('CHROME') or next((c for c in ['/usr/bin/google-chrome', '/usr/bin/chromium'] if os.path.exists(c)), None)
    return p.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe else p.chromium.launch()

def run_viewport(vp, base, out, only):
    """One browser for this viewport. Each scene gets its own context (clean storage)."""
    w, h = map(int, vp.split('x'))
    rows = []
    with sync_playwright() as p:
        b = launch_browser(p)
        try:
            for scene, q, js in SCENES:
                if only and scene not in only: continue
                ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=True, service_workers='block')
                try:
                    pg = ctx.new_page()
                    pg.goto(base + ('?' + q if q else ''), wait_until='load', timeout=GOTO_TIMEOUT_MS)
                    pg.wait_for_timeout(500)
                    if js: pg.evaluate(js); pg.wait_for_timeout(700)
                    m = pg.evaluate(MEASURE); errs = check(m, vp, scene)
                    pg.screenshot(path=f"{out}/{scene}-{vp}.png")
                    smallest = min((min(t['w'], t['h']) for t in m['targets'] if not t['knob']), default=0)
                    knob = next((min(t['w'], t['h']) for t in m['targets'] if t['knob']), None)
                    rows.append((vp, scene, len(m['targets']), smallest, knob, errs))
                finally:
                    ctx.close()
        finally:
            b.close()
    bad = sum(bool(errs) for *_, errs in rows)
    print(f'{vp} finished {len(rows) - bad}/{len(rows)}', flush=True)
    return rows

def extra_passes(base, out):
    """Rotate mid-activity, and the 24px top + 48px bottom system bars. Not a viewport of SCENES."""
    rows = []
    with sync_playwright() as p:
        b = launch_browser(p)
        try:
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, service_workers='block')
            pg = ctx.new_page()
            pg.goto(base + '?skipHello=1&activity=find&seed=1', wait_until='load', timeout=GOTO_TIMEOUT_MS); pg.wait_for_timeout(700)
            before = pg.evaluate("""() => [...document.querySelectorAll('#l-arena .ltr')].map(e => {
              const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })""")
            pg.set_viewport_size({'width': 844, 'height': 390}); pg.wait_for_timeout(500)
            m = pg.evaluate(MEASURE); errs = check(m, '844x390', 'letters-find')
            after = pg.evaluate("""() => [...document.querySelectorAll('#l-arena .ltr .tile')].map(e => {
              const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(Math.min(r.width, r.height))]; })""")
            afterCentres = pg.evaluate("""() => [...document.querySelectorAll('#l-arena .ltr')].map(e => {
              const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })""")
            if not before or not afterCentres or before == afterCentres:
                errs.append('tiles kept stale coordinates after rotate')
            if any(t[2] < 63 for t in after):
                errs.append('rotated tile under 64px')
            off = pg.evaluate("""() => [...document.querySelectorAll('#l-arena .ltr .tile')].filter(e => {
              const r = e.getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect();
              return r.left < s.left - 2 || r.top < s.top - 2 || r.right > s.right + 2 || r.bottom > s.bottom + 2; }).length""")
            if off: errs.append(f'{off} tiles outside the stage after rotate')
            pg.screenshot(path=f"{out}/rotate-letters-844x390.png"); ctx.close()
            rows.append(('844x390', 'rotate-find', len(m['targets']), min((min(t['w'], t['h']) for t in m['targets']), default=0), None, errs))
            for vp, w, h, top, bottom in [('360x640', 360, 640, 24, 48), ('780x360', 780, 360, 24, 48)]:
                for scene, q in [('hello', ''), ('word-map', 'skipHello=1&level=2&word=map&seed=1'), ('family-7', 'skipHello=1&activity=family&rime=at&familyMax=7&seed=1')]:
                    ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=True, service_workers='block')
                    pg = ctx.new_page()
                    pg.goto(base + ('?' + q if q else ''), wait_until='load', timeout=GOTO_TIMEOUT_MS); pg.wait_for_timeout(500)
                    pg.evaluate("""([t, b]) => { const s = document.documentElement.style;
                      s.setProperty('--safe-area-inset-top', t + 'px'); s.setProperty('--safe-area-inset-right', '0px');
                      s.setProperty('--safe-area-inset-bottom', b + 'px'); s.setProperty('--safe-area-inset-left', '0px'); }""", [top, bottom])
                    pg.wait_for_timeout(200)
                    m = pg.evaluate(MEASURE); errs = [e for e in check(m, vp + '-inset', scene) if 'empty band' not in e and 'does not fill' not in e and 'thumb zone' not in e]
                    safe_bottom = h - bottom
                    for t in m['targets']:
                        if t['y'] < top - 2 or t['y'] + t['h'] > safe_bottom + 2:
                            errs.append(f"{t['name']} outside safe bars")
                    pg.screenshot(path=f"{out}/inset-{scene}-{vp}.png"); ctx.close()
                    rows.append((vp + '+bars', scene, len(m['targets']), min((min(t['w'], t['h']) for t in m['targets'] if not t['knob']), default=0),
                                 next((min(t['w'], t['h']) for t in m['targets'] if t['knob']), None), errs))
            # B1/B2: the two smallest boards with 24/48 insets. The 64px floor must stay tappable
            # inside the board, clear of the bars and the progress dots.
            inset_cases = [
                ('320x568+bars', 320, 568, 'family-7', 'skipHello=1&activity=family&rime=at&familyMax=7&seed=1', None),
                ('568x320+bars', 568, 320, 'word-map', 'skipHello=1&level=2&word=map&seed=1', None),
                ('568x320+bars', 568, 320, 'reveal', 'skipHello=1&level=2&word=map&seed=1', "kitphonic.screen.debugShow('revealed')"),
            ]
            for vp, w, h, scene, q, js in inset_cases:
                ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=True, service_workers='block')
                pg = ctx.new_page()
                pg.goto(base + '?' + q, wait_until='load', timeout=GOTO_TIMEOUT_MS); pg.wait_for_timeout(400)
                pg.evaluate("""([t, b]) => { const s = document.documentElement.style;
                  s.setProperty('--safe-area-inset-top', t + 'px'); s.setProperty('--safe-area-inset-right', '0px');
                  s.setProperty('--safe-area-inset-bottom', b + 'px'); s.setProperty('--safe-area-inset-left', '0px'); }""", [24, 48])
                pg.wait_for_timeout(300)
                if js: pg.evaluate(js); pg.wait_for_timeout(400)
                else: pg.wait_for_timeout(900)
                if pg.evaluate("() => document.getElementById('stage').classList.contains('turn')"):
                    pg.screenshot(path=f"{out}/inset-{scene}-{vp}.png"); ctx.close()
                    rows.append((vp, scene, 0, 0, None, [], True)); continue
                detail = pg.evaluate(r"""() => {
                  const stage = document.getElementById('stage').getBoundingClientRect();
                  const sel = document.getElementById('family') && !document.getElementById('family').hidden ? '.ftile' : '#tiles .tile';
                  const buttons = [...document.querySelectorAll('.top button')];
                  const dots = [...document.querySelectorAll('.path .peb')];
                  const hitBox = (a, b) => a.left + 1 < b.right && b.left + 1 < a.right && a.top + 1 < b.bottom && b.top + 1 < a.bottom;
                  const rows = [];
                  for (const el of document.querySelectorAll(sel)) {
                    const r = el.getBoundingClientRect();
                    const x = r.left + r.width / 2, y = r.top + r.height / 2;
                    const hit = document.elementFromPoint(x, y);
                    const own = hit && (hit === el || el.contains(hit));
                    const outside = r.top < stage.top - 1 || r.bottom > stage.bottom + 1 || r.left < stage.left - 1 || r.right > stage.right + 1;
                    const onDot = dots.some(d => hitBox(r, d.getBoundingClientRect()));
                    const onBar = buttons.some(b => hitBox(r, b.getBoundingClientRect()));
                    rows.push({ name: el.getAttribute('aria-label') || el.textContent.trim(), w: r.width, h: r.height, outside, own, onDot, onBar });
                  }
                  return rows;
                }""")
                errs = []
                for t in detail:
                    if min(t['w'], t['h']) < 63.5: errs.append(f"{t['name']} {t['w']:.0f}x{t['h']:.0f} < 64")
                    if t['outside']: errs.append(f"{t['name']} outside the board")
                    if not t['own']: errs.append(f"{t['name']} centre missed")
                    if t['onDot']: errs.append(f"{t['name']} covers a progress dot")
                    if t['onBar']: errs.append(f"{t['name']} under the top bar")
                if not detail: errs.append('no tiles')
                pg.screenshot(path=f"{out}/inset-{scene}-{vp}.png")
                ctx.close()
                rows.append((vp, scene, len(detail), min((min(t['w'], t['h']) for t in detail), default=0), None, errs, False))
        finally:
            b.close()
    return rows

PHONE_P = [(320, 568), (360, 640), (375, 667), (390, 844), (412, 915), (430, 932)]
PHONE_L = [(h, w) for w, h in PHONE_P]
IPAD = [(768, 1024), (820, 1180), (1024, 768), (1180, 820)]
ANDROID = [(800, 1280), (1280, 800)]
CHROMIUM_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Mobile Safari/537.36'
WEBKIT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
SHOTS = {
    ('webkit', '320x568', 'W', 'hello'), ('webkit', '320x568', 'W', 'word-map'),
    ('chromium', '568x320', 'W', 'hello'), ('chromium', '568x320', 'W', 'word-map'),
    ('chromium', '568x320', 'Wi', 'hello'), ('chromium', '568x320', 'Wi', 'word-map'),
    ('chromium', '1024x768', 'P', 'hello'), ('chromium', '1024x768', 'P', 'map'),
    ('chromium', '568x320', 'S', 'parent'), ('webkit', '568x320', 'S', 'parent'),
    ('chromium', '568x320', 'Wi', 'parent'), ('webkit', '568x320', 'Wi', 'parent'),
    ('chromium', '768x1024', 'S', 'parent'), ('webkit', '768x1024', 'S', 'parent'),
    ('chromium', '320x568', 'W', 'parent'), ('webkit', '320x568', 'W', 'parent'),
}

# Grown-ups fold. At scroll 0, a control that meets the scrollport must not cross that
# edge or the safe bottom. AC-G1's speed row is read from the same pass.
GROWNUP_AUDIT = r"""() => {
  const EPS = 0.5;
  const parent = document.getElementById('parent');
  if (!parent || parent.hidden) return { g2: ['parent hidden'], g3: ['parent hidden'], g1: null };
  const cs = getComputedStyle(parent);
  const pad = side => parseFloat(cs['padding' + side]) || 0;
  const safeBottom = innerHeight - pad('Bottom'), safeRight = innerWidth - pad('Right');
  const straddles = (r, edge) => r.top < edge - EPS && r.bottom > edge + EPS;
  const overflows = el => /(auto|scroll)/.test(getComputedStyle(el).overflowY);
  const body = document.getElementById('pa-body');
  const cols = [...body.querySelectorAll(':scope > .pcol')].filter(overflows);
  const ports = cols.length ? cols : [body];
  const portOf = el => { for (let n = el.parentElement; n; n = n.parentElement) if (overflows(n)) return n; return null; };
  const name = el => el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 22);
  ports.forEach(p => { p.scrollTop = 0; });
  const g2 = [];
  for (const el of parent.querySelectorAll('button')) {
    if (el.id === 'pa-close') continue;
    const r = el.getBoundingClientRect();
    const port = portOf(el);
    if (!port) { g2.push(name(el) + ' has no scrollport'); continue; }
    const pr = port.getBoundingClientRect();
    if (r.bottom <= pr.top + EPS || r.top >= pr.bottom - EPS) continue;
    if (straddles(r, pr.bottom) || straddles(r, safeBottom)) g2.push(name(el) + ' straddles ' + r.top.toFixed(0) + '-' + r.bottom.toFixed(0));
  }
  for (const port of ports) {
    const fade = port.querySelector(':scope > .pa-fade');
    const fh = fade ? fade.getBoundingClientRect().height : 0;
    const scrolls = port.scrollHeight > port.clientHeight + 1;
    if (scrolls && Math.abs(fh - 16) > 0.6) g2.push('fade ' + fh.toFixed(1) + 'px');
    if (!scrolls && fade) g2.push('fade while the column does not scroll');
  }
  const speedBtn = parent.querySelector('button[data-k="audioSpeed"]');
  let g1 = null;
  if (speedBtn) {
    const row = speedBtn.closest('.prow');
    const port = portOf(speedBtn);
    const pr = port.getBoundingClientRect();
    const label = row.querySelector('.plabel').getBoundingClientRect();
    const h2 = parent.querySelector('.pa-settings > h2');
    const header = parent.querySelector('.pa-top').getBoundingClientRect();
    g1 = {
      scroll: port.scrollTop, portTop: pr.top, portBottom: pr.bottom, safeBottom,
      label: { top: label.top, bottom: label.bottom },
      buttons: [...row.querySelectorAll('button')].map(el => {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { name: name(el), top: r.top, bottom: r.bottom, hit: !!(hit && (hit === el || el.contains(hit))) };
      }),
      fit: parent.classList.contains('pa-fit'),
      aria: parent.querySelector('.pa-settings')?.getAttribute('aria-label') || '',
      h2: h2 ? getComputedStyle(h2).position : '',
      header: header.height,
    };
  }
  const g3 = [];
  const place = el => {
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    const fully = r.top >= pad('Top') - 1 && r.bottom <= safeBottom + 1 && r.left >= pad('Left') - 1 && r.right <= safeRight + 1;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const own = hit && (hit === el || el.contains(hit));
    if (!fully || !own || r.width < 44 || r.height < 44) g3.push(name(el) + ' ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0) + ' y ' + r.top.toFixed(0) + '-' + r.bottom.toFixed(0) + (own ? '' : ' missed'));
  };
  for (const el of parent.querySelectorAll('button')) place(el);
  for (const port of ports) if (port.clientHeight < 80) g3.push('scrollport ' + Math.round(port.clientHeight) + 'px < 80');
  const skip = document.getElementById('pa-skip');
  if (skip) { skip.click(); for (const id of ['pa-skip-no', 'pa-skip-yes']) { const el = document.getElementById(id); if (!el) g3.push('missing ' + id); else place(el); } }
  const reset = document.getElementById('pa-reset');
  if (!reset) g3.push('missing reset');
  else { reset.click(); for (const id of ['pa-no', 'pa-yes']) { const el = document.getElementById(id); if (!el) g3.push('missing ' + id); else place(el); } }
  const close = document.getElementById('pa-close');
  const cr = close.getBoundingClientRect();
  const closeOk = cr.width >= 44 && cr.height >= 44 && cr.top >= pad('Top') - 1 && cr.bottom <= safeBottom + 1 && cr.left >= pad('Left') - 1 && cr.right <= safeRight + 1;
  if (!closeOk) g3.push('close ' + cr.width.toFixed(0) + 'x' + cr.height.toFixed(0) + ' at ' + cr.top.toFixed(0) + ',' + cr.left.toFixed(0));
  window.kitphonic.parent.open();
  return { g2, g3, g1 };
}"""

def g1_errors(g, expect_safe=None):
    """AC-G1: speed label and Slower/Normal/Faster sit fully in the settings scrollport."""
    if not g or not g.get('buttons'): return ['speed controls missing']
    errs = []
    limit = min(g['portBottom'], g['safeBottom'])
    lab = g['label']
    if lab['top'] < g['portTop'] - 0.5 or lab['bottom'] > g['portBottom'] + 0.5:
        errs.append(f"speed label outside scrollport ({lab['top']:.0f}-{lab['bottom']:.0f})")
    for b in g['buttons']:
        if b['top'] < g['portTop'] - 0.5 or b['bottom'] > limit + 0.5:
            errs.append(f"{b['name']} {b['top']:.0f}-{b['bottom']:.0f} past {limit:.0f}")
        if not b['hit']: errs.append(f"{b['name']} centre missed")
    if g.get('scroll'): errs.append('speed column not at default scroll')
    if expect_safe is not None and abs(g['safeBottom'] - expect_safe) > 1.5:
        errs.append(f"safe bottom {g['safeBottom']:.0f}")
    if not g.get('fit'): errs.append('header did not compact')
    if g.get('aria') != 'Settings': errs.append('settings card missing aria-label')
    if g.get('h2') != 'absolute': errs.append('Settings heading still takes space')
    if g.get('header', 99) > 58: errs.append(f"header {g['header']:.0f}px")
    return errs

def matrix_jobs():
    jobs = []
    for engine, ua in (('chromium', CHROMIUM_UA), ('webkit', WEBKIT_UA)):
        for w, h in PHONE_P:
            ins, bar = (47, 0, 34, 0), (100 if engine == 'webkit' else 56)
            jobs.append((engine, ua, w, h, [('P', w, h, (0, 0, 0, 0)), ('S', w, h, ins), ('W', w, h - bar, ins)]))
        for w, h in PHONE_L:
            ins, ii = (24, 0, 48, 0), (0, 48, 24, 48)
            jobs.append((engine, ua, w, h, [('P', w, h, (0, 0, 0, 0)), ('S', w, h, ins), ('W', w, h - 56, ins), ('Si', w, h, ii), ('Wi', w, h - 56, ii)]))
        for w, h in IPAD:
            ins = (24, 0, 20, 0)
            jobs.append((engine, ua, w, h, [('P', w, h, (0, 0, 0, 0)), ('S', w, h, ins), ('W', w, h - 74, ins)]))
        for w, h in ANDROID:
            ins = (24, 0, 48, 0)
            jobs.append((engine, ua, w, h, [('P', w, h, (0, 0, 0, 0)), ('S', w, h, ins), ('W', w, h - 56, ins)]))
    return jobs

def apply_insets(pg, insets):
    pg.evaluate("""([t, r, b, l]) => { const s = document.documentElement.style;
      s.setProperty('--safe-area-inset-top', t + 'px'); s.setProperty('--safe-area-inset-right', r + 'px');
      s.setProperty('--safe-area-inset-bottom', b + 'px'); s.setProperty('--safe-area-inset-left', l + 'px'); }""", list(insets))

def run_matrix_job(job, base, out, only):
    engine, ua, w, h, states = job
    order, grouped = [], {}
    for label, vw, vh, insets in states:
        key = (vw, vh)
        if key not in grouped: order.append(key); grouped[key] = []
        grouped[key].append((label, insets))
    rows, notes, shot_fail = [], [], set()
    name = f'{w}x{h}'
    # Boot taller than the turn-card threshold so a scene script can finish, then measure each state.
    boot_h = max(h, 720)
    with sync_playwright() as p:
        b = launch_browser(p)
        try:
            for scene, q, js in SCENES:
                if only and scene not in only: continue
                ctx = b.new_context(viewport={'width': w, 'height': boot_h}, has_touch=True, service_workers='block', user_agent=ua)
                try:
                    pg = ctx.new_page()
                    pg.set_default_timeout(GOTO_TIMEOUT_MS)
                    pg.goto(base + ('?' + q if q else ''), wait_until='load', timeout=GOTO_TIMEOUT_MS)
                    pg.wait_for_timeout(300)
                    if js:
                        try: pg.evaluate(js)
                        except Exception as exc: rows.append((f'{name} boot {engine}', scene, 0, 0, None, [f'scene script: {exc}'], False)); continue
                        pg.wait_for_timeout(400)
                    for vw, vh in order:
                        pg.set_viewport_size({'width': vw, 'height': vh}); pg.wait_for_timeout(60)
                        for label, insets in grouped[(vw, vh)]:
                            apply_insets(pg, insets); pg.wait_for_timeout(60)
                            m = pg.evaluate(MEASURE)
                            errs = check(m, name, scene, insets)
                            if scene.startswith('parent') and not m.get('turn'):
                                audit = pg.evaluate(GROWNUP_AUDIT)
                                errs.extend(audit['g2']); errs.extend(audit['g3'])
                                if scene == 'parent' and name == '568x320' and label == 'S':
                                    errs.extend(g1_errors(audit.get('g1'), 272))
                                notes.append({'cell': f'{name} {label} {engine}', 'scene': scene, 'g2': audit['g2'], 'g3': audit['g3'], 'g1': audit.get('g1')})
                            d1 = bool(m.get('turn')) and not errs
                            if (engine, name, label, scene) in SHOTS or (errs and scene not in shot_fail):
                                pg.screenshot(path=f'{out}/matrix-{scene}-{name}-{label}-{engine}.png')
                                if errs: shot_fail.add(scene)
                            smallest = 0 if d1 else min((min(t['w'], t['h']) for t in m['targets'] if not t['knob']), default=0)
                            knob = None if d1 else next((min(t['w'], t['h']) for t in m['targets'] if t['knob']), None)
                            rows.append((f'{name} {label} {engine}', scene, len(m['targets']), smallest, knob, errs, d1))
                finally:
                    ctx.close()
        finally:
            b.close()
    bad = sum(bool(errs) for *_, errs, _d1 in rows)
    print(f'{name} {engine} finished {len(rows) - bad}/{len(rows)}', flush=True)
    return rows, notes

def grownup_env_passes(base, out):
    """AC-G1 with env() insets applied before load, plus the single-scroller switch."""
    rows = []
    with sync_playwright() as p:
        b = launch_browser(p)
        try:
            for label, ua in (
                ('chromium', None),
                ('webkit-ua', WEBKIT_UA),
            ):
                opts = dict(viewport={'width': 568, 'height': 320}, has_touch=True, service_workers='block')
                if ua: opts['user_agent'] = ua
                ctx = b.new_context(**opts)
                pg = ctx.new_page()
                client = ctx.new_cdp_session(pg)
                client.send('Emulation.setSafeAreaInsetsOverride', {'insets': {'top': 24, 'right': 0, 'bottom': 48, 'left': 0}})
                pg.goto(base + '?skipHello=1&progress=5&parent=1', wait_until='load', timeout=GOTO_TIMEOUT_MS)
                pg.wait_for_timeout(400)
                env = pg.evaluate("""() => {
                  const probe = document.createElement('div');
                  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
                  document.documentElement.appendChild(probe);
                  const cs = getComputedStyle(probe);
                  const vars = document.documentElement.style.getPropertyValue('--safe-area-inset-top');
                  return { top: cs.paddingTop, bottom: cs.paddingBottom, vars };
                }""")
                audit = pg.evaluate(GROWNUP_AUDIT)
                errs = []
                if env['top'] != '24px' or env['bottom'] != '48px' or env['vars']:
                    errs.append(f"env insets {env['top']}/{env['bottom']} vars {env['vars']!r}")
                errs.extend(g1_errors(audit.get('g1'), 272))
                errs.extend(audit['g2']); errs.extend(audit['g3'])
                g = audit.get('g1') or {}
                btns = g.get('buttons') or []
                if btns:
                    ys = [b['top'] for b in btns] + [b['bottom'] for b in btns]
                    print(f"AC-G1 568x320 S env {label} speed y {min(ys):.0f}-{max(ys):.0f}", flush=True)
                pg.screenshot(path=f'{out}/grownups-568x320-S-env-{label}.png')
                ctx.close()
                rows.append((f'568x320 S env {label}', 'parent', len(btns), 48, None, errs, False))
            ctx = b.new_context(viewport={'width': 568, 'height': 130}, has_touch=True, service_workers='block')
            pg = ctx.new_page()
            pg.goto(base + '?skipHello=1&progress=5&parent=1', wait_until='load', timeout=GOTO_TIMEOUT_MS)
            pg.wait_for_timeout(300)
            stack = pg.evaluate("""() => {
              const parent = document.getElementById('parent');
              const body = document.getElementById('pa-body');
              const cols = [...body.querySelectorAll(':scope > .pcol')];
              const scrolls = el => /(auto|scroll)/.test(getComputedStyle(el).overflowY);
              return {
                stack: parent.classList.contains('pa-stack'),
                body: scrolls(body),
                cols: cols.filter(scrolls).length,
                order: cols.map(c => c.querySelector('.pa-settings') ? 'settings' : 'progress').join(','),
              };
            }""")
            errs = []
            if not stack['stack'] or not stack['body'] or stack['cols'] or stack['order'] != 'progress,settings':
                errs.append(f"single scroller {stack}")
            ctx.close()
            rows.append(('568x130 stack', 'parent', 0, 0, None, errs, False))
        finally:
            b.close()
    return rows

BASELINE_PATH = os.path.join(os.path.dirname(__file__), 'size-baseline.json')

def matrix_key(vp, scene):
    parts = vp.split()
    if len(parts) != 3: return None
    return (scene, parts[0], parts[1], parts[2])

def load_baseline(path):
    if not os.path.exists(path): return set(), set()
    data = json.load(open(path))
    def keys(rows): return {(r['screen'], r['size'], r['state'], r['engine']) for r in rows}
    return keys(data.get('failures', [])), keys(data.get('turn', []))

def dump_keys(keys):
    return [{'screen': s, 'size': z, 'state': st, 'engine': e} for s, z, st, e in sorted(keys)]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8099/'); ap.add_argument('--out', default='screenshots/sizes')
    ap.add_argument('--viewports', default=','.join(REQUIRED + EXTRA + LARGE)); ap.add_argument('--scenes', default='')
    ap.add_argument('--skip-matrix', action='store_true'); ap.add_argument('--write-baseline', action='store_true'); a = ap.parse_args()
    only = set(filter(None, a.scenes.split(',')))
    os.makedirs(a.out, exist_ok=True)
    viewports = [v for v in a.viewports.split(',') if v]
    workers = max(1, int(os.environ.get('KITPHONIC_SIZES_WORKERS') or min(4, len(viewports) or 1)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        grouped = list(pool.map(lambda vp: run_viewport(vp, a.base, a.out, only), viewports))
    rows = [(*row, False) for group in grouped for row in group]
    if not only:
        rows.extend(row if len(row) == 7 else (*row, False) for row in extra_passes(a.base, a.out))
    grown = []
    if not a.skip_matrix:
        jobs = matrix_jobs()
        mw = max(1, int(os.environ.get('KITPHONIC_SIZES_WORKERS') or min(4, len(jobs))))
        with ThreadPoolExecutor(max_workers=mw) as pool:
            grouped = list(pool.map(lambda job: run_matrix_job(job, a.base, a.out, only), jobs))
        for group_rows, notes in grouped:
            rows.extend(group_rows); grown.extend(notes)
    if not only:
        rows.extend(grownup_env_passes(a.base, a.out))
    legacy_bad, failed, turned, seen = [], set(), set(), set()
    for vp, sc, n, sm, kn, errs, d1 in rows:
        key = matrix_key(vp, sc)
        if key is None:
            if errs or d1: legacy_bad.append((vp, sc, errs or ['turn card']))
            continue
        seen.add(key)
        if d1: turned.add(key)
        elif errs: failed.add(key)
    if a.write_baseline and not legacy_bad:
        payload = {'failures': dump_keys(failed), 'turn': dump_keys(turned)}
        with open(BASELINE_PATH, 'w') as fh:
            json.dump(payload, fh, indent=2); fh.write('\n')
        print(f'wrote baseline: {len(failed)} failures, {len(turned)} turn cards')
    elif a.write_baseline:
        print('not writing baseline; legacy failures remain')
    baseline, allowed = load_baseline(BASELINE_PATH)
    fresh = sorted(failed - baseline)
    stale = sorted((baseline & seen) - failed) if not a.write_baseline else []
    bad_turn = sorted(turned - allowed) if not a.write_baseline else []
    remaining = len(baseline & failed) if not a.write_baseline else len(failed)
    print(f"{'viewport':28} {'scene':16} {'n':>3} {'min':>5} {'knob':>5}  result")
    for vp, sc, n, sm, kn, errs, d1 in rows:
        flag = 'D1' if d1 else ('OK' if not errs else 'FAIL: ' + '; '.join(errs))
        print(f"{vp:28} {sc:16} {n:3} {sm:5.0f} {('-' if kn is None else f'{kn:.0f}'):>5}  {flag}")
    for scene in ('parent', 'parent-end'):
        cells = [n for n in grown if n['scene'] == scene]
        g2f = sum(bool(n['g2']) for n in cells); g3f = sum(bool(n['g3']) for n in cells)
        print(f"AC-G2 {scene} {len(cells) - g2f}/{len(cells)}  AC-G3 {scene} {len(cells) - g3f}/{len(cells)}")
    for n in grown:
        if n['scene'] == 'parent' and n['cell'].startswith('568x320 S '):
            g = n.get('g1')
            if g and g.get('buttons'):
                ys = [b['top'] for b in g['buttons']] + [b['bottom'] for b in g['buttons']]
                print(f"AC-G1 {n['cell']} speed y {min(ys):.0f}-{max(ys):.0f} port {g['portBottom']:.0f} safe {g['safeBottom']:.0f}")
    print(f"\nbaseline {remaining} remaining, {len(baseline)} failure entries, {len(allowed)} turn entries")
    problems = []
    if legacy_bad: problems.append(f'{len(legacy_bad)} legacy failure(s)')
    if fresh: problems.append(f'{len(fresh)} failure(s) not in the baseline')
    if bad_turn: problems.append(f'{len(bad_turn)} turn card(s) outside the allowlist')
    if stale: problems.append(f'{len(stale)} baseline entr{"y" if len(stale)==1 else "ies"} now pass')
    for vp, sc, errs in legacy_bad[:12]:
        print(f'LEGACY {vp} {sc}: {"; ".join(errs)}')
    for key in fresh[:12]:
        print('NEW ' + ' '.join(key))
    for key in bad_turn[:12]:
        print('TURN ' + ' '.join(key))
    for key in stale[:12]:
        print('STALE ' + ' '.join(key))
    if problems:
        print('RATCHET: ' + '; '.join(problems))
        sys.exit(1)
    sys.exit(0)

if __name__ == '__main__':
    main()
