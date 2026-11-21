import { test, expect } from '@playwright/test';
import { WORDS } from '../../js/content.js';
import { needsCheck, wordCards, rng } from '../../js/word-logic.js';

// KP-BUG-003 miss-then-replay sweep, ported from the Test Engineer's harness
// (/workspace/kitphonic-qa/KP-BUG-003/scripts/miss-replay-sweep.py + list-check-words.mjs).
// The bug: after a wrong pick, reshuffle() dropped the `cards` flag, so a word-card check came back as
// "Which picture?" with identical ⭐ tiles. For EVERY word-card word in js/content.js (no list to maintain):
//   first show -> "Which word did you read?", distinct printed words; miss -> the check comes back the same way;
//   miss twice -> still word cards; then the right card -> picked / reveal.
// Picture-check controls (mat, map, cats) must stay distinct pictures after a miss.

const cfg = { checkPictureWords: true, checkAtL1: false, wordCardCheck: true, choicesPerCheck: 3 };
const seen = new Set();
const wordCardWords = [];
for (const e of Object.values(WORDS).flat()) {
  if (seen.has(e.w)) continue;
  if (needsCheck(e, cfg, e.level)) continue;
  let cards = null; try { cards = wordCards(e.w, { rand: rng(1), n: 3 }); } catch { cards = null; }
  if (!cards) continue;
  seen.add(e.w); wordCardWords.push([e.w, e.level]);
}
const PIC_CONTROLS = [['mat', 2], ['map', 2], ['cats', 7]];

test.use({ serviceWorkers: 'block' });

const snap = (page) => page.evaluate(() => {
  const s = window.kitphonic.screen;
  const buttons = [...document.querySelectorAll('#choices button.choice')];
  return {
    state: s.state,
    cards: !!s.choices?.cards,
    prompt: (document.getElementById('check-bubble')?.textContent || '').trim(),
    glyphs: buttons.map((b) => (b.querySelector('.emoji')?.textContent || b.innerText || b.innerHTML).trim()),
  };
});

async function showCheck(page) {
  await page.evaluate(() => window.kitphonic.screen.debugShow('check'));
  await page.waitForFunction(() => { const c = document.getElementById('check'); return c && !c.hidden && window.kitphonic.screen.state === 'check'; }, null, { timeout: 8_000 });
  await page.waitForSelector('#choices button.choice', { state: 'attached', timeout: 8_000 });
}
async function pick(page, word, right) {
  const r = await page.evaluate(([word, right]) => {
    const b = [...document.querySelectorAll('#choices button.choice')].find((x) => (right ? x.dataset.w === word : x.dataset.w !== word));
    if (!b) return null; b.click(); return b.dataset.w;
  }, [word, right]);
  expect(r, `a ${right ? 'right' : 'wrong'} card for ${word}`).toBeTruthy();
  if (!right) await page.waitForFunction(() => document.getElementById('check').hidden, null, { timeout: 8_000 });
}
const problems = (s, kind) => {
  const out = [];
  const stars = s.glyphs.length > 0 && s.glyphs.every((g) => /⭐|🌟/.test(g));
  if (kind === 'cards') {
    if (s.prompt !== 'Which word did you read?') out.push(`prompt "${s.prompt}"`);
    if (!s.cards) out.push('cards flag dropped');
  } else if (s.prompt !== 'Which picture?' || s.cards) out.push(`prompt "${s.prompt}" cards=${s.cards}`);
  if (stars) out.push('every tile is a star');
  if (new Set(s.glyphs).size < Math.min(2, s.glyphs.length)) out.push(`tiles not distinct: ${JSON.stringify(s.glyphs)}`);
  return out;
};

async function sweepWord(page, word, level, kind) {
  await page.goto(`/?skipHello=1&reducedMotion=1&direct=1&level=${level}&word=${word}&seed=1&support=3`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.kitphonic?.screen?.entry, null, { timeout: 20_000 });
  const found = [];
  await showCheck(page);
  found.push(...problems(await snap(page), kind).map((p) => `first show: ${p}`));
  await pick(page, word, false);
  await showCheck(page);
  found.push(...problems(await snap(page), kind).map((p) => `after 1 miss: ${p}`));
  if (kind === 'cards') {
    await pick(page, word, false);
    await showCheck(page);
    found.push(...problems(await snap(page), kind).map((p) => `after 2 misses: ${p}`));
  }
  await pick(page, word, true);
  await expect.poll(() => page.evaluate(() => window.kitphonic.screen.state), { timeout: 10_000 }).toMatch(/^(picked|revealed|done)$/);
  return found;
}

const CHUNK = 12;
for (let i = 0; i < wordCardWords.length; i += CHUNK) {
  const chunk = wordCardWords.slice(i, i + CHUNK);
  test(`KP-BUG-003 word cards stay word cards after a miss: ${chunk.map(([w]) => w).join(', ')}`, async ({ page }) => {
    test.setTimeout(30_000 + chunk.length * 10_000);
    const bad = [];
    for (const [w, level] of chunk) for (const p of await sweepWord(page, w, level, 'cards')) bad.push(`${w} (L${level}) ${p}`);
    expect(bad).toEqual([]);
  });
}

test(`KP-BUG-003 picture-check controls stay distinct pictures after a miss: ${PIC_CONTROLS.map(([w]) => w).join(', ')}`, async ({ page }) => {
  const bad = [];
  for (const [w, level] of PIC_CONTROLS) for (const p of await sweepWord(page, w, level, 'picture')) bad.push(`${w} (L${level}) ${p}`);
  expect(bad).toEqual([]);
});

test('KP-BUG-003 sweep covers every word-card word', () => {
  expect(wordCardWords.length, 'word-card words found in js/content.js').toBeGreaterThan(100);
});
