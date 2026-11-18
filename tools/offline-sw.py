#!/usr/bin/env python3
"""One online visit with ?sw=1, then a reload with the network off. Then an update:

  python3 tools/offline-sw.py [--port 8159]

The update scenario serves the tree from a small in-process server on --port + 1 that can
bump the cache name (forcing a new worker), hold takes part-way through the new install,
and drop the network. It checks that the old worker keeps the lesson mid-update, the old
cache stays while the new takes are incomplete, takes still play offline from the old
cache, and a cold relaunch applies the new worker and removes the old cache.
It also serves the tree at /kitphonic/ and /kitphonic-dev/ on that one origin: both install,
updating dev leaves prod's cache alone, both work offline, and ?nosw=1 on dev unregisters dev
and clears only dev's caches (KP-QA-011, KP-QA-010). A follow-up scenario aborts a mid-install
dev update (leaving an incomplete scoped cache) and checks that one ?nosw=1 visit removes every
dev-scoped cache, complete or not, without touching prod or unowned legacy caches.
A further scenario deploys the emergency kill-switch template as /kitphonic-dev/sw.js: a 30 s
watch on a page that re-registers sw.js like sw-register does must exceed 2 navigations on the
e5e47a0c template (the loop that template would fail) and stay at most 2 on the current one;
going offline after the new kill does not loop or blank the page; restoring the real sw.js
reinstalls and works offline; prod is unaffected.

Chromium is required. WebKit is attempted and reported when this Playwright build
cannot install a service worker. Exit 0 when Chromium passes. A missing Playwright
install skips (exit 0), matching the other browser tools.
"""
import argparse, os, re, signal, sys, threading, time, urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from subprocess import DEVNULL, Popen

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
  const reg = await navigator.serviceWorker.getRegistration();
  const want = [...list.shell, ...list.audio].map(p => new URL(p, reg.scope).pathname);
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
SITES = ('/kitphonic/', '/kitphonic-dev/')


def scoped(path, build):
    """Cache name a worker registered at `path` uses for build `kitphonic-<hash>` (KP-QA-011)."""
    return f"kitphonic:{path}:{build[len('kitphonic-'):]}"
CACHE_LINE = re.compile(r"^export const CACHE = '(kitphonic-[0-9a-f]+)';$", re.M)


class Net:
    """Controls for the update server: bumped build, held takes, and a dropped network."""
    def __init__(self):
        self.lock = threading.Lock()
        self.bumped = False
        self.bump_prefix = '/'
        self.hold_after = None
        self.down = False
        self.audio = 0
        self.release = threading.Event()
        self.release.set()
        self.sw_files = {}
        self.hits = []

    def set_sw(self, mount, path):
        """Serve path as sw.js under this site prefix, or drop the override when path is None."""
        with self.lock:
            if path is None:
                self.sw_files.pop(mount, None)
            else:
                self.sw_files[mount] = path

    def record_hit(self, path):
        with self.lock:
            self.hits.append((time.time(), path))

    def clear_hits(self):
        with self.lock:
            self.hits.clear()

    def hit_count(self, needle):
        with self.lock:
            return sum(1 for _, path in self.hits if needle in path)

    def hit_count_exact(self, *names):
        want = set(names)
        with self.lock:
            return sum(1 for _, path in self.hits if path in want)

    def bump(self, hold_after, prefix='/'):
        with self.lock:
            self.bumped, self.hold_after, self.audio, self.bump_prefix = True, hold_after, 0, prefix
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
            full = self.path.split('?')[0]
            # The same tree is also served at /kitphonic/ and /kitphonic-dev/ (two deployments, one origin).
            path = full
            for mount in SITES:
                if full.startswith(mount):
                    path = '/' + full[len(mount):]
                    self.path = path + self.path[len(full):]
                    break
            bumped = net.bumped and full.startswith(net.bump_prefix)
            if net.down:
                return self.hang_up()
            if path.startswith('/audio/takes/') and bumped:
                with net.lock:
                    net.audio += 1
                    n, hold = net.audio, net.hold_after
                if hold is not None and n > hold:
                    net.release.wait(120)
                    if net.down:
                        return self.hang_up()
            net.record_hit(full)
            if path == '/repro.html':
                src = open(os.path.join(ROOT, 'tests/fixtures/sw-killswitch-repro.html'), 'rb').read()
                return self.body(src, 'text/html')
            if path == '/probe.html':
                return self.body(b'<!doctype html><title>sw probe</title>', 'text/html')
            with net.lock:
                sw_files = dict(net.sw_files)
            if path == '/sw.js':
                for mount, dest in sw_files.items():
                    if full.startswith(mount):
                        return self.body(open(dest, 'rb').read(), 'text/javascript')
            if bumped and path == '/sw.js':
                src = open(os.path.join(ROOT, 'sw.js'), encoding='utf8').read()
                return self.body(CACHE_LINE.sub(f"export const CACHE = '{NEW_CACHE}';", src).encode(), 'text/javascript')
            if bumped and path == '/sw-assets.json':
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


