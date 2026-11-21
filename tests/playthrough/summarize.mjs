// Markdown summary of a playthrough report (tests/playthrough/full-playthrough.spec.js): per stop group, then the
// failure if any.   node tests/playthrough/summarize.mjs <report.json>
import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const passed = new Map(r.stops.map((s) => [s.id, s]));
// groups: each words/story stop closes a group with the sound stops before it
const groups = []; let g = [];
for (const s of r.map ?? []) { g.push(s); if (s.kind !== 'sound') { groups.push(g); g = []; } }
if (g.length) groups.push(g);
const mins = (t) => `${Math.round(t / 6) / 10} min`;
const lines = [`## Full playthrough: ${r.result.toUpperCase()}`, '', `${r.browser}, ${r.wrong ? `realistic child (${r.wrong} wrong first)` : 'perfect child'}, ${r.sessions.length} sessions, ${passed.size}/56 stops, base ${r.base}`, '',
  '| Stops | Result | Sessions | Time |', '|---|---|---|---|'];
for (const grp of groups) {
  const ok = grp.every((s) => passed.has(s.id)), bad = grp.some((s) => s.id === r.failure?.stop), some = grp.some((s) => passed.has(s.id));
  const sess = grp.reduce((a, s) => a + (passed.get(s.id)?.sessions ?? 0), 0), secs = grp.reduce((a, s) => a + (passed.get(s.id)?.secs ?? 0), 0);
  lines.push(`| ${grp.map((s) => s.kind === 'sound' ? s.label : s.kind === 'story' ? `story "${s.title ?? s.label}"` : `word ${s.label}`).join(', ')} | ${ok ? 'pass' : bad ? '**FAIL**' : some ? 'in progress' : 'not reached'} | ${sess || '-'} | ${secs ? mins(secs) : '-'} |`);
}
if (r.failure) lines.push('', `**First failure:** ${r.why}`, '', '```', JSON.stringify(r.failure.evidence ?? {}, null, 1), JSON.stringify(r.failure.state ?? {}), ...(r.failure.console ?? []).slice(-10), '```');
console.log(lines.join('\n'));
