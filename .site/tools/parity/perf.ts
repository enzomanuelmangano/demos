#!/usr/bin/env bun
// The performance gate: the same cold load and the same scroll on two origins, side by side (docs/perf.md).
//   bun tools/parity/perf.ts <live origin> <local origin> <route>... [--out perf.json] [--runs 3]
// Per route, width (1440 desktop, 390 touch) and profile (`cable`: no throttling; `4g`: 9 Mbps down / 1.5 up, 170 ms
// RTT and 4x CPU, Lighthouse's mobile preset), a fresh browser context (cold cache) loads the page and reports:
// - transfer: bytes on the wire by type (document, script, stylesheet, font, image, media, other), and requests;
// - FCP and LCP (PerformanceObserver, buffered), CLS (layout-shift without recent input), TBT (the long tasks'
//   time over 50 ms from FCP to 5 s after load);
// - runtime: a 3 s scroll through the page with rAF timing: frames, frames over 20 ms (a missed 60 Hz vsync), the
//   longest frame, long tasks during the scroll, and layout shift during it.
// The median of --runs is kept. A local metric worse than the live one fails the route (exit 1), except the
// budgets listed in docs/perf.md as exempt with a reason.
import { launch, newPage, type Page } from './cdp.ts';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const [live, local] = args;
const routes = args.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const runs = Number(opt('--runs') ?? 3);
const out = opt('--out') ?? '/tmp/site-perf.json';
const widths = (opt('--widths') ?? '1440,390').split(',').map(Number);
const profiles = (opt('--profiles') ?? 'cable,4g').split(',');

const OBSERVE = `(() => {
  const m = window.__perf = { fcp: 0, lcp: 0, cls: 0, longtasks: [], shiftsAfter: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { m.cls += e.value; if (m.scrolling) m.shiftsAfter += e.value; } }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) m.longtasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
})()`;

const SCROLL = `(async () => {
  const m = window.__perf; m.scrolling = true;
  const sc = document.scrollingElement, max = sc.scrollHeight - innerHeight, t0 = performance.now(), frames = [];
  let last = t0;
  await new Promise((done) => { const step = (t) => { frames.push(t - last); last = t; const p = Math.min((t - t0) / 3000, 1); sc.scrollTop = max * (p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2); if (p < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  const lt = m.longtasks.filter(([s]) => s >= t0);
  return { frames: frames.length, janky: frames.slice(1).filter((d) => d > 20).length, longestFrame: Math.round(Math.max(...frames.slice(1))), longTasks: lt.length, scrollShift: m.shiftsAfter };
})()`;

async function measure(page: Page, url: string, profile: string) {
  const bytes: Record<string, number> = {}, types = new Map<string, string>();
  let requests = 0;
  const off = page.on((e) => {
    if (e.method === 'Network.responseReceived') types.set(e.params.requestId, (e.params.type ?? 'Other').toLowerCase());
    if (e.method === 'Network.loadingFinished') { requests++; const t = types.get(e.params.requestId) ?? 'other'; bytes[t] = (bytes[t] ?? 0) + e.params.encodedDataLength; }
  });
  if (profile === '4g') {
    await page.send('Network.emulateNetworkConditions', { offline: false, latency: 170, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
    await page.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVE });
  await page.goto(url, 60000);
  await Bun.sleep(5000);
  const m = await page.eval<any>(`(() => { const m = window.__perf; const tbt = m.longtasks.filter(([s]) => s >= m.fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0); return { fcp: Math.round(m.fcp), lcp: Math.round(m.lcp), cls: Math.round(m.cls * 1000) / 1000, tbt: Math.round(tbt), longTasks: m.longtasks.length }; })()`);
  const runtime = await page.eval<any>(SCROLL);
  off();
  const total = Object.values(bytes).reduce((a, b) => a + b, 0);
  return { ...m, bytes: total, requests, byType: bytes, ...runtime };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const { cdp, kill } = await launch({ port: 9345 });
const report: any[] = [];
let failed = 0;
for (const route of routes) for (const w of widths) for (const profile of profiles) {
  const row: any = { route, width: w, profile };
  for (const [side, origin] of [['live', live], ['local', local]] as const) {
    const samples = [];
    for (let i = 0; i < runs; i++) { const page = await newPage(cdp, w); samples.push(await measure(page, origin + route, profile)); await page.close(); }
    const pick: any = {};
    for (const k of Object.keys(samples[0])) pick[k] = typeof samples[0][k] === 'number' ? median(samples.map((s) => s[k])) : samples[Math.floor(runs / 2)][k];
    row[side] = pick;
  }
  const worse = ['bytes', 'fcp', 'lcp', 'tbt', 'cls', 'janky', 'longTasks'].filter((k) => row.local[k] > row.live[k] && !(k === 'cls' && row.local[k] <= 0.001));
  row.worse = worse;
  if (worse.length) failed++;
  report.push(row);
  const f = (s: any) => `${(s.bytes / 1024).toFixed(0)} KB/${s.requests} req, FCP ${s.fcp}, LCP ${s.lcp}, TBT ${s.tbt}, CLS ${s.cls}, jank ${s.janky}/${s.frames} (max ${s.longestFrame} ms)`;
  console.log(`${route} @${w} ${profile}\n  live  ${f(row.live)}\n  local ${f(row.local)}${worse.length ? `\n  WORSE: ${worse.join(', ')}` : ''}`);
}
await Bun.write(out, JSON.stringify(report, null, 2));
kill();
process.exit(failed ? 1 : 0);