def wait_map(page, timeout=20000):
    """Wait for the map, tolerating a mid-wait navigation (?nosw=1 auto-reloads once)."""
    deadline = time.time() + timeout / 1000
    last = None
    while time.time() < deadline:
        try:
            page.wait_for_function("() => window.kitphonic && !document.getElementById('map').hidden", timeout=2000)
            return
        except Exception as err:
            last = err
    raise TimeoutError(f'map not visible after nosw: {last}')


def goto_nosw(page, url, timeout=30000):
    """Open ?nosw=1 and wait out the single automatic reload.

    The first load can paint the map before the kill switch reloads the tab.
    Wait until this scope has no registration and the page is uncontrolled.
    """
    page.goto(url, wait_until='load', timeout=timeout)
    wait_map(page, timeout=timeout)
    deadline = time.time() + timeout / 1000
    last = None
    while time.time() < deadline:
        try:
            done = page.evaluate("""async () => {
              if (!window.kitphonic || document.getElementById('map').hidden) return false;
              const path = new URL('.', location.href).pathname;
              const rs = await navigator.serviceWorker.getRegistrations();
              const mine = rs.some(r => new URL(r.scope).pathname === path);
              return !mine && !navigator.serviceWorker.controller;
            }""")
            if done:
                return
        except Exception as err:
            last = err
        time.sleep(0.1)
    raise TimeoutError(f'nosw did not settle this scope uncontrolled: {last}')


LESSON = '?sw=1&skipHello=1&activity=trace&gpc=s&reducedMotion=1'
ON_LESSON = "() => !document.getElementById('lesson').hidden"


def update_scenario(browser, base, net, label):
    old = scoped('/', json_cache())
    new = scoped('/', NEW_CACHE)
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
    if new in mid['caches'] and mid['caches'][new]['audio'] >= 830:
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
    if old not in wait_state['caches'] or wait_state['caches'].get(new, {}).get('audio', 0) < 830:
        problems.append(f'waiting caches {wait_state["caches"]}')

    # 4. Cold relaunch: every tab closed, then a new launch. The new worker activates and the old cache goes.
    page.close()
    time.sleep(1)
    page = context.new_page()
    watch(page, errs)
    page.goto(base + '?sw=1&skipHello=1', wait_until='load')
    page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=30000)
    after = poll(page, f"() => ({PROBE})().then(c => c === '{new}' ? c : null)", timeout=20)
    names = poll(page, f"() => caches.keys().then(n => n.length === 1 && n[0] === '{new}' ? n : null)", timeout=30)
    context.set_offline(True)
    page.reload(wait_until='load', timeout=30000)
    page.wait_for_function("() => window.kitphonic && !document.getElementById('map').hidden", timeout=30000)
    relaunch = {'controller': page.evaluate(PROBE), 'caches': page.evaluate(CACHES), 'offline_takes': page.evaluate(TAKES3)}
    print(label, 'update cold relaunch', relaunch)
    print(label, 'update errors', errs)
    if after != new or not names:
        problems.append(f'cold relaunch {after} {names} {relaunch}')
    if any(v.get('status') != 200 or v.get('bytes', 0) < 100 for v in relaunch['offline_takes'].values()):
        problems.append(f'relaunch takes {relaunch}')
    if errs:
        problems.append(errs)
    context.close()
    return problems


def offline_check(context, url):
    page = context.new_page()
    errs = []
    watch(page, errs)
    page.goto(url, wait_until='load', timeout=30000)
    page.wait_for_function("() => window.kitphonic && !document.getElementById('map').hidden", timeout=30000)
    out = {'controller': page.evaluate(PROBE), 'takes': page.evaluate(TAKES3), 'onLine': page.evaluate('() => navigator.onLine'), 'errors': errs}
    page.close()
    return out


