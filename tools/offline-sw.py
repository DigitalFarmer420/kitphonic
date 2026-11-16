#!/usr/bin/env python3
"""One online visit with ?sw=1, then a reload with the network off. Then an update:

  python3 tools/offline-sw.py [--port 8159]

The update scenario serves the tree from a small in-process server on --port + 1 that can
bump the cache name (forcing a new worker), hold takes part-way through the new install,
and drop the network. It checks that the old worker keeps the lesson mid-update, the old
cache stays while the new takes are incomplete, takes still play offline from the old
cache, and a cold relaunch applies the new worker and removes the old cache.

Chromium is required. WebKit is attempted and reported when this Playwright build
cannot install a service worker. Exit 0 when Chromium passes. A missing Playwright
install skips (exit 0), matching the other browser tools.
"""
import argparse, os, re, sys, threading, time, urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from subprocess import Popen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('SKIP playwright not installed')
    sys.exit(0)

BOOT = """() => {
  const screen = [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id;
  const rows = JSON.parse(localStorage.getItem('kitphonic.v1.responses') || '[]');
  return {
    screen,
    helloHidden: !!document.getElementById('hello')?.hidden,
    mapHidden: !!document.getElementById('map')?.hidden,
    kept: rows.some(r => r && r.itemId === 'offline-sw-marker'),
    responses: rows.length
  };
}"""

AUDIO = """async () => {
  const read = async (path) => {
    const res = await fetch(path);
    const bytes = (await res.arrayBuffer()).byteLength;
    return { status: res.status, bytes };
  };
  const hello = await read('audio/takes/m-hello.mp3');
  const s = await read('audio/takes/snd-s.mp3');
  return { hello, s, onLine: navigator.onLine, controlled: !!navigator.serviceWorker.controller };
}"""


PROBE = """async () => {
  const c = navigator.serviceWorker.controller;
  if (!c) return null;
  return await new Promise(resolve => {
    const ch = new MessageChannel();
    ch.port1.onmessage = e => resolve(e.data && e.data.cache);
    c.postMessage({ type: 'kitphonic-cache' }, [ch.port2]);
    setTimeout(() => resolve('no-reply'), 3000);
  });
}"""

CACHES = """async () => {
  const out = {};
  for (const name of await caches.keys()) {
    const keys = await (await caches.open(name)).keys();
    out[name] = { files: keys.length, audio: keys.filter(k => k.url.includes('/audio/takes/')).length };
  }
  return out;
}"""

TAKES3 = """async () => {
  const out = {};
  for (const name of ['m-hello', 'snd-s', 'sfx-chime']) {
    try {
      const res = await fetch('audio/takes/' + name + '.mp3');
      out[name] = { status: res.status, bytes: (await res.arrayBuffer()).byteLength };
    } catch (err) { out[name] = { error: String(err) }; }
  }
  return out;
}"""

WAIT_CACHE = """async (name) => {
  const list = await (await fetch('sw-assets.json')).json();
  const want = [...list.shell, ...list.audio].map(p => '/' + p);
  const deadline = Date.now() + 170000;
  let files = 0;
  while (Date.now() < deadline) {
    const have = new Set((await (await caches.open(name)).keys()).map(k => new URL(k.url).pathname));
    files = have.size;
    if (want.every(p => have.has(p))) return { cache: name, files, complete: true };
    await new Promise(r => setTimeout(r, 100));
  }
  return { cache: name, files, complete: false };
}"""

NEW_CACHE = 'kitphonic-deadbeef00000001'
CACHE_LINE = re.compile(r"^export const CACHE = '(kitphonic-[0-9a-f]+)';$", re.M)


class Net:
    """Controls for the update server: bumped build, held takes, and a dropped network."""
    def __init__(self):
        self.lock = threading.Lock()
        self.bumped = False
        self.hold_after = None
        self.down = False
        self.audio = 0
        self.release = threading.Event()
        self.release.set()

    def bump(self, hold_after):
        with self.lock:
            self.bumped, self.hold_after, self.audio = True, hold_after, 0
            self.release.clear()

    def drop(self):
        with self.lock:
            self.down = True
        self.release.set()

    def restore(self):
        with self.lock:
            self.down, self.hold_after = False, None
        self.release.set()


