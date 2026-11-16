// Register sw.js only for the static site. The Capacitor wrapper and local harnesses stay on the network.
export function shouldRegisterServiceWorker({ hasServiceWorker = false, capacitor = false, protocol = '', hostname = '', search = '' } = {}) {
  if (!hasServiceWorker || capacitor || protocol === 'capacitor:') return false;
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (q.get('nosw') === '1') return false;
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && q.get('sw') !== '1') return false;
  return true;
}

// Script and scope come from this module's URL, so /kitphonic/ and /kitphonic-dev/ each get the
// directory that contains index.html, not the origin root.
export function registerServiceWorker({ navigator: nav = globalThis.navigator, location: loc = globalThis.location, capacitor = !!globalThis.Capacitor } = {}) {
  if (!nav || !loc || !shouldRegisterServiceWorker({
    hasServiceWorker: 'serviceWorker' in nav, capacitor, protocol: loc.protocol, hostname: loc.hostname, search: loc.search,
  })) return false;
  const script = new URL('../sw.js', import.meta.url);
  const scope = new URL('../', import.meta.url);
  try {
    nav.serviceWorker.register(script.href, { type: 'module', scope: scope.href, updateViaCache: 'none' }).catch(() => {});
  } catch { return false; }
  return true;
}
