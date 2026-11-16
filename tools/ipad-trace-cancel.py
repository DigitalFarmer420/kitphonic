#!/usr/bin/env python3
"""iPad Safari touch: pointercancel, then touchmoves. Exit 0 only if every case inks.

Also every multi-stroke grapheme in js/trace.js STROKES (PR #18 Uiux / Test Engineer: two-stroke letters deadlocked
when drawMarks() removed the start digit under the finger and its lift was lost). Per grapheme and iPad size:
  control             stroke 1 with no interruption; the lift goes to the original down target
  pointercancel       cancel mid stroke 1, a palm lands and lifts while held, stroke 1 finishes through touchmoves
  lostpointercapture  the same with a lostpointercapture on the svg
then a new finger traces each later stroke; the letter must finish. Every event of a finger goes to the element hit at
its pointerdown (WebKit implicit touch capture), so a lift dispatched on a node removed from the DOM never reaches the
svg. Chromium also runs real CDP touches: control, and lost-real (the svg takes and releases the live touch's capture).

Prints SKIP and exits 0 when Playwright or the browser is not installed.

  python3 tools/ipad-trace-cancel.py --base http://127.0.0.1:8080/ [--browser webkit|chromium|all] [--multi all|t,f]
"""
import argparse, sys

UA = ('Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1')
# portrait, two landscape iPads, and the 13-inch M4 landscape CSS size
VIEWS = [
    ('portrait', 834, 1194, 2),
    ('land-1180', 1180, 820, 2),
    ('land-1024', 1024, 768, 2),
    ('land-1376', 1376, 1032, 2),
]

INJECT = r"""(mode) => {
  const svg = document.getElementById('tr-svg');
  const child = svg.querySelector('text.startn') || svg.querySelector('.start');
  const r = child.getBoundingClientRect();
  const x0 = r.x + r.width / 2, y0 = r.y + r.height / 2;
  const fire = (type, target, x, y, buttons) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
    clientX: x, clientY: y, buttons
  }));
  const touch = (type, x, y) => {
    const t = { identifier: 1, clientX: x, clientY: y };
    const up = type === 'touchend' || type === 'touchcancel';
    const ev = new Event(type, { bubbles: true, cancelable: true });
    ev.touches = up ? [] : [t];
    ev.changedTouches = [t];
    svg.dispatchEvent(ev);
  };
  touch('touchstart', x0, y0);
  fire('pointerdown', child, x0, y0, 1);
  const down = kitphonic.lesson.run.debugState();
  const pts = kitphonic.lesson.run.debugPoints();
  const cut = mode === 'mid' ? Math.max(2, Math.floor(pts.length / 3)) : 0;
  for (let i = 1; i <= cut; i++) fire('pointermove', svg, pts[i][0], pts[i][1], 1);
  const mid = kitphonic.lesson.run.debugState();
  fire('pointercancel', svg, (pts[cut] || pts[0])[0], (pts[cut] || pts[0])[1], 0);
  const cancelled = kitphonic.lesson.run.debugState();
  for (let i = cut + 1; i < pts.length; i++) touch('touchmove', pts[i][0], pts[i][1]);
  const end = kitphonic.lesson.run.debugState();
  const ctm = svg.getScreenCTM();
  const ctmScale = ctm ? Math.hypot(ctm.a, ctm.b) : 0;
  const card = document.querySelector('#trace .tcard')?.getBoundingClientRect();
  const stage = document.getElementById('stage');
  const m = stage ? new DOMMatrix(getComputedStyle(stage).transform) : null;
  return { down, mid, cancelled, end, ctmScale, stageScale: m ? m.a : null,
    card: card && { x: card.x, y: card.y, w: card.width, h: card.height },
    vw: innerWidth, vh: innerHeight };
}"""