def update_server(port, net):
    old = json_cache()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=ROOT, **kw)

        def log_message(self, *a):
            pass

        def end_headers(self):
            self.send_header('cache-control', 'no-store')
            super().end_headers()

        def hang_up(self):
            self.close_connection = True

        def body(self, data, ctype):
            self.send_response(200)
            self.send_header('content-type', ctype)
            self.send_header('content-length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = self.path.split('?')[0]
            if net.down:
                return self.hang_up()
            if path.startswith('/audio/takes/') and net.bumped:
                with net.lock:
                    net.audio += 1
                    n, hold = net.audio, net.hold_after
                if hold is not None and n > hold:
                    net.release.wait(120)
                    if net.down:
                        return self.hang_up()
            if net.bumped and path == '/sw.js':
                src = open(os.path.join(ROOT, 'sw.js'), encoding='utf8').read()
                return self.body(CACHE_LINE.sub(f"export const CACHE = '{NEW_CACHE}';", src).encode(), 'text/javascript')
            if net.bumped and path == '/sw-assets.json':
                src = open(os.path.join(ROOT, 'sw-assets.json'), encoding='utf8').read()
                return self.body(src.replace(f'"cache": "{old}"', f'"cache": "{NEW_CACHE}"').encode(), 'application/json')
            return super().do_GET()

    Handler.extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2'}
    srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def json_cache():
    import json
    with open(os.path.join(ROOT, 'sw-assets.json'), encoding='utf8') as f:
        return json.load(f)['cache']


def poll(page, expr, arg=None, timeout=30, every=0.2):
    deadline = time.time() + timeout
    while True:
        val = page.evaluate(expr, arg) if arg is not None else page.evaluate(expr)
        if val or time.time() > deadline:
            return val
        time.sleep(every)


LESSON = '?sw=1&skipHello=1&activity=trace&gpc=s&reducedMotion=1'
ON_LESSON = "() => !document.getElementById('lesson').hidden"


def update_scenario(browser, base, net, label):
    old = json_cache()
    problems = []
    context = browser.new_context()
    page = context.new_page()
    errs = []
    watch(page, errs)
    page.goto(base + '?sw=1&skipHello=1', wait_until='load')
    page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=30000)
    first = page.evaluate(WAIT_CACHE, old)
    page.goto(base + LESSON, wait_until='load')
    page.wait_for_function(ON_LESSON, timeout=20000)
    page.evaluate("""() => {
      window.__swChanges = 0; window.__unloads = 0;
      navigator.serviceWorker.addEventListener('controllerchange', () => window.__swChanges++);
      addEventListener('beforeunload', () => window.__unloads++);
    }""")
    before = page.evaluate(PROBE)

    # 1. A new build is published while the child is mid-lesson. Hold the new install after 20 takes.
    net.bump(hold_after=20)
    page.evaluate("() => navigator.serviceWorker.getRegistration().then(r => { r.update().catch(() => {}); })")
    deadline = time.time() + 60
    while net.audio <= 20 and time.time() < deadline:
        time.sleep(0.1)
    mid = {
        'controller': page.evaluate(PROBE),
        'installing': page.evaluate("() => navigator.serviceWorker.getRegistration().then(r => !!r.installing)"),
        'caches': page.evaluate(CACHES),
        'takes': page.evaluate(TAKES3),
        'on_lesson': page.evaluate(ON_LESSON),
        'controllerchange': page.evaluate('() => window.__swChanges'),
    }
    print(label, 'update first-visit', {'controller': before, **first})
    print(label, 'update mid-install', mid)
    if not first.get('complete') or before != old:
        problems.append(f'update first visit {before} {first}')
    if mid['controller'] != old or not mid['on_lesson'] or mid['controllerchange'] != 0 or not mid['installing']:
        problems.append(f'mid-install control {mid}')
    if old not in mid['caches'] or mid['caches'][old]['audio'] < 830:
        problems.append(f'old cache not kept mid-install {mid["caches"]}')
    if NEW_CACHE in mid['caches'] and mid['caches'][NEW_CACHE]['audio'] >= 830:
        problems.append(f'new cache unexpectedly complete {mid["caches"]}')
    if any(v.get('status') != 200 or v.get('bytes', 0) < 100 for v in mid['takes'].values()):
        problems.append(f'mid-install takes {mid["takes"]}')

    # 2. The network drops before the new takes finish. The new install must fail, not take over.
    net.drop()
    context.set_offline(True)
    gone = poll(page, "() => navigator.serviceWorker.getRegistration().then(r => !r.installing && !r.waiting)", timeout=60)
    off = {
        'install_dropped': gone,
        'controller': page.evaluate(PROBE),
        'caches': page.evaluate(CACHES),
        'takes': page.evaluate(TAKES3),
        'on_lesson': page.evaluate(ON_LESSON),
        'controllerchange': page.evaluate('() => window.__swChanges'),
        'onLine': page.evaluate('() => navigator.onLine'),
    }
    print(label, 'update offline mid-install', off)
    if not off['install_dropped'] or off['controller'] != old or not off['on_lesson'] or off['controllerchange'] != 0:
        problems.append(f'offline mid-install control {off}')
    if old not in off['caches'] or off['caches'][old]['audio'] < 830:
        problems.append(f'old cache lost offline {off["caches"]}')
    if any(v.get('status') != 200 or v.get('bytes', 0) < 100 for v in off['takes'].values()):
        problems.append(f'offline takes {off["takes"]}')

    # 3. Back online: the new worker installs fully and then waits. The lesson keeps the old worker.
    net.restore()
    context.set_offline(False)
    page.evaluate("() => navigator.serviceWorker.getRegistration().then(r => { r.update().catch(() => {}); })")
    waiting = poll(page, "() => navigator.serviceWorker.getRegistration().then(r => !!r.waiting)", timeout=150, every=0.5)
    wait_state = {
        'waiting': waiting,
        'controller': page.evaluate(PROBE),
        'caches': page.evaluate(CACHES),
        'on_lesson': page.evaluate(ON_LESSON),
        'controllerchange': page.evaluate('() => window.__swChanges'),
        'unloads': page.evaluate('() => window.__unloads'),
    }
    print(label, 'update waiting', wait_state)
    if not waiting or wait_state['controller'] != old or not wait_state['on_lesson'] or wait_state['controllerchange'] != 0 or wait_state['unloads'] != 0:
        problems.append(f'waiting state {wait_state}')
    if old not in wait_state['caches'] or wait_state['caches'].get(NEW_CACHE, {}).get('audio', 0) < 830:
        problems.append(f'waiting caches {wait_state["caches"]}')

    # 4. Cold relaunch: every tab closed, then a new launch. The new worker activates and the old cache goes.
    page.close()
    time.sleep(1)
    page = context.new_page()
    watch(page, errs)
    page.goto(base + '?sw=1&skipHello=1', wait_until='load')
    page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=30000)
    after = poll(page, f"() => ({PROBE})().then(c => c === '{NEW_CACHE}' ? c : null)", timeout=20)
    names = poll(page, f"() => caches.keys().then(n => n.length === 1 && n[0] === '{NEW_CACHE}' ? n : null)", timeout=30)
    context.set_offline(True)
    page.reload(wait_until='load', timeout=30000)
    page.wait_for_function("() => window.kitphonic && !document.getElementById('map').hidden", timeout=30000)
    relaunch = {'controller': page.evaluate(PROBE), 'caches': page.evaluate(CACHES), 'offline_takes': page.evaluate(TAKES3)}
    print(label, 'update cold relaunch', relaunch)
    print(label, 'update errors', errs)
    if after != NEW_CACHE or not names:
        problems.append(f'cold relaunch {after} {names} {relaunch}')
    if any(v.get('status') != 200 or v.get('bytes', 0) < 100 for v in relaunch['offline_takes'].values()):
        problems.append(f'relaunch takes {relaunch}')
    if errs:
        problems.append(errs)
    context.close()
    return problems


