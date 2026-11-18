// Builds the sticky PR comment (markdown on stdout) from the run's artifacts.
//   node tests/ci/summarize.mjs <artifacts-dir> [jobs.json]
// jobs.json is the Actions "list jobs for a run" response; without it only the test tables are printed.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [dir = 'artifacts', jobsFile] = process.argv.slice(2);
const RUN_URL = process.env.RUN_URL || '';
const files = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : [p]; }) : []);
const all = files(dir);
const read = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

// Playwright JSON reports -> per-group stats and flaky / retried tests
const reports = {};
const flaky = [];
for (const p of all.filter((f) => /\/ci-[^/]+\.json$/.test(f))) {
  const r = read(p); if (!r?.stats) continue;
  const group = p.match(/ci-([^/]+)\.json$/)[1];
  reports[group] = r.stats;
  const walk = (s, path) => {
    for (const spec of s.specs || []) for (const t of spec.tests || []) {
      if (t.status === 'flaky') flaky.push(`${group} · [${t.projectName}] ${[...path, spec.title].join(' › ')} (passed on retry ${t.results.length - 1})`);
    }
    for (const c of s.suites || []) walk(c, [...path, c.title].filter((x) => x && !/\.spec\.js$/.test(x)));
  };
  for (const s of r.suites || []) walk(s, []);
}
const stat = (s) => (s ? `${s.expected} passed, ${s.unexpected} failed, ${s.flaky} flaky, ${s.skipped} skipped` : '');
const groupFor = (name) => {
  const m = name.match(/^e2e \((\d)/); if (m) return `e2e-${m[1]}`;
  const v = name.match(/^visual \((\w+)\)/); if (v) return `visual-${v[1]}`;
  const u = name.match(/^uiux report-only \((\w+)\)/); if (u) return `uiux-${u[1]}`;
  return name;
};

const out = ['<!-- kitphonic-pr-checks -->'];
out.push(`## Kitphonic PR checks${process.env.HEAD_SHA ? ` · \`${process.env.HEAD_SHA.slice(0, 7)}\`` : ''}`);
out.push('');
const jobs = jobsFile ? (read(jobsFile)?.jobs || []).filter((j) => j.name !== 'summary') : [];
if (jobs.length) {
  out.push('| Check | Result | Time | Tests |', '|---|---|---|---|');
  const icon = (c) => ({ success: '✅ pass', failure: '❌ fail', cancelled: '⏹ cancelled', skipped: '⏭ skipped' }[c] || `⏳ ${c || 'running'}`);
  for (const j of jobs.sort((a, b) => a.name.localeCompare(b.name))) {
    const secs = j.started_at && j.completed_at ? Math.round((new Date(j.completed_at) - new Date(j.started_at)) / 1000) : null;
    const g = groupFor(j.name); const st = reports[g];
    let result = icon(j.conclusion);
    if (/^uiux/.test(j.name)) result = st && st.unexpected ? `⚠️ ${st.unexpected} with findings (report-only)` : `${icon(j.conclusion)} (report-only)`;
    out.push(`| [${esc(j.name)}](${j.html_url}) | ${result} | ${secs == null ? '' : `${Math.floor(secs / 60)}m ${secs % 60}s`} | ${stat(st)} |`);
  }
  out.push('');
}
out.push(flaky.length ? `**Retried (flaky) tests: ${flaky.length}**\n${flaky.map((f) => `- ${esc(f)}`).join('\n')}\n` : '**Retried (flaky) tests:** none\n');

// Uiux findings (report-only)
const rows = all.filter((f) => /uiux-findings\/[^/]+\.json$/.test(f)).flatMap((p) => read(p) || []).filter((r) => !r.info);
if (all.some((f) => /uiux-findings\//.test(f))) {
  const byCheck = {};
  for (const r of rows) byCheck[r.check] = (byCheck[r.check] || 0) + 1;
  out.push(`### Uiux findings (report-only): ${rows.length}`);
  if (rows.length) {
    out.push(Object.entries(byCheck).sort((a, b) => b[1] - a[1]).map(([k, v]) => `\`${k}\` ${v}`).join(' · '), '');
    const groups = new Map();
    for (const r of rows) {
      const k = `${r.check}|${r.screen}|${r.element}`;
      const g = groups.get(k) || { ...r, browsers: new Set(), viewports: new Set(), n: 0 };
      g.browsers.add(r.browser); g.viewports.add(r.viewport); g.n++; groups.set(k, g);
    }
    const list = [...groups.values()].sort((a, b) => a.check.localeCompare(b.check) || b.n - a.n);
    const cap = +(process.env.FINDINGS_CAP || 40);
    out.push('<details><summary>Findings by check, screen and element</summary>', '', '| Check | Screen | Element | Browsers | Viewports | Measured (example) |', '|---|---|---|---|---|---|');
    for (const g of list.slice(0, cap)) out.push(`| ${g.check} | ${g.screen} | \`${esc(g.element)}\` | ${[...g.browsers].join(', ')} | ${[...g.viewports].join(', ')} | ${esc(g.value)} |`);
    if (list.length > cap) out.push(`| … | | ${list.length - cap} more in the uiux-* artifacts | | | |`);
    out.push('', '</details>', '');
  }
}

// Screenshot diff against the base branch
const diffs = all.filter((f) => /diff-vs-base[^/]*\/[^/]+\/summary\.json$/.test(f) || /diff-vs-base\/(webkit|chromium)\/summary\.json$/.test(f)).flatMap((p) => read(p) || []);
if (diffs.length) {
  const changed = diffs.filter((d) => d.changedPixels > 0), errs = diffs.filter((d) => d.error);
  out.push(`### Screenshot diff vs base: ${changed.length} of ${diffs.length} screenshots changed${errs.length ? `, ${errs.length} could not be taken` : ''}`);
  if (changed.length || errs.length) {
    out.push('<details><summary>Changed screenshots (marked.png has a red box around each changed region)</summary>', '', '| Browser | Size | Screen | Changed px | Regions |', '|---|---|---|---|---|');
    for (const d of [...changed].sort((a, b) => b.changedPixels - a.changedPixels).slice(0, 60)) out.push(`| ${d.browser} | ${d.size} | ${d.screen} | ${d.changedPixels} (${(d.ratio * 100).toFixed(2)}%) | ${d.regions} |`);
    for (const d of errs) out.push(`| ${d.browser} | ${d.size} | ${d.screen} | error | ${esc(d.error)} |`);
    out.push('', '</details>', '');
  }
}
if (RUN_URL) out.push(`Artifacts (reports, traces, findings JSON, diff images, baselines): [run artifacts](${RUN_URL}#artifacts)`);
out.push('', '<sub>Automated by `.github/workflows/pr-checks.yml`. The uiux job is report-only until its findings are fixed. Not covered: real devices, live github.io, audio quality, child-style play, accessibility beyond tap size and contrast.</sub>');
console.log(out.join('\n'));