def takes_ok(takes):
    return all(v.get('status') == 200 and v.get('bytes', 0) >= 100 for v in takes.values())


def two_sites_scenario(browser, root, net, label):
    """KP-QA-011 + KP-QA-010: /kitphonic/ and /kitphonic-dev/ on one origin keep separate caches."""
    build = json_cache()
    prod, dev = root + 'kitphonic/', root + 'kitphonic-dev/'
    prod_name, dev_name, dev_new = scoped('/kitphonic/', build), scoped('/kitphonic-dev/', build), scoped('/kitphonic-dev/', NEW_CACHE)
    problems = []
    context = browser.new_context()
    errs = []
    page = context.new_page()
    watch(page, errs)
    installed = {}
    for url, name in ((prod, prod_name), (dev, dev_name)):
        page.goto(url + '?sw=1&skipHello=1', wait_until='load')
        page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=30000)
        installed[url] = {'controller': page.evaluate(PROBE), **page.evaluate(WAIT_CACHE, name)}
    both = page.evaluate(CACHES)
    scopes = page.evaluate("() => navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => new URL(r.scope).pathname).sort())")
    print(label, 'two-sites installed', installed, 'scopes', scopes, 'caches', both)
    if installed[prod]['controller'] != prod_name or installed[dev]['controller'] != dev_name or not all(v['complete'] for v in installed.values()):
        problems.append(f'two-sites install {installed}')
    if sorted(both) != sorted([prod_name, dev_name]) or scopes != ['/kitphonic-dev/', '/kitphonic/']:
        problems.append(f'two-sites caches {both} {scopes}')

    # Update dev only (new build, full install, cold relaunch). Prod's cache must survive.
    net.bump(hold_after=None, prefix='/kitphonic-dev/')
    page.goto(dev + '?sw=1&skipHello=1', wait_until='load')
    page.evaluate("() => navigator.serviceWorker.getRegistration().then(r => { r.update().catch(() => {}); })")
    waiting = poll(page, "() => navigator.serviceWorker.getRegistration().then(r => !!r.waiting)", timeout=150, every=0.5)
    page.close()
    time.sleep(1)
    page = context.new_page()
    watch(page, errs)
    page.goto(dev + '?sw=1&skipHello=1', wait_until='load')
    page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=30000)
    switched = poll(page, f"() => ({PROBE})().then(c => c === '{dev_new}' ? c : null)", timeout=20)
    settled = poll(page, f"() => caches.keys().then(n => n.length === 2 && n.includes('{dev_new}') && n.includes('{prod_name}') ? n : null)", timeout=30)
    after = page.evaluate(CACHES)
    print(label, 'two-sites dev updated', {'waiting': waiting, 'dev_controller': switched, 'caches': after})
    if not waiting or switched != dev_new or not settled or after.get(prod_name, {}).get('audio', 0) < 830:
        problems.append(f'two-sites dev update {waiting} {switched} {after}')
    page.close()

    # Both deployments work offline.
    context.set_offline(True)
    off = {'prod': offline_check(context, prod + '?sw=1&skipHello=1'), 'dev': offline_check(context, dev + '?sw=1&skipHello=1')}
    print(label, 'two-sites offline', off)
    if off['prod']['controller'] != prod_name or off['dev']['controller'] != dev_new:
        problems.append(f'two-sites offline control {off}')
    for site in off.values():
        if not takes_ok(site['takes']) or site['onLine'] is not False or site['errors']:
            problems.append(f'two-sites offline {site}')
    context.set_offline(False)

    # ?nosw=1 on dev: dev unregisters and its caches go; prod stays registered, cached, and offline-ready.
    page = context.new_page()
    watch(page, errs)
    goto_nosw(page, dev + '?nosw=1&skipHello=1')
    cleared = poll(page, "() => Promise.all([navigator.serviceWorker.getRegistrations(), caches.keys()]).then(([rs, n]) => rs.length === 1 && n.length === 1 ? true : null)", timeout=20)
    kill = {
        'scopes': page.evaluate("() => navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => new URL(r.scope).pathname))"),
        'caches': page.evaluate(CACHES),
    }
    page.reload(wait_until='load')
    page.wait_for_function("() => !document.getElementById('map').hidden", timeout=20000)
    page.wait_for_timeout(500)
    kill['dev_controlled_after_reload'] = page.evaluate("() => !!navigator.serviceWorker.controller")
    kill['dev_registrations_after_reload'] = page.evaluate("() => navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => new URL(r.scope).pathname))")
    page.close()
    context.set_offline(True)
    kill['prod_offline'] = offline_check(context, prod + '?sw=1&skipHello=1')
    print(label, 'two-sites nosw on dev', kill)
    print(label, 'two-sites errors', errs)
    if not cleared or kill['scopes'] != ['/kitphonic/'] or list(kill['caches']) != [prod_name] or kill['caches'][prod_name]['audio'] < 830:
        problems.append(f'nosw kill {kill}')
    if kill['dev_controlled_after_reload'] or kill['dev_registrations_after_reload'] != ['/kitphonic/']:
        problems.append(f'nosw after reload {kill}')
    if kill['prod_offline']['controller'] != prod_name or not takes_ok(kill['prod_offline']['takes']) or kill['prod_offline']['errors']:
        problems.append(f'prod after dev nosw {kill["prod_offline"]}')
    if errs:
        problems.append(errs)
    context.close()
    net.__init__()
    return problems