def wait_http(port):
    url = f'http://127.0.0.1:{port}/sw.js'
    for _ in range(50):
        try:
            with urllib.request.urlopen(url, timeout=0.5) as res:
                if res.status == 200:
                    return
        except Exception:
            time.sleep(0.1)
    raise RuntimeError(f'no server on {port}')


def serve(port):
    env = dict(os.environ)
    env['PORT'] = str(port)
    return Popen(['node', 'tools/serve.mjs'], cwd=ROOT, env=env, stdout=open(os.devnull, 'w'), stderr=open(os.devnull, 'w'))


def watch(page, errs):
    page.on('pageerror', lambda e: errs.append('pageerror ' + str(e)))
    page.on('console', lambda m: errs.append(f'console {m.type} {m.text}') if m.type == 'error' else None)


def scenario(browser, base, label):
    context = browser.new_context()
    page = context.new_page()
    errs = []
    watch(page, errs)
    page.goto(base + '?sw=1&skipHello=1', wait_until='load')
    page.wait_for_function("() => !document.getElementById('map').hidden", timeout=20000)
    page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=30000)
    controller = page.evaluate("() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL")
    # evaluate awaits this promise; wait_for_function would treat the Promise object as ready.
    ready = page.evaluate("""async () => {
      const list = await (await fetch('sw-assets.json')).json();
      const want = new Set([...list.shell, ...list.audio].map(p => '/' + p));
      const deadline = Date.now() + 170000;
      let files = 0;
      while (Date.now() < deadline) {
        const cache = await caches.open(list.cache);
        const have = new Set((await cache.keys()).map(k => new URL(k.url).pathname));
        files = have.size;
        if ([...want].every(p => have.has(p))) {
          return { cache: list.cache, files, audio: list.audio.length, shell: list.shell.length };
        }
        await new Promise(r => setTimeout(r, 100));
      }
      return { cache: list.cache, files, audio: list.audio.length, shell: list.shell.length, timeout: true };
    }""")
    page.evaluate("""() => {
      const key = 'kitphonic.v1.responses';
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      rows.push({ skill: 'sound:s', itemId: 'offline-sw-marker', correct: true, firstAttempt: true, timestamp: 1 });
      localStorage.setItem(key, JSON.stringify(rows));
    }""")
    context.set_offline(True)
    page.reload(wait_until='load', timeout=30000)
    page.wait_for_function("() => window.kitphonic && !document.getElementById('map').hidden", timeout=30000)
    boot = page.evaluate(BOOT)
    audio = page.evaluate(AUDIO)
    print(label, 'controller', controller)
    print(label, 'audio-ready', ready)
    print(label, 'offline', boot)
    print(label, 'takes', audio)
    print(label, 'errors', errs)
    problems = []
    if not controller or not str(controller).endswith('/sw.js'):
        problems.append(f'controller {controller}')
    if ready.get('timeout') or ready['files'] < ready['audio'] + ready['shell']:
        problems.append(f'cache short {ready}')
    if boot['screen'] != 'map' or boot['helloHidden'] is not True or boot['kept'] is not True:
        problems.append(f'boot {boot}')
    if audio['hello']['status'] != 200 or audio['hello']['bytes'] < 100:
        problems.append(f"m-hello {audio['hello']}")
    if audio['s']['status'] != 200 or audio['s']['bytes'] < 100:
        problems.append(f"snd-s {audio['s']}")
    if audio['onLine'] is not False or audio['controlled'] is not True:
        problems.append(f'offline state {audio}')
    if errs:
        problems.append(errs)
    context.close()

    quiet = browser.new_context()
    page = quiet.new_page()
    nosw_errs = []
    watch(page, nosw_errs)
    page.goto(base + '?nosw=1&skipHello=1', wait_until='load')
    page.wait_for_function("() => !document.getElementById('map').hidden", timeout=20000)
    page.wait_for_timeout(500)
    regs = page.evaluate("() => navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => r.scope))")
    controlled = page.evaluate("() => !!navigator.serviceWorker.controller")
    print(label, 'nosw', {'registrations': regs, 'controller': controlled, 'errors': nosw_errs})
    if regs or controlled:
        problems.append(f'nosw registered {regs} controller {controlled}')
    if nosw_errs:
        problems.append(nosw_errs)
    quiet.close()
    return problems


