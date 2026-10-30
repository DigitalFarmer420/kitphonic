# Cold-load hello latency: throttled 1.6 Mbps / 150 ms RTT, cache off. Times pointerdown on Start -> Kit's hello starting.
import sys, time, statistics, json
from playwright.sync_api import sync_playwright
base = sys.argv[1]; runs = int(sys.argv[2]) if len(sys.argv) > 2 else 5
waits = [float(w) for w in (sys.argv[3] if len(sys.argv) > 3 else '0,1.5').split(',')]
JS_HOOK = """() => { window.__t = {}; const p = document.getElementById('play');
  p.addEventListener('pointerdown', () => { __t.down = performance.now(); }, { capture: true });
  const ctxP = (window.AudioContext||window.webkitAudioContext).prototype, orig = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { if (__t.down && !__t.audio) __t.audio = performance.now(); return orig.apply(this, a); };
  const so = window.speechSynthesis && speechSynthesis.speak.bind(speechSynthesis); }"""
res = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    for w in waits:
        out = []
        for r in range(runs):
            ctx = b.new_context(viewport={'width': 360, 'height': 780}); pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg)
            cdp.send('Network.enable'); cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
            cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 1.6e6/8, 'uploadThroughput': 0.75e6/8})
            t0 = time.time(); pg.goto(base, wait_until='commit'); pg.wait_for_selector('#play', state='visible', timeout=60000)
            vis = time.time() - t0
            pg.wait_for_function("window.kitphonic", timeout=60000); boot = time.time() - t0
            pg.evaluate(JS_HOOK); time.sleep(w)
            box = pg.locator('#play').bounding_box(); pg.mouse.move(box['x'] + 60, box['y'] + 60)
            pg.mouse.down(); pg.mouse.up()
            pg.wait_for_function("window.__t.audio", timeout=30000)
            lat = pg.evaluate("__t.audio - __t.down"); out.append(round(lat))
            ctx.close()
        res[w] = out
        print(f'wait {w}s after boot: hello latency ms {out} median {statistics.median(out)} (boot {boot:.1f}s)', flush=True)
    b.close()