def nosw_incomplete_scenario(browser, root, net, label):
    """One ?nosw=1 visit must delete an incomplete leftover from an aborted dev install."""
    build = json_cache()
    prod, dev = root + 'kitphonic/', root + 'kitphonic-dev/'
    prod_name, dev_name, dev_new = scoped('/kitphonic/', build), scoped('/kitphonic-dev/', build), scoped('/kitphonic-dev/', NEW_CACHE)
    mixed_legacy = 'kitphonic-bbbb0000bbbb0001'
    prod_partial = 'kitphonic:/kitphonic/:ffffffffffff'
    problems = []
    context = browser.new_context()
    errs = []
    page = context.new_page()
    watch(page, errs)
    installed = {}
    for url, name in ((prod, prod_name), (dev, dev_name)):
        page.goto(url + '?sw=1&skipHello=1', wait_until='load')
        page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=30000)
        installed[url] = {'controller': page.evaluate(PROBE), **page.evaluate(WAIT_CACHE, name)}
    if not all(v.get('complete') for v in installed.values()):
        problems.append(f'nosw-incomplete install {installed}')

    page.evaluate("""async ({ mixed, prodPartial, prodScope, devScope }) => {
      const mixedCache = await caches.open(mixed);
      await mixedCache.put(prodScope + 'index.html', new Response('x'));
      await mixedCache.put(devScope + 'js/app.js', new Response('x'));
      const partial = await caches.open(prodPartial);
      await partial.put(prodScope + 'index.html', new Response('x'));
    }""", {
        'mixed': mixed_legacy,
        'prodPartial': prod_partial,
        'prodScope': prod,
        'devScope': dev,
    })

    # Abort a dev update after 20 takes so an incomplete scoped cache remains.
    net.bump(hold_after=20, prefix='/kitphonic-dev/')
    page.goto(dev + '?sw=1&skipHello=1', wait_until='load')
    page.evaluate("() => navigator.serviceWorker.getRegistration().then(r => { r.update().catch(() => {}); })")
    deadline = time.time() + 60
    while net.audio <= 20 and time.time() < deadline:
        time.sleep(0.1)
    mid = page.evaluate(CACHES)
    net.drop()
    context.set_offline(True)
    gone = poll(page, "() => navigator.serviceWorker.getRegistration().then(r => !r.installing && !r.waiting)", timeout=60)
    leftover = page.evaluate(CACHES)
    print(label, 'nosw-incomplete mid-install', {'audio': net.audio, 'mid': mid, 'dropped': gone, 'leftover': leftover})
    if not gone:
        problems.append(f'nosw-incomplete install not dropped {leftover}')
    if dev_new not in leftover or leftover[dev_new].get('audio', 0) >= 830:
        problems.append(f'nosw-incomplete missing leftover {leftover}')
    if leftover.get(dev_name, {}).get('audio', 0) < 830 or leftover.get(prod_name, {}).get('audio', 0) < 830:
        problems.append(f'nosw-incomplete lost a complete cache {leftover}')

    net.restore()
    context.set_offline(False)

    # One user visit with ?nosw=1 (the page may auto-reload once). Do not navigate again before asserting.
    goto_nosw(page, dev + '?nosw=1&skipHello=1')
    kill = {
        'scopes': page.evaluate("() => navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => new URL(r.scope).pathname).sort())"),
        'caches': page.evaluate(CACHES),
        'controller': page.evaluate("() => !!navigator.serviceWorker.controller"),
    }
    print(label, 'nosw-incomplete after one pass', kill)
    print(label, 'nosw-incomplete errors', errs)
    names = list(kill['caches'])
    dev_left = [n for n in names if n.startswith('kitphonic:/kitphonic-dev/:')]
    if dev_left or kill['controller'] or kill['scopes'] != ['/kitphonic/']:
        problems.append(f'nosw-incomplete leftover after one pass {kill}')
    if kill['caches'].get(prod_name, {}).get('audio', 0) < 830:
        problems.append(f'nosw-incomplete touched prod {kill["caches"]}')
    if prod_partial not in names:
        problems.append(f'nosw-incomplete touched prod incomplete cache {names}')
    if mixed_legacy not in names:
        problems.append(f'nosw-incomplete touched unowned legacy {names}')
    if errs:
        problems.append(errs)

    page.close()
    context.set_offline(True)
    off = offline_check(context, prod + '?sw=1&skipHello=1')
    print(label, 'nosw-incomplete prod offline', off)
    if off['controller'] != prod_name or not takes_ok(off['takes']) or off['errors']:
        problems.append(f'nosw-incomplete prod offline {off}')
    context.close()
    net.__init__()
    return problems



