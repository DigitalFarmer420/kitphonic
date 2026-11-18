// In-page Uiux audit. Runs inside the page (page.evaluate) and returns findings:
//   { check, element, value }  — one per problem, measured in CSS px at the current viewport.
// Rules (Uiux, Nov 17): no horizontal scroll; nothing clipped outside the viewport / safe rect; tap targets
// >= 64 px child, >= 80 px knob, >= 44 px grown-up; no overlapping hit areas; no text overflow or ellipsis on
// child-facing words; Kit and Play never overlap another key control; controls 3:1 against their background.
export function audit({ safe }) {
  const vw = innerWidth, vh = innerHeight;
  const S = { left: safe.left, top: safe.top, right: vw - safe.right, bottom: vh - safe.bottom };
  const out = [];
  const px = (n) => Math.round(n * 10) / 10;
  const name = (el) => {
    if (el.id) return `#${el.id}`;
    const lab = el.getAttribute('aria-label');
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const host = el.closest('[id]');
    return `${host && host !== el ? `#${host.id} ` : ''}${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${lab ? `[${lab}]` : ''}`;
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
  const inScroller = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) return e;
    }
    return null;
  };
  const screen = [...document.querySelectorAll('.screen')].find((s) => !s.hidden && getComputedStyle(s).display !== 'none');
  if (!screen) return [{ check: 'screen', element: 'none', value: 'no visible .screen' }];
  const grownUp = (el) => !!el.closest('#parent') || el.id === 'm-gear';

  // 1. horizontal scroll
  const se = document.scrollingElement || document.documentElement;
  if (se.scrollWidth > vw + 1) out.push({ check: 'horizontal-scroll', element: 'document', value: `scrollWidth ${se.scrollWidth} > ${vw}` });

  // 2. controls and tap sizes
  const CTRL = 'button, [role="slider"], [role="button"], [data-dropslot], #tiles > *, #l-arena > *, #m-stops > *, #st-cards > *, #sn-tiles > *, #fm-tiles > *';
  const ctrls = [...screen.querySelectorAll(CTRL)].filter((el) => shown(el) && getComputedStyle(el).pointerEvents !== 'none' && !el.disabled)
    .filter((el, i, all) => !all.some((o) => o !== el && o.contains(el)))
    .filter((el) => { // reachable: something at its centre is the control itself (a covered control cannot be tapped)
      const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x > vw || y > vh) return true; // off screen: the clipping check reports it
      const hit = document.elementFromPoint(x, y); return !!hit && (hit === el || el.contains(hit));
    });
  for (const el of ctrls) {
    const r = el.getBoundingClientRect();
    const kind = el.getAttribute('role') === 'slider' ? 'knob' : grownUp(el) ? 'grown-up' : 'child';
    const min = kind === 'knob' ? 80 : kind === 'grown-up' ? 44 : 64;
    const side = Math.min(r.width, r.height);
    if (side + 0.5 < min) out.push({ check: `tap-size-${kind}`, element: name(el), value: `${px(r.width)}x${px(r.height)} < ${min}` });
  }
  // overlapping hit areas (two controls whose boxes intersect)
  for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
    const a = ctrls[i].getBoundingClientRect(), b = ctrls[j].getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 1 && h > 1) out.push({ check: 'hit-overlap', element: `${name(ctrls[i])} / ${name(ctrls[j])}`, value: `${px(w)}x${px(h)} px overlap` });
  }

  // 3. clipped outside the viewport / safe rect (controls, words, Kit, cards, bubbles)
  const KEY = `${CTRL}, .bubble, .mascot > svg, .kitwrap, .tcard, #card, #sn-card, #fm-card, .L, .cword, .starchip, h1`;
  const keysScrollers = new Set();
  const keys = [...screen.querySelectorAll(KEY)].filter(shown);
  for (const el of keys.slice()) { const sc = inScroller(el); if (sc && !keys.includes(sc)) keys.push(sc); }
  for (const el of keys) {
    const sc = inScroller(el);
    if (sc) { keysScrollers.add(sc); continue; } // inside a scroll box: the child scrolls into view; the box itself is checked
    const r = el.getBoundingClientRect();
    const bad = [];
    if (r.left < S.left - 1) bad.push(`left ${px(r.left)} < ${S.left}`);
    if (r.top < S.top - 1) bad.push(`top ${px(r.top)} < ${S.top}`);
    if (r.right > S.right + 1) bad.push(`right ${px(r.right)} > ${S.right}`);
    if (r.bottom > S.bottom + 1) bad.push(`bottom ${px(r.bottom)} > ${S.bottom}`);
    if (bad.length) out.push({ check: (r.left < 0 || r.top < 0 || r.right > vw + 1 || r.bottom > vh + 1) ? 'clipped-viewport' : 'clipped-safe-area', element: name(el), value: bad.join(', ') });
  }

  // 4. text overflow / ellipsis on child-facing words (grown-ups text is not child-facing). Measures the element's own
  // text (a Range over its text nodes), so badges and emoji placed outside on purpose do not count.
  const TEXT = '.bubble, .L, .cword, .wcard, .starbig, .starchip, button, #check-word, #tiles > *, #sn-strip > *';
  for (const el of screen.querySelectorAll(TEXT)) {
    if (!shown(el) || grownUp(el)) continue;
    const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!texts.length) continue;
    const cs = getComputedStyle(el); const box = el.getBoundingClientRect();
    const rg = document.createRange(); rg.setStartBefore(texts[0]); rg.setEndAfter(texts.at(-1));
    const t = rg.getBoundingClientRect();
    const word = `"${el.textContent.trim().slice(0, 40)}"`;
    const clips = cs.overflowX !== 'visible';
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push({ check: 'text-ellipsis', element: name(el), value: `${word} ${el.scrollWidth}>${el.clientWidth}` });
    else if (t.left < box.left - 2 || t.right > box.right + 2) out.push({ check: clips ? 'text-clipped' : 'text-overflow', element: name(el), value: `${word} text ${Math.round(t.width)} px wide in a ${Math.round(box.width)} px box` });
    else if (clips && (t.top < box.top - 2 || t.bottom > box.bottom + 2) && cs.overflowY !== 'visible') out.push({ check: 'text-clipped', element: name(el), value: `${word} text ${Math.round(t.height)} px tall in a ${Math.round(box.height)} px box` });
    if (t.left < -1 || t.top < -1 || t.right > vw + 1 || t.bottom > vh + 1) out.push({ check: 'text-clipped-viewport', element: name(el), value: `${word} at ${Math.round(t.left)},${Math.round(t.top)}-${Math.round(t.right)},${Math.round(t.bottom)}` });
  }

  // 5. Kit and Play never overlap another key control
  const kit = [...screen.querySelectorAll('.kitwrap > svg:first-child, .mascot > svg, .mkit, #done-kit, .lv-kit svg')].filter(shown);
  const play = [...screen.querySelectorAll('#play, #go')].filter(shown);
  for (const k of [...kit, ...play]) {
    const a = k.getBoundingClientRect();
    for (const c of ctrls) {
      if (c === k || c.contains(k) || k.contains(c)) continue;
      const b = c.getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 1 && h > 1) out.push({ check: play.includes(k) ? 'play-overlap' : 'kit-overlap', element: `${name(k)} / ${name(c)}`, value: `${px(w)}x${px(h)} px` });
    }
  }

  // 6. control contrast >= 3:1 (filled control vs what is behind it, or its border)
  const rgba = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
  const behind = (el) => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradient or image: not measurable here
      const c = rgba(cs.backgroundColor); if (c && c.a >= 0.99) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  for (const el of ctrls) {
    const cs = getComputedStyle(el); const bg = rgba(cs.backgroundColor); const under = behind(el);
    if (!under || cs.backgroundImage !== 'none') continue;
    if (bg && bg.a >= 0.99) {
      const r1 = ratio(bg, under);
      const bw = parseFloat(cs.borderTopWidth) || 0; const bc = rgba(cs.borderTopColor);
      const r2 = bw >= 1 && bc && bc.a >= 0.99 ? ratio(bc, under) : 0;
      if (Math.max(r1, r2) < 3) out.push({ check: 'contrast-control', element: name(el), value: `${Math.max(r1, r2).toFixed(2)}:1 (fill ${cs.backgroundColor} on ${`rgb(${under.r}, ${under.g}, ${under.b})`}${r2 ? `, border ${cs.borderTopColor}` : ''}) < 3:1` });
    }
  }
  return out;
}

// Text contrast from axe-core's color-contrast rule (handles stacking and backgrounds), held to 4.5:1 for ALL
// text (Uiux), stricter than WCAG AA's 3:1 for large text. axe "incomplete" nodes (gradient / image behind
// the text) are reported as contrast-unmeasured, not as failures.
export async function axeText(page, axePath) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: ['color-contrast'], resultTypes: ['passes', 'violations', 'incomplete'] });
    const out = [];
    for (const [bucket, list] of [['passes', res.passes], ['violations', res.violations], ['incomplete', res.incomplete]]) {
      for (const rule of list) for (const n of rule.nodes) {
        const d = (n.any[0] || n.all[0] || n.none[0] || {}).data || {};
        const target = n.target.join(' ');
        if (bucket === 'incomplete') { out.push({ check: 'contrast-text-unmeasured', element: target, value: d.messageKey || 'background not measurable', info: true }); continue; }
        if (typeof d.contrastRatio === 'number' && d.contrastRatio < 4.5) out.push({ check: 'contrast-text', element: target, value: `${d.contrastRatio}:1 (${d.fgColor} on ${d.bgColor}, ${d.fontSize} ${d.fontWeight}) < 4.5:1` });
      }
    }
    return out;
  });
}
