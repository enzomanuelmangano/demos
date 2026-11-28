#!/usr/bin/env bun
// Legacy (React Native, .legacy/) vs Exact, demo by demo, on one iOS simulator, both as Release builds.
// For each demo: a clean restart of the app, the demo opened by its link, 2 s to settle, then
//   idle:     5 s untouched (what the demo costs while it animates on its own);
//   interact: 4 swipes through the screen's middle, ~5 s (up, down, left, right).
// Measured from the Mac (simulator apps are host processes), the same way for both apps:
//   CPU: the process's cumulative CPU time (ps -o cputime) at each phase's start and end -> average % of one core;
//   memory: resident set (ps -o rss) every 250 ms -> after open, peak, and the growth over the home screen.
// The simulator draws with the Mac's GPU: absolute numbers are not an iPhone's, the comparison between the apps is.
//   bun .parity/perf-compare/run.ts --app exact|legacy --udid <sim> [--slugs a,b] [--out file.json]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const appArg = arg('--app')!; const udid = arg('--udid')!;
const APPS: Record<string, { bundle: string; link: (s: string) => string }> = {
  exact: { bundle: 'com.reactiive.demos.exact', link: (s) => `demos-exact://demo/${s}` },
  legacy: { bundle: 'com.reactiive.app', link: (s) => `demos://animations/${s}` },
};
if (!udid || !(appArg === 'both' || APPS[appArg])) throw new Error('--app exact|legacy|both --udid <sim>');
const PHASE = Number(arg('--phase-ms', '4000'));
const root = join(import.meta.dir, '../..');
const slugs = arg('--slugs')?.split(',') ?? [...readFileSync(join(root, 'demos.contract'), 'utf8').matchAll(/Demo\(slug="([^"]+)"/g)].map((m) => m[1]);
const outDir = arg('--out-dir', '/tmp/perf')!; spawnSync('mkdir', ['-p', outDir]);
const outOf = (app: string) => join(outDir, `${app}.${udid.slice(0, 8)}.json`);
const all: Record<string, Record<string, unknown>> = {};
for (const a of Object.keys(APPS)) all[a] = existsSync(outOf(a)) ? JSON.parse(readFileSync(outOf(a), 'utf8')) : {};
const sh = (c: string, a: string[]) => spawnSync(c, a, { encoding: 'utf8' });
const argent = (tool: string, flags: Record<string, string | number>) => sh('argent', ['run', tool, '--udid', udid, ...Object.entries(flags).flatMap(([k, v]) => [`--${k}`, String(v)])]);
const sleep = (ms: number) => Bun.sleep(ms);
const containerOf = (bundle: string) => { const c = sh('xcrun', ['simctl', 'get_app_container', udid, bundle]).stdout.trim(); if (!c) throw new Error(`${bundle} is not installed on ${udid}`); return c; };
const pidOf = (container: string) => { const r = sh('pgrep', ['-f', `${container}/`]); return Number(r.stdout.trim().split('\n')[0]) || 0; };
const cputime = (pid: number) => { const t = sh('ps', ['-o', 'cputime=', '-p', String(pid)]).stdout.trim(); if (!t) return NaN; const [m, s] = t.split(':'); return Number(m) * 60 + Number(s); };
const rss = (pid: number) => Number(sh('ps', ['-o', 'rss=', '-p', String(pid)]).stdout.trim()) / 1024; // MB
async function phase(pid: number, ms: number, during?: () => Promise<void>) {
  const c0 = cputime(pid), t0 = performance.now(); let peak = 0; let alive = true;
  const sampler = (async () => { while (alive) { peak = Math.max(peak, rss(pid) || 0); await sleep(250); } })();
  if (during) await during(); const rest = ms - (performance.now() - t0); if (rest > 0) await sleep(rest);
  alive = false; await sampler;
  const c1 = cputime(pid), t1 = performance.now();
  return { cpu: Math.round(((c1 - c0) / ((t1 - t0) / 1000)) * 1000) / 10, peakMB: Math.round(peak) };
}
const swipes = async () => {
  for (const [fx, fy, tx, ty] of [[0.5, 0.7, 0.5, 0.35], [0.5, 0.35, 0.5, 0.7], [0.8, 0.5, 0.2, 0.5], [0.2, 0.5, 0.8, 0.5]]) {
    argent('gesture-swipe', { fromX: fx, fromY: fy, toX: tx, toY: ty, durationMs: 500 }); await sleep(450);
  }
};
async function measure(app: string, slug: string) {
  const A = APPS[app]; const container = containerOf(A.bundle); const results = all[app];
  if (results[slug]) return;
  argent('restart-app', { bundleId: A.bundle }); await sleep(5000);
  const pid = pidOf(container); if (!pid) { results[slug] = { error: 'no process' }; return; }
  const homeMB = Math.round(rss(pid));
  sh('xcrun', ['simctl', 'openurl', udid, A.link(slug)]); await sleep(2000);
  if (pidOf(container) !== pid) { results[slug] = { error: 'crashed on open', homeMB }; console.log(`${app} ${slug}: CRASH`); writeFileSync(outOf(app), JSON.stringify(results, null, 1)); return; }
  const openMB = Math.round(rss(pid));
  const shotDir = join(arg('--shots', '/tmp/perf-shots')!, app); spawnSync('mkdir', ['-p', shotDir]);
  const idle = await phase(pid, PHASE, async () => { await sleep(PHASE / 2); sh('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=jpeg', `${shotDir}/${slug}.jpg`]); });
  const interact = await phase(pid, PHASE, swipes);
  const crashed = pidOf(container) !== pid;
  results[slug] = { homeMB, openMB, idle, interact, crashed };
  console.log(`${app} ${slug}: open ${openMB} MB (+${openMB - homeMB}), idle ${idle.cpu}% / ${idle.peakMB} MB, interact ${interact.cpu}% / ${interact.peakMB} MB${crashed ? ' CRASHED' : ''}`);
  writeFileSync(outOf(app), JSON.stringify(results, null, 1));
}
let n = 0;
for (const slug of slugs) {
  const order = appArg === 'both' ? (n++ % 2 ? ['legacy', 'exact'] : ['exact', 'legacy']) : [appArg];
  for (const app of order) await measure(app, slug);
}
console.log(`done: ${slugs.length} demos on ${udid}`);