OLD_KILLSWITCH = os.path.join(ROOT, 'tests/fixtures/sw-killswitch-e5e47a0c.js')
NEW_KILLSWITCH = os.path.join(ROOT, 'tools/sw-killswitch.js')
KILLSWITCH_WATCH_S = 30
DEV_MOUNT = '/kitphonic-dev/'


def attach_navs(page):
    navs = []
    def on_nav(frame):
        if frame == page.main_frame:
            navs.append({'t': time.time(), 'url': frame.url})
    page.on('framenavigated', on_nav)
    return navs


def wait_navs(seconds, navs=None, stop_after=None):
    deadline = time.time() + seconds
    while time.time() < deadline:
        if stop_after and navs is not None and len(navs) >= stop_after:
            return
        time.sleep(0.05)


def page_alive(page, expect_title=None):
    try:
        href = page.url
        title = page.evaluate('() => document.title')
        return {'ok': True, 'href': href, 'title': title, 'error': None}
    except Exception as err:
        return {'ok': False, 'href': getattr(page, 'url', ''), 'title': None, 'error': str(err)}


def _loop_client_proc(url, kind, result_path):
    """Open the repro page in a child browser so a tight reload loop can be killed."""
    script = (
        "import json, time\n"
        "from playwright.sync_api import sync_playwright\n"
        f"url = {url!r}\n"
        f"kind = {kind!r}\n"
        f"result_path = {result_path!r}\n"
        "kw = {'args': ['--no-sandbox']} if kind == 'chromium' else {}\n"
        "out = {'ok': False, 'href': '', 'title': '', 'error': None}\n"
        "try:\n"
        "    with sync_playwright() as p:\n"
        "        browser = getattr(p, kind).launch(**kw)\n"
        "        page = browser.new_context().new_page()\n"
        "        try:\n"
        "            page.goto(url, wait_until='commit', timeout=5000)\n"
        "        except Exception as err:\n"
        "            out['error'] = 'goto ' + str(err)\n"
        "        try:\n"
        "            out['href'] = page.url\n"
        "            out['title'] = page.title()\n"
        "            out['ok'] = True\n"
        "        except Exception as err:\n"
        "            out['error'] = (out['error'] or '') + ' read ' + str(err)\n"
        "        try:\n"
        "            open(result_path, 'w').write(json.dumps(out))\n"
        "        except Exception:\n"
        "            pass\n"
        "        time.sleep(60)\n"
        "except Exception as err:\n"
        "    out['error'] = str(err)\n"
        "    try:\n"
        "        open(result_path, 'w').write(json.dumps(out))\n"
        "    except Exception:\n"
        "        pass\n"
    )
    env = dict(os.environ)
    env.setdefault('PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS', '1')
    return Popen([sys.executable, '-c', script], cwd=ROOT, env=env, stdout=DEVNULL, stderr=DEVNULL, start_new_session=True)


