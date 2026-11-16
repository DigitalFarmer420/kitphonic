#!/usr/bin/env python3
"""iPad Safari touch: pointercancel, then touchmoves. Exit 0 only if every case inks.

Prints SKIP and exits 0 when Playwright or WebKit is not installed.

  python3 tools/ipad-trace-cancel.py --base http://127.0.0.1:8080/
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
            browser = p.webkit.launch()
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
                ctx.close()
            browser.close()
    except Exception as e:
        msg = str(e)
        if 'Executable doesn' in msg or ('webkit' in msg.lower() and 'install' in msg.lower()):
            print('SKIP playwright webkit is not installed')
            return 0
        print('FAIL', msg.splitlines()[-1] if msg else type(e).__name__)
        return 1
    return 1 if failed else 0

if __name__ == '__main__':
    sys.exit(main())
