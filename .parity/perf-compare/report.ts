#!/usr/bin/env bun
// Merges the shards' JSON (run.ts --app both) into one table: legacy vs Exact, demo by demo.
//   bun .parity/perf-compare/report.ts --in <out-dir> [--control <single-sim exact.json>] > REPORT.md
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const dir = arg('--in')!;
type R = { openMB: number; idle: { cpu: number; peakMB: number }; interact: { cpu: number; peakMB: number }; crashed?: boolean; error?: string };
const load = (app: string) => Object.assign({}, ...readdirSync(dir).filter((f) => f.startsWith(app + '.') && f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))) as Record<string, R>;
const ex = load('exact'), lg = load('legacy');
const names = Object.fromEntries([...readFileSync(join(import.meta.dir, '../../demos.contract'), 'utf8').matchAll(/Demo\(slug="([^"]+)", name="([^"]+)"/g)].map((m) => [m[1], m[2]]));
const slugs = Object.keys(names).filter((s) => ex[s] || lg[s]);
const peak = (r: R) => Math.max(r.idle.peakMB, r.interact.peakMB, r.openMB);
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const ok = slugs.filter((s) => ex[s] && lg[s] && !ex[s].error && !lg[s].error);
const pct = (a: number, b: number) => (b > 0 ? `${a <= b ? '−' : '+'}${Math.abs(Math.round(((a - b) / b) * 100))}%` : '—');
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const lines: string[] = [];
const sum = (pick: (r: R) => number) => ({ ex: ok.map((s) => pick(ex[s])), lg: ok.map((s) => pick(lg[s])) });
const rows = [
  ['CPU idle (% of one core)', sum((r) => r.idle.cpu)],
  ['CPU interacting (%)', sum((r) => r.interact.cpu)],
  ['Memory after open (MB)', sum((r) => r.openMB)],
  ['Memory peak (MB)', sum(peak)],
] as const;
lines.push(`**${ok.length} demos** measured on both apps.`, '', '| Metric | Legacy (RN) median | Exact median | Exact vs legacy (median) | Legacy mean | Exact mean |', '|---|---|---|---|---|---|');
for (const [label, v] of rows) lines.push(`| ${label} | ${f1(med(v.lg))} | ${f1(med(v.ex))} | ${pct(med(v.ex), med(v.lg))} | ${f1(mean(v.lg))} | ${f1(mean(v.ex))} |`);
const winsCpu = ok.filter((s) => ex[s].interact.cpu < lg[s].interact.cpu).length, winsMem = ok.filter((s) => peak(ex[s]) < peak(lg[s])).length;
lines.push('', `Exact uses less CPU while interacting in **${winsCpu}/${ok.length}** demos, and less peak memory in **${winsMem}/${ok.length}**.`);
const fail = (m: Record<string, R>, app: string) => slugs.filter((s) => m[s]?.error || m[s]?.crashed).map((s) => `${names[s]} (${app}: ${m[s].error ?? 'crashed during the run'})`);
const fails = [...fail(lg, 'legacy'), ...fail(ex, 'Exact')];
lines.push('', `Crashes or failures: ${fails.length ? fails.join(', ') : 'none'}.`);
const ctl = arg('--control');
if (ctl && existsSync(ctl)) {
  const c = JSON.parse(readFileSync(ctl, 'utf8')) as Record<string, R>; const both = ok.filter((s) => c[s] && !c[s].error);
  lines.push('', `Control: Exact alone on one simulator (no parallel load) vs Exact in this run, ${both.length} demos: median CPU interacting ${f1(med(both.map((s) => c[s].interact.cpu)))}% vs ${f1(med(both.map((s) => ex[s].interact.cpu)))}%, median peak memory ${f1(med(both.map((s) => peak(c[s]))))} vs ${f1(med(both.map((s) => peak(ex[s]))))} MB.`);
}
lines.push('', '### Demo by demo', '', '| Demo | CPU idle RN → Exact | CPU interacting RN → Exact | Peak MB RN → Exact |', '|---|---|---|---|');
for (const s of slugs) {
  const a = lg[s], b = ex[s];
  const cell = (x?: R, y?: R, pick?: (r: R) => number) => (!x || !y || x.error || y.error ? `${x?.error ?? (x ? '' : '—')} / ${y?.error ?? (y ? '' : '—')}` : `${f1(pick!(x))} → **${f1(pick!(y))}** (${pct(pick!(y), pick!(x))})`);
  lines.push(`| ${names[s]} | ${cell(a, b, (r) => r.idle.cpu)} | ${cell(a, b, (r) => r.interact.cpu)} | ${cell(a, b, peak)} |`);
}
console.log(lines.join('\n'));