def _stop_proc(proc, seconds=3):
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
    try:
        proc.wait(timeout=seconds)
    except Exception:
        pass


def _read_result(path):
    try:
        import json as _json
        return _json.loads(open(path, encoding='utf8').read())
    except Exception as err:
        return {'error': f'no child result: {err}'}


def killswitch_loop_watch(browser, root, net, label, template, expect_loop):
    """30 s watch of a page that re-registers sw.js like sw-register does.

    Navigations are counted from server hits to /repro.html, and the page
    itself runs in a child process so a tight loop can be killed. The
    e5e47a0c template must exceed 2 navigations (that is the loop this
    harness would fail). The current template must stay at at most 2.
    After the new template's watch, the server is dropped for 8 s to
    prove going offline does not start a loop or a chrome-error navigation.
    """
    problems = []
    name = 'old' if expect_loop else 'new'
    kind = getattr(getattr(browser, 'browser_type', None), 'name', None) or 'chromium'
    net.set_sw(DEV_MOUNT, template)
    net.clear_hits()
    url = root.rstrip('/') + DEV_MOUNT + 'repro.html?sw=1'
    result_path = os.path.join(os.environ.get('TMPDIR', '/tmp'), f'kp-killswitch-{kind}-{name}.json')
    try:
        os.remove(result_path)
    except FileNotFoundError:
        pass
    proc = _loop_client_proc(url, kind, result_path)
    deadline = time.time() + KILLSWITCH_WATCH_S
    while time.time() < deadline:
        if expect_loop and net.hit_count('/repro.html') >= 8:
            break
        if proc.poll() is not None:
            break
        time.sleep(0.05)
    mid_hits = net.hit_count('/repro.html')
    result = _read_result(result_path)
    print(label, f'killswitch-loop {name}', {
        'repro_hits': mid_hits, 'sw_hits': net.hit_count('/sw.js'),
        'client': 'exited' if proc.poll() is not None else 'running', 'result': result,
    }, flush=True)

    if expect_loop:
        if mid_hits <= 2:
            problems.append(
                f'old kill-switch template did not loop ({mid_hits} repro hits in {KILLSWITCH_WATCH_S}s); the harness would not have failed on e5e47a0c'
            )
        _stop_proc(proc)
        net.set_sw(DEV_MOUNT, None)
        net.clear_hits()
        return problems

    if mid_hits > 2:
        problems.append(f'new kill-switch template looped: {mid_hits} repro hits')

    # Going offline after the kill must not navigate again (the old loop landed on chrome-error).
    net.drop()
    time.sleep(8)
    hits = net.hit_count('/repro.html')
    print(label, f'killswitch-loop {name} offline-after', {
        'repro_hits': hits, 'at_offline': mid_hits, 'result': result,
    }, flush=True)
    if hits > mid_hits:
        problems.append(f'new kill-switch looped after going offline: {mid_hits} then {hits} repro hits')
    href = result.get('href') or ''
    title = result.get('title') or ''
    if result.get('ok') and ('chrome-error' in href or href.startswith('about:') or title != 'kill-switch loop repro'):
        problems.append(f'kill-switch page was already bad before offline {result}')
    net.restore()
    _stop_proc(proc)
    net.set_sw(DEV_MOUNT, None)
    net.clear_hits()
    return problems