# WebKit dispatch model: each finger's pointer and touch events go to the element hit at its pointerdown (implicit
# touch capture), including the lift. When drawMarks() removes that node the lift is dispatched on a detached node and
# never reaches the svg, exactly as a missed lift on iPad.
MULTI = r"""async (kind) => {
  const svg = document.getElementById('tr-svg');
  const run = kitphonic.lesson.run;
  const active = new Map();
  const hit = (x, y) => document.elementFromPoint(x, y) || svg;
  const name = el => el.tagName + '.' + (el.className?.baseVal ?? '');
  const owner = () => (typeof run.debugOwner === 'function' ? run.debugOwner() : 'n/a');
  const P = (type, target, id, x, y, buttons) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: active.size === 0 || type !== 'pointerdown', clientX: x, clientY: y, buttons }));
  const T = (type, target, ident, x, y) => {
    const t = { identifier: ident, clientX: x, clientY: y };
    if (type === 'touchend' || type === 'touchcancel') active.delete(ident); else active.set(ident, t);
    const ev = new Event(type, { bubbles: true, cancelable: true });
    ev.touches = [...active.values()]; ev.changedTouches = [t];
    target.dispatchEvent(ev);
  };
  const finger = (pid, ident) => ({ pid, ident, target: null,
    down(q) { this.target = hit(q[0], q[1]); P('pointerdown', this.target, pid, q[0], q[1], 1); T('touchstart', this.target, ident, q[0], q[1]); },
    move(q) { P('pointermove', this.target, pid, q[0], q[1], 1); T('touchmove', this.target, ident, q[0], q[1]); },
    touchOnly(q) { T('touchmove', this.target, ident, q[0], q[1]); },
    up(q) { P('pointerup', this.target, pid, q[0], q[1], 0); T('touchend', this.target, ident, q[0], q[1]); } });
  const strokes = run.debugState().strokes;
  let pts = run.debugPoints();
  const f1 = finger(2, 1); f1.down(pts[0]);
  const cut = Math.max(2, Math.floor(pts.length / 3));
  for (let i = 1; i <= cut; i++) f1.move(pts[i]);
  let palmOk = true, cancelled = run.debugState();
  if (kind === 'control') {
    for (let i = cut + 1; i < pts.length; i++) f1.move(pts[i]);
  } else {
    if (kind === 'pointercancel') P('pointercancel', f1.target, 2, pts[cut][0], pts[cut][1], 0);
    else svg.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 2, pointerType: 'touch', isPrimary: true, clientX: pts[cut][0], clientY: pts[cut][1] }));
    await new Promise(r => setTimeout(r, 0)); // iOS delivers the touchmoves in later tasks
    cancelled = run.debugState();
    // a palm lands while the stroke is held: it must not take the stroke or move the ink
    const r = svg.getBoundingClientRect(), palmAt = [r.right - 10, r.bottom - 10], palm = finger(9, 8);
    const k0 = run.debugState().k; palm.down(palmAt);
    palmOk = (owner() === 'n/a' || owner() === 2) && run.debugState().stroke === 0 && run.debugState().k === k0;
    const half = cut + Math.floor((pts.length - cut) / 2);
    for (let i = cut + 1; i < pts.length; i++) { f1.touchOnly(pts[i]); if (i === half) palm.up(palmAt); }
    if (active.has(8)) palm.up(palmAt);
  }
  const s1 = run.debugState(), t1 = name(f1.target);
  f1.up(pts[pts.length - 1]);
  const t1attached = f1.target.isConnected, ownerAfterLift = owner();
  for (let s = 1; s < strokes; s++) { // every later stroke: a new finger
    pts = run.debugPoints(); if (!pts.length) break;
    const f = finger(10 + 2 * s, 10 + 2 * s - 1); f.down(pts[0]);
    for (let i = 1; i < pts.length; i++) f.move(pts[i]);
    f.up(pts[pts.length - 1]);
  }
  return { strokes, cancelled, s1, end: run.debugState(), t1, t1attached, ownerAfterLift, palmOk,
    stars: document.querySelectorAll('#tr-tray .emoji:not(.off)').length };
}"""

