// In-page no-overlap audit (runs inside page.evaluate). Vinh, Nov 20: "things cannot overlap".
// Returns findings { check, element, value } for the visible screen (or the Grown-ups / picture-check overlay when open):
//   overlap        two content elements (controls, words, bubbles, Kit, cards) whose boxes intersect, neither inside the other
//   clipped        a content element cut off by the safe rect or by an ancestor that clips without scrolling
//   text-clipped   an element's own text runs outside a box that clips it
//   bubble-scroll  a child-facing bubble needs scrolling to show its words (a collapsed bubble)
//   paw-detached   Hello: Kit's waving paw does not touch Kit
// Things in a scroll box (the Grown-ups columns) may sit below the fold: the box is checked instead, and must not
// have anything else on top of it. Decorations that sit on purpose over their own control are not elements here
// (pseudo-elements), and the pointing-hand hint is a transient overlay, so it is skipped.
export function overlapAudit({ safe = { top: 0, right: 0, bottom: 0, left: 0 }, tol = 1.5 } = {}) {
  const vw = innerWidth, vh = innerHeight;
  const S = { left: safe.left, top: safe.top, right: vw - safe.right, bottom: vh - safe.bottom };
  const out = [];
  const r1 = (n) => Math.round(n);
  const name = (el) => {
    if (el.id) return `#${el.id}`;
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const host = el.parentElement?.closest('[id]');
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('').slice(0, 16);
    return `${host ? `#${host.id} ` : ''}${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? `"${txt}"` : ''}`;
  };
  const shown = (el) => {
    if (el.closest('[hidden]')) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };
  // Opaque full-screen overlays (Grown-ups, the picture check over the word screen) are the screen when open.
  const overlay = ['parent', 'check'].map((id) => document.getElementById(id)).find((e) => e && shown(e));
  const root = overlay
    || [...document.querySelectorAll('#stage > .screen')].find((s) => !s.hidden && getComputedStyle(s).display !== 'none' && s.id !== 'parent');
  if (!root) return [{ check: 'screen', element: 'none', value: 'no visible screen' }];
  const SKIP = '.ghosthand, #l-hand, .caption, #tracelog, svg *, #review-tag, .confetti, .confetti *, [aria-hidden="true"].deco';
  const CTRL = 'button, [role="button"], [role="slider"], [data-dropslot], #tiles > *, #l-arena > *, #m-stops > .stop, #st-cards > *, #sn-tiles > *, #fm-tiles > *, .ftile';
  const FIG = '.bubble, .mascot > svg, .kitwrap > svg:first-child, .mkit, #done-kit, .tcard, .icard, .ipic, #card, #sn-card, #fm-card, .tray, .ear, .peb, .pcol, .ptile';
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const all = [...root.querySelectorAll('*')].filter((el) => !el.closest(SKIP) && (el.matches(CTRL) || el.matches(FIG) || ownText(el)) && shown(el));
  // Box to compare: an inline text element is its text, a block is its border box.
  // A bare label (own text, no fill, no border, not a control) is its text: its empty box is not drawn.
  const bare = (el) => { const cs = getComputedStyle(el); return !el.matches(CTRL) && !el.matches(FIG) && (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent') && cs.backgroundImage === 'none' && !(parseFloat(cs.borderTopWidth) > 0) && !(parseFloat(cs.borderBottomWidth) > 0); };
  const boxOf = (el) => {
    if (ownText(el) && (getComputedStyle(el).display === 'inline' || bare(el))) { const rg = document.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect(); }
    return el.getBoundingClientRect();
  };
  const clipper = (el) => { // nearest ancestor that clips: { el, scrolls }
    for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const ox = cs.overflowX, oy = cs.overflowY;
      if (/(auto|scroll)/.test(ox + oy)) return { el: e, scrolls: true };
      if (/(hidden|clip)/.test(ox + oy)) return { el: e, scrolls: false };
    }
    return null;
  };
  const scrollerOf = (el) => { for (let c = clipper(el); c; c = clipper(c.el)) if (c.scrolls) return c.el; return null; };
  const items = all.map((el) => ({ el, r: boxOf(el), sc: scrollerOf(el) }));
  // visible part of an element inside its scroller (below-the-fold rows are not "under" anything)
  const vis = (it) => {
    if (!it.sc) return it.r;
    const s = it.sc.getBoundingClientRect();
    return { left: Math.max(it.r.left, s.left), top: Math.max(it.r.top, s.top), right: Math.min(it.r.right, s.right), bottom: Math.min(it.r.bottom, s.bottom) };
  };
  // 1. overlap
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j];
    if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
    const a = vis(A), b = vis(B);
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > tol && h > tol) out.push({ check: 'overlap', element: `${name(A.el)} / ${name(B.el)}`, value: `${r1(w)}x${r1(h)}` });
  }
  // 2. clipped (by the safe rect or a non-scrolling clipping ancestor); scroll boxes are checked themselves
  const boxes = new Set(items.filter((it) => it.sc).map((it) => it.sc));
  const clipChecks = [...items.filter((it) => !it.sc).map((it) => [it.el, it.r]), ...[...boxes].map((b) => [b, b.getBoundingClientRect()])];
  for (const [el, r] of clipChecks) {
    const bad = [];
    if (r.left < S.left - tol) bad.push(`left ${r1(r.left)}<${r1(S.left)}`);
    if (r.top < S.top - tol) bad.push(`top ${r1(r.top)}<${r1(S.top)}`);
    if (r.right > S.right + tol) bad.push(`right ${r1(r.right)}>${r1(S.right)}`);
    if (r.bottom > S.bottom + tol) bad.push(`bottom ${r1(r.bottom)}>${r1(S.bottom)}`);
    const c = clipper(el);
    if (c && !c.scrolls && c.el !== document.body) {
      const p = c.el.getBoundingClientRect();
      if (r.left < p.left - tol || r.top < p.top - tol || r.right > p.right + tol || r.bottom > p.bottom + tol) bad.push(`outside ${name(c.el)}`);
    }
    if (bad.length) out.push({ check: 'clipped', element: name(el), value: bad.join(', ') });
  }
  // 3. own text outside a box that clips it
  for (const { el } of items) {
    if (!ownText(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    if (/(auto|scroll)/.test(cs.overflowY) && el.closest('#parent')) continue;
    const rg = document.createRange(); rg.selectNodeContents(el); const t = rg.getBoundingClientRect(), b = el.getBoundingClientRect();
    if (t.left < b.left - 2 || t.right > b.right + 2 || t.top < b.top - 2 || t.bottom > b.bottom + 2) out.push({ check: 'text-clipped', element: name(el), value: `text ${r1(t.width)}x${r1(t.height)} in ${r1(b.width)}x${r1(b.height)}` });
  }
  // 4. child-facing bubbles show all their words (no collapsed / scrolling bubble)
  if (root.id !== 'parent') for (const el of root.querySelectorAll('.bubble')) { // child-facing
    if (!shown(el)) continue;
    if (el.scrollHeight > el.clientHeight + 2) out.push({ check: 'bubble-scroll', element: name(el), value: `${el.scrollHeight}>${el.clientHeight}` });
  }
  // 5. Hello: the paw stays on Kit
  const paw = root.querySelector('#hello .paw'), kit = root.querySelector('#hello .kitwrap > svg:first-child');
  if (paw && kit && shown(paw)) {
    const a = paw.getBoundingClientRect(), b = kit.getBoundingClientRect();
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) < 1 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) < 1) out.push({ check: 'paw-detached', element: '#hello .paw', value: 'paw does not touch Kit' });
  }
  return out;
}