def webkit(browser_type, base, upd=None, net=None):
    try:
        browser = browser_type.launch()
    except Exception as err:
        print('WEBKIT unsupported', err)
        return []
    probe = browser.new_context()
    page = probe.new_page()
    try:
        page.goto(base + '?sw=1&skipHello=1', wait_until='load', timeout=20000)
        page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=15000)
    except Exception as err:
        print('WEBKIT unsupported', err)
        browser.close()
        return []
    probe.close()
    problems = scenario(browser, base, 'WEBKIT')
    if upd:
        net.__init__()
        problems += update_scenario(browser, upd, net, 'WEBKIT')
    browser.close()
    return problems


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8159)
    args = parser.parse_args()
    proc = serve(args.port)
    base = f'http://127.0.0.1:{args.port}/'
    net = Net()
    srv = update_server(args.port + 1, net)
    upd = f'http://127.0.0.1:{args.port + 1}/'
    try:
        wait_http(args.port)
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch()
            except Exception as err:
                print('SKIP chromium not installed', err)
                return 0
            problems = scenario(browser, base, 'CHROMIUM')
            problems += update_scenario(browser, upd, net, 'CHROMIUM')
            browser.close()
            problems += webkit(p.webkit, base, upd, net)
        if problems:
            print('FAIL', problems)
            return 1
        print('PASS')
        return 0
    finally:
        net.restore()
        srv.shutdown()
        proc.terminate()
        try: proc.wait(timeout=5)
        except Exception: proc.kill()


if __name__ == '__main__':
    sys.exit(main())