def killswitch_scenario(browser, root, net, label):
    """Emergency kill switch: loop repro, offline after kill, restore, prod isolation."""
    problems = []
    problems += killswitch_loop_watch(browser, root, net, label, OLD_KILLSWITCH, expect_loop=True)
    problems += killswitch_loop_watch(browser, root, net, label, NEW_KILLSWITCH, expect_loop=False)

    build = json_cache()
    prod, dev = root + 'kitphonic/', root + 'kitphonic-dev/'
    prod_name, dev_name = scoped('/kitphonic/', build), scoped('/kitphonic-dev/', build)
    marker = 'kitphonic-killswitch:/kitphonic-dev/'
    context = browser.new_context()
    errs = []
    page = context.new_page()
    watch(page, errs)
    installed = {}
    for url, name in ((prod, prod_name), (dev, dev_name)):
        page.goto(url + '?sw=1&skipHello=1', wait_until='load')
        page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=30000)
        installed[url] = {'controller': page.evaluate(PROBE), **page.evaluate(WAIT_CACHE, name)}
    print(label, 'killswitch two-sites installed', installed)
    if installed[prod]['controller'] != prod_name or installed[dev]['controller'] != dev_name or not all(v['complete'] for v in installed.values()):
        problems.append(f'killswitch install {installed}')

    net.set_sw(DEV_MOUNT, NEW_KILLSWITCH)
    net.clear_hits()
    try:
        page.close()
    except Exception:
        pass
    kind = getattr(getattr(browser, 'browser_type', None), 'name', None) or 'chromium'
    probe = context.new_page()
    probe.goto(root + 'probe.html', wait_until='load', timeout=15000)
    # A client under the dev scope must exist so skipWaiting can finish activating.
    result_path = os.path.join(os.environ.get('TMPDIR', '/tmp'), f'kp-killswitch-app-{kind}.json')
    try:
        os.remove(result_path)
    except FileNotFoundError:
        pass
    started = time.time()
    proc = _loop_client_proc(dev + '?sw=1&skipHello=1', kind, result_path)
    try:
        probe.evaluate("""async () => {
          const r = await navigator.serviceWorker.getRegistration('/kitphonic-dev/');
          if (r) await r.update();
        }""")
    except Exception as err:
        print(label, 'killswitch update()', err, flush=True)
    ident = """async () => {
      const identify = async (worker) => {
        if (!worker) return null;
        return await new Promise(resolve => {
          const ch = new MessageChannel();
          ch.port1.onmessage = e => resolve(e.data || null);
          try { worker.postMessage({ type: 'kitphonic-killswitch' }, [ch.port2]); }
          catch (err) { resolve({ error: String(err) }); }
          setTimeout(() => resolve(null), 800);
        });
      };
      const rs = await navigator.serviceWorker.getRegistrations();
      const scopes = rs.map(r => new URL(r.scope).pathname).sort();
      const names = await caches.keys();
      const dev = rs.find(r => new URL(r.scope).pathname === '/kitphonic-dev/');
      const pieces = {
        installing: dev && dev.installing ? await identify(dev.installing) : null,
        waiting: dev && dev.waiting ? await identify(dev.waiting) : null,
        active: dev && dev.active ? await identify(dev.active) : null,
      };
      const kill = !!(pieces.active && pieces.active.killswitch === true);
      return { scopes, names, pieces, kill };
    }"""
    after = None
    deadline = time.time() + 30
    while time.time() < deadline:
        after = probe.evaluate(ident)
        if after.get('kill') is True:
            break
        time.sleep(0.2)
    print(label, 'killswitch after update', after, flush=True)
    # Finish the 30 s loop watch from the child start.
    while time.time() < started + KILLSWITCH_WATCH_S:
        if proc.poll() is not None:
            break
        time.sleep(0.05)
    doc_hits = net.hit_count_exact('/kitphonic-dev/', '/kitphonic-dev/index.html')
    print(label, 'killswitch after deploy child', {
        'doc_hits': doc_hits, 'sw_hits': net.hit_count('/kitphonic-dev/sw.js'),
        'client': 'exited' if proc.poll() is not None else 'running',
        'result': _read_result(result_path),
    }, flush=True)
    _stop_proc(proc)
    after = probe.evaluate(ident)
    print(label, 'killswitch after deploy', {'doc_hits': doc_hits, 'after': after}, flush=True)
    if doc_hits > 2:
        problems.append(f'killswitch app looped: {doc_hits} document hits')
    if '/kitphonic/' not in after['scopes'] or '/kitphonic-dev/' not in after['scopes']:
        problems.append(f'killswitch must stay registered and leave prod registered {after["scopes"]}')
    if after.get('kill') is not True:
        problems.append(f'killswitch did not identify itself {after}')
    names = after['names']
    if any(n.startswith('kitphonic:/kitphonic-dev/:') for n in names):
        problems.append(f'killswitch left a dev app cache {names}')
    if marker not in names:
        problems.append(f'killswitch missing marker {names}')
    if prod_name not in names:
        problems.append(f'killswitch dropped prod cache {names}')
    probe.close()

    # Prod must still work offline while the dev kill switch is deployed.
    context.set_offline(True)
    off = offline_check(context, prod + '?sw=1&skipHello=1')
    print(label, 'killswitch prod offline', off, flush=True)
    if off['controller'] != prod_name or not takes_ok(off['takes']) or off['errors']:
        problems.append(f'killswitch prod offline {off}')
    context.set_offline(False)

    # Restore the real sw.js. The real worker is an update, so it waits until a cold launch.
    net.set_sw(DEV_MOUNT, None)
    page = context.new_page()
    watch(page, errs)
    try:
        page.goto(dev + '?sw=1&skipHello=1', wait_until='commit', timeout=15000)
        page.evaluate("() => navigator.serviceWorker.getRegistration().then(r => { r.update().catch(() => {}); })")
        waiting = poll(page, "() => navigator.serviceWorker.getRegistration().then(r => !!r.waiting)", timeout=180, every=0.5)
    except Exception as err:
        waiting = f'error {err}'
    print(label, 'killswitch restore waiting', waiting, flush=True)
    try:
        page.close()
    except Exception:
        pass
    time.sleep(1)
    page = context.new_page()
    watch(page, errs)
    try:
        page.goto(dev + '?sw=1&skipHello=1', wait_until='commit', timeout=15000)
        page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=30000)
    except Exception as err:
        problems.append(f'killswitch restore goto {err}')
    switched = poll(page, f"() => ({PROBE})().then(c => c === '{dev_name}' ? c : null)", timeout=40)
    ready = page.evaluate(WAIT_CACHE, dev_name) if switched == dev_name else {'complete': False, 'controller': switched}
    names = page.evaluate("() => caches.keys()")
    print(label, 'killswitch restored', {'controller': switched, 'ready': ready, 'names': names}, flush=True)
    if switched != dev_name or not ready.get('complete'):
        problems.append(f'killswitch restore {switched} {ready}')
    if marker in names:
        problems.append(f'killswitch marker survived restore {names}')
    if prod_name not in names:
        problems.append(f'killswitch restore dropped prod {names}')
    page.close()
    context.set_offline(True)
    off_dev = offline_check(context, dev + '?sw=1&skipHello=1')
    off_prod = offline_check(context, prod + '?sw=1&skipHello=1')
    print(label, 'killswitch restored offline', {'dev': off_dev, 'prod': off_prod}, flush=True)
    if off_dev['controller'] != dev_name or not takes_ok(off_dev['takes']) or off_dev['errors']:
        problems.append(f'killswitch restored dev offline {off_dev}')
    if off_prod['controller'] != prod_name or not takes_ok(off_prod['takes']) or off_prod['errors']:
        problems.append(f'killswitch restored prod offline {off_prod}')
    if errs:
        # Filter noise from the mid-update navigation; keep hard failures.
        hard = [e for e in errs if 'net::ERR' not in str(e) and 'Failed to fetch' not in str(e) and 'Load failed' not in str(e)]
        if hard:
            problems.append(hard)
    context.close()
    net.__init__()
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
      const reg = await navigator.serviceWorker.getRegistration();
      const name = 'kitphonic:' + new URL(reg.scope).pathname + ':' + list.cache.slice('kitphonic-'.length);
      while (Date.now() < deadline) {
        const cache = await caches.open(name);
        const have = new Set((await cache.keys()).map(k => new URL(k.url).pathname));
        files = have.size;
        if ([...want].every(p => have.has(p))) {
          return { cache: name, files, audio: list.audio.length, shell: list.shell.length };
        }
        await new Promise(r => setTimeout(r, 100));
      }
      return { cache: name, files, audio: list.audio.length, shell: list.shell.length, timeout: true };
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
    goto_nosw(page, base + '?nosw=1&skipHello=1')
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
        net.__init__()
        problems += two_sites_scenario(browser, upd, net, 'WEBKIT')
        net.__init__()
        problems += nosw_incomplete_scenario(browser, upd, net, 'WEBKIT')
        net.__init__()
        problems += killswitch_scenario(browser, upd, net, 'WEBKIT')
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
            net.__init__()
            problems += two_sites_scenario(browser, upd, net, 'CHROMIUM')
            net.__init__()
            problems += nosw_incomplete_scenario(browser, upd, net, 'CHROMIUM')
            net.__init__()
            problems += killswitch_scenario(browser, upd, net, 'CHROMIUM')
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
