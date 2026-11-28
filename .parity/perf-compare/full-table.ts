#!/usr/bin/env bun
// Every number of the run, demo by demo: both apps' memory after open, idle CPU and peak, interacting CPU and peak.
//   bun .parity/perf-compare/full-table.ts --in data > table.md
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[process.argv.indexOf('--in') + 1];
type R = { openMB: number; idle: { cpu: number; peakMB: number }; interact: { cpu: number; peakMB: number }; crashed?: boolean; error?: string };
const load = (app: string) => Object.assign({}, ...readdirSync(dir).filter((f) => f.startsWith(app + '.') && f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))) as Record<string, R>;
const ex = load('exact'), lg = load('legacy'), ctl = load('control.exact');
const names = Object.fromEntries([...readFileSync(join(import.meta.dir, '../../demos.contract'), 'utf8').matchAll(/Demo\(slug="([^"]+)", name="([^"]+)"/g)].map((m) => [m[1], m[2]]));
const slugs = Object.keys(names).filter((s) => ex[s] || lg[s]);
const f = (n?: number) => (n === undefined || Number.isNaN(n) ? '—' : (Math.round(n * 10) / 10).toFixed(1));
const cells = (r?: R) => (!r ? ['—', '—', '—', '—', '—'] : r.error ? [r.error, '', '', '', ''] : [f(r.openMB), f(r.idle.cpu), f(r.idle.peakMB), f(r.interact.cpu) + (r.crashed ? ' ⚠︎crash' : ''), f(r.interact.peakMB)]);
const out = ['| Demo | RN open MB | RN idle CPU % | RN idle peak MB | RN interact CPU % | RN interact peak MB | Exact open MB | Exact idle CPU % | Exact idle peak MB | Exact interact CPU % | Exact interact peak MB |', '|' + '---|'.repeat(11)];
for (const s of slugs) out.push(`| ${names[s]} | ${[...cells(lg[s]), ...cells(ex[s])].join(' | ')} |`);
const cs = Object.keys(ctl);
if (cs.length) {
  out.push('', `Control: Exact alone on one simulator (${cs.length} demos), the same columns, next to its value in the 3-simulator run:`, '', '| Demo | open MB (alone / run) | idle CPU % | idle peak MB | interact CPU % | interact peak MB |', '|---|---|---|---|---|---|');
  for (const s of cs) { const a = ctl[s], b = ex[s]; out.push(`| ${names[s] ?? s} | ${f(a.openMB)} / ${f(b?.openMB)} | ${f(a.idle.cpu)} / ${f(b?.idle.cpu)} | ${f(a.idle.peakMB)} / ${f(b?.idle.peakMB)} | ${f(a.interact.cpu)} / ${f(b?.interact.cpu)} | ${f(a.interact.peakMB)} / ${f(b?.interact.peakMB)} |`); }
}
console.log(out.join('\n'));
