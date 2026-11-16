#!/usr/bin/env python3
"""One online visit with ?sw=1, then a reload with the network off.

  python3 tools/offline-sw.py [--port 8159]

Chromium is required. WebKit is attempted and reported when this Playwright build
cannot install a service worker. Exit 0 when Chromium passes. A missing Playwright
install skips (exit 0), matching the other browser tools.
"""
import argparse, os, sys, time, urllib.request
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


def webkit(browser_type, base):
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
    browser.close()
    return problems


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8159)
    args = parser.parse_args()
    proc = serve(args.port)
    base = f'http://127.0.0.1:{args.port}/'
    try:
        wait_http(args.port)
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch()
            except Exception as err:
                print('SKIP chromium not installed', err)
                return 0
            problems = scenario(browser, base, 'CHROMIUM')
            browser.close()
            problems += webkit(p.webkit, base)
        if problems:
            print('FAIL', problems)
            return 1
        print('PASS')
        return 0
    finally:
        proc.terminate()
        try: proc.wait(timeout=5)
        except Exception: proc.kill()


if __name__ == '__main__':
    sys.exit(main())