MULTI_STROKE = r"""async () => {
  const m = await import(new URL('js/trace.js', location.href).href);
  return Object.entries(m.STROKES).filter(([, v]) => v.length > 1).map(([k]) => k);
}"""

def multi_line(browser, view, g, kind, d):
    held_ok = kind == 'control' or d['cancelled']['active']
    ok = held_ok and d['palmOk'] and d['s1']['stroke'] >= 1 and (d['end']['done'] or d['end']['letterDone'] or d['stars'] >= 1)
    return (0 if ok else 1,
            f"{'PASS' if ok else 'FAIL'} {browser} {view} multi {g} strokes={d['strokes']} {kind} downTarget={d['t1']} "
            f"connectedAtLift={d['t1attached']} heldOk={held_ok} palmOk={d['palmOk']} s1 stroke={d['s1']['stroke']} "
            f"ownerAfterLift={d['ownerAfterLift']} end stroke={d['end']['stroke']} done={d['end']['done']} stars={d['stars']}")

def cdp_lost_real(p, base, g, name, w, h, kind):
    """Chromium, real CDP touches: the svg takes and releases capture of the live touch (a real lostpointercapture),
    or no interruption at all (control). The letter must finish with a new finger per later stroke."""
    b = p.chromium.launch()
    try:
        ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True, user_agent=UA)
        pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg)
        cdp.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
        T = lambda typ, tps: cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, x, y in tps]})
        pg.goto(base + f'?skipHello=1&reducedMotion=1&activity=trace&gpc={g}', wait_until='domcontentloaded')
        pg.wait_for_function("() => (window.kitphonic?.lesson?.run?.debugPoints?.() ?? []).length > 2", timeout=15000)
        strokes = pg.evaluate("() => kitphonic.lesson.run.debugState().strokes")
        pts = pg.evaluate("() => kitphonic.lesson.run.debugPoints()"); cut = max(2, len(pts) // 3)
        T('touchStart', [(1, *pts[0])])
        for q in pts[1:cut + 1]: T('touchMove', [(1, *q)])
        held = True
        if kind == 'lost-real':
            pg.evaluate("""() => { const svg = document.getElementById('tr-svg'), pid = kitphonic.lesson.run.debugOwner();
              svg.setPointerCapture(pid); svg.releasePointerCapture(pid); }""")
            pg.wait_for_timeout(60)
            held = pg.evaluate("() => kitphonic.lesson.run.debugState().active")
        for q in pts[cut + 1:]: T('touchMove', [(1, *q)])
        s1 = pg.evaluate("() => kitphonic.lesson.run.debugState()")
        T('touchEnd', []); pg.wait_for_timeout(30)
        for s in range(1, strokes):
            pts = pg.evaluate("() => kitphonic.lesson.run.debugPoints()")
            if not pts: break
            T('touchStart', [(s + 1, *pts[0])])
            for q in pts[1:]: T('touchMove', [(s + 1, *q)])
            T('touchEnd', []); pg.wait_for_timeout(30)
        end = pg.evaluate("() => kitphonic.lesson.run.debugState()")
        stars = pg.evaluate("() => document.querySelectorAll('#tr-tray .emoji:not(.off)').length")
        ok = held and s1['stroke'] >= 1 and (end['done'] or stars >= 1)
        return (0 if ok else 1, f"{'PASS' if ok else 'FAIL'} chromium-cdp {name} multi {g} strokes={strokes} {kind} heldOk={held} "
                f"s1 stroke={s1['stroke']} end stroke={end['stroke']} done={end['done']} stars={stars}")
    finally:
        b.close()

def line(view, mode, data):
    end, cancel = data['end'], data['cancelled']
    progressed = (end['done'] or end['stroke'] > cancel['stroke'] or end['k'] > cancel['k']) and cancel['active']
    # A cancel that already finished the letter (done) has active false; that still counts.
    if cancel['done'] and end['done']:
        progressed = True
    tag = 'PASS' if progressed else 'FAIL'
    return (0 if progressed else 1,
            f"{tag} {view} {mode} cancel k={cancel['k']} stroke={cancel['stroke']} active={cancel['active']} "
            f"end k={end['k']} stroke={end['stroke']} active={end['active']} done={end['done']}")

def tol_line(data):
    ctm, stage = data['ctmScale'], data['stageScale']
    card = data['card'] or {}
    start_px = 20 * ctm
    lane_px = 17 * ctm
    inside = card and 0 <= card['x'] and 0 <= card['y'] and card['x'] + card['w'] <= data['vw'] + 1 and card['y'] + card['h'] <= data['vh'] + 1
    return (f"TOL {data['vw']}x{data['vh']} stageScale={stage and round(stage, 3)} ctmScale={round(ctm, 3)} "
            f"startTolPx={round(start_px, 1)} laneTolPx={round(lane_px, 1)} "
            f"card={round(card.get('x', -1), 1)},{round(card.get('y', -1), 1)} {round(card.get('w', 0), 1)}x{round(card.get('h', 0), 1)} "
            f"onScreen={bool(inside)}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://127.0.0.1:8080/')
    ap.add_argument('--letter', default='s')
    ap.add_argument('--multi', default='all', help='"all" = every multi-stroke grapheme in js/trace.js STROKES, a comma list, or "" to skip')
    ap.add_argument('--browser', default='webkit', choices=['webkit', 'chromium', 'all'])
    args = ap.parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('SKIP playwright is not installed')
        return 0
    q = f'?skipHello=1&reducedMotion=1&activity=trace&gpc={args.letter}'
    failed = False
    try:
        with sync_playwright() as p:
          for bname in (['webkit', 'chromium'] if args.browser == 'all' else [args.browser]):
            browser = getattr(p, bname).launch()
            print(f'== {bname}')
            for name, w, h, dpr in VIEWS:
                ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, has_touch=True, user_agent=UA, is_mobile=True)
                page = ctx.new_page()
                for mode in ('early', 'mid'):
                    page.goto(args.base + q, wait_until='domcontentloaded')
                    page.wait_for_function("() => (window.kitphonic?.lesson?.run?.debugPoints?.() ?? []).length > 2", timeout=15000)
                    data = page.evaluate(INJECT, mode)
                    code, text = line(name, mode, data)
                    print(text)
                    failed = failed or code != 0
                    if name == 'land-1376' and mode == 'early':
                        print(tol_line(data))
                if args.multi:
                    page.goto(args.base + q, wait_until='domcontentloaded')
                    multi = page.evaluate(MULTI_STROKE) if args.multi == 'all' else [x for x in args.multi.split(',') if x]
                    if name == VIEWS[0][0]: print(f'multi-stroke graphemes ({len(multi)}): {" ".join(multi)}')
                    for g in multi:
                        for kind in ('control', 'pointercancel', 'lostpointercapture'):
                            page.goto(args.base + f'?skipHello=1&reducedMotion=1&activity=trace&gpc={g}', wait_until='domcontentloaded')
                            page.wait_for_function("() => (window.kitphonic?.lesson?.run?.debugPoints?.() ?? []).length > 2", timeout=15000)
                            code, text = multi_line(bname, name, g, kind, page.evaluate(MULTI, kind))
                            print(text)
                            failed = failed or code != 0
                        if bname == 'chromium':
                            for kind in ('control', 'lost-real'):
                                code, text = cdp_lost_real(p, args.base, g, name, w, h, kind)
                                print(text)
                                failed = failed or code != 0
                ctx.close()
            browser.close()
    except Exception as e:
        msg = str(e)
        if 'Executable doesn' in msg or ('install' in msg.lower() and ('webkit' in msg.lower() or 'chrom' in msg.lower())):
            print('SKIP playwright browser is not installed')
            return 0
        print('FAIL', msg.splitlines()[-1] if msg else type(e).__name__)
        return 1
    return 1 if failed else 0

if __name__ == '__main__':
    sys.exit(main())
