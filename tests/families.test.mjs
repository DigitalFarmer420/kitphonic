import test from 'node:test';
import assert from 'node:assert/strict';
import { servableFamilies, FAMILY_MAX } from '../js/families.js';
import { configFromUrl, CONFIG } from '../js/config.js';
import { planSession } from '../js/session.js';
import { seedProgress } from '../js/dev-seed.js';
import { STOPS } from '../js/progress.js';
import { rng } from '../js/word-logic.js';

test('Uiux rc1: family choices capped (default 4 <= 5), configurable via ?familyMax=', () => {
  assert.ok(CONFIG.familyMax <= 5 && CONFIG.familyMax === FAMILY_MAX);
  assert.ok(servableFamilies().every(f => f.words.length <= CONFIG.familyMax));
  assert.equal(Math.max(...servableFamilies(undefined, 7).map(f => f.words.length)), 7);
  assert.equal(configFromUrl('?familyMax=6').familyMax, 6);
  assert.equal(configFromUrl('?familyMax=99').familyMax, 7);
  assert.equal(configFromUrl('?familyMax=1').familyMax, 2);
});
test('planner passes the family cap through', () => {
  const now = Date.UTC(2026, 9, 30, 17), log = seedProgress(STOPS.length, { now });
  for (const m of [2, 3, 7]) {
    const fam = planSession(log, { now, rand: rng(2), minutes: 10, familyMax: m }).items.find(i => i.type === 'family');
    assert.ok(fam, 'a family is planned'); assert.ok(fam.family.words.length <= m && fam.family.words.length >= 2);
  }
});
