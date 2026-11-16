#!/usr/bin/env python3
"""iPad Safari touch: pointercancel, then touchmoves. Exit 0 only if every case inks.

Also two-stroke letters (default `t`): stroke 1 is interrupted by a pointercancel or a lostpointercapture on the
svg, finishes through touchmoves, the finger lifts, and a new finger traces stroke 2. The letter must finish
(PR #18 Uiux review: it deadlocked when drawMarks() removed the start digit under the finger). Every event goes to
the element a real browser would target: the one hit at touchstart / pointerdown (implicit touch capture), so an
event on a node removed from the DOM never reaches the svg.

Prints SKIP and exits 0 when Playwright or the browser is not installed.

  python3 tools/ipad-trace-cancel.py --base http://127.0.0.1:8080/ [--browser webkit|chromium|all] [--two t]
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

TWO = r"""async (cancel) => {
  const svg = document.getElementById('tr-svg');
  const run = kitphonic.lesson.run;
  const hit = (x, y) => document.elementFromPoint(x, y) || svg; // a real touch targets what it lands on, for its lifetime
  const P = (type, target, id, x, y, buttons) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons }));
  const T = (type, target, ident, x, y) => {
    const t = { identifier: ident, clientX: x, clientY: y };
    const ev = new Event(type, { bubbles: true, cancelable: true });
    ev.touches = type === 'touchend' || type === 'touchcancel' ? [] : [t];
    ev.changedTouches = [t];
    target.dispatchEvent(ev);
  };
  // Stroke 1: Touch.identifier 1 / pointerId 2 (Chrome-style mapping), cancelled a third of the way in.
  let pts = run.debugPoints(); const a = pts[0]; const t1 = hit(a[0], a[1]); const t1name = t1.tagName + '.' + (t1.className?.baseVal ?? '');
  P('pointerdown', t1, 2, a[0], a[1], 1); T('touchstart', t1, 1, a[0], a[1]);
  const cut = Math.max(2, Math.floor(pts.length / 3));
  for (let i = 1; i <= cut; i++) P('pointermove', t1, 2, pts[i][0], pts[i][1], 1);
  P(cancel, cancel === 'lostpointercapture' ? svg : t1, 2, pts[cut][0], pts[cut][1], 0);
  await new Promise(r => setTimeout(r, 0)); // iOS delivers the touchmoves in later tasks
  const cancelled = run.debugState();
  for (let i = cut + 1; i < pts.length; i++) T('touchmove', t1, 1, pts[i][0], pts[i][1]);
  const s1 = run.debugState(); const t1attached = t1.isConnected;
  const last = pts[pts.length - 1]; T('touchend', t1, 1, last[0], last[1]);
  const lifted = { owner: typeof run.debugOwner === 'function' ? run.debugOwner() : 'n/a' };
  // Stroke 2: a new finger, Touch.identifier 3 / pointerId 4.
  pts = run.debugPoints(); const b = pts[0] || [0, 0]; const t2 = hit(b[0], b[1]);
  P('pointerdown', t2, 4, b[0], b[1], 1); T('touchstart', t2, 3, b[0], b[1]);
  const down2 = run.debugState();
  for (let i = 1; i < pts.length; i++) P('pointermove', t2, 4, pts[i][0], pts[i][1], 1);
  const end = run.debugState();
  const z = pts[pts.length - 1] || b; P('pointerup', t2, 4, z[0], z[1], 0); T('touchend', t2, 3, z[0], z[1]);
  return { cancelled, s1, lifted, down2, end, t1: t1name, t1attached, stars: document.querySelectorAll('#tr-tray .emoji:not(.off)').length };
}"""

def two_line(view, letter, cancel, d):
    ok = d['cancelled']['active'] and d['s1']['stroke'] >= 1 and (d['end']['done'] or d['end']['letterDone'] or d['stars'] >= 1)
    return (0 if ok else 1,
            f"{'PASS' if ok else 'FAIL'} {view} two-stroke {letter} {cancel} target={d['t1']} attachedAfterStroke1={d['t1attached']} "
            f"s1 stroke={d['s1']['stroke']} ownerAfterLift={d['lifted']['owner']} down2 active={d['down2']['active']} "
            f"end stroke={d['end']['stroke']} k={d['end']['k']} done={d['end']['done']} stars={d['stars']}")

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
    ap.add_argument('--two', default='t', help='comma-separated two-stroke letters ("" to skip)')
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
                    page.wait_for_function("() => (kitphonic.lesson?.run?.debugPoints?.() ?? []).length > 2", timeout=15000)
                    data = page.evaluate(INJECT, mode)
                    code, text = line(name, mode, data)
                    print(text)
                    failed = failed or code != 0
                    if name == 'land-1376' and mode == 'early':
                        print(tol_line(data))
                for two in [x for x in args.two.split(',') if x]:
                    for cancel in ('pointercancel', 'lostpointercapture'):
                        page.goto(args.base + f'?skipHello=1&reducedMotion=1&activity=trace&gpc={two}', wait_until='domcontentloaded')
                        page.wait_for_function("() => (kitphonic.lesson?.run?.debugPoints?.() ?? []).length > 2", timeout=15000)
                        code, text = two_line(name, two, cancel, page.evaluate(TWO, cancel))
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
