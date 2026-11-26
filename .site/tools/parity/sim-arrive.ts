#!/usr/bin/env bun
// Arriving at /demos, and the app's in-app steps, timed in a headed Chrome (docs/perf.md "Navigating the sim").
//   bun tools/parity/sim-arrive.ts <origin> [--size 1440x900] [--profile cable|4g] [--runs 3] [--out f.json]
// Desktop (from 1024 px): cold (a fresh context), warm (the same context, another site first, then /demos again as a
// document load), in-app (from /articles, a click on the header's Demos link): ms from the navigation to the hero's
// first paint (FCP), to the launcher still painted (its image decoded), to the framed app live (the page marks the
// frame `live`) and to the app interactive (a tap on an icon opens that demo: tap at `live`, ms until the demo's root
// is mounted). Phone (under 800): /demos, then a tap on "Open the demos": ms from the tap to the app's launcher
// drawn and to a demo opened by a tap; cold and warm.
// Then, in the app (desktop: in the frame; phone: full screen): tap → demo mounted, for 10 demos in a row (GPU and
// plain), and a deep link /demos/<slug> (a legacy post, 308) → that demo drawn.
// 4g: 170 ms RTT, 9 / 1.5 Mbps, 4x CPU, on the page and on the app's process.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { launch, newPage, type Page } from './cdp.ts';

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const origin = args[0].replace(/\/$/, '');
const [W, H] = opt('--size', '1440x900')!.split('x').map(Number);
const profile = opt('--profile', 'cable')!;
const runs = Number(opt('--runs', '3'));
// --out <file>, else $SIM_OUT (a directory), else .out/parity/ under the working directory (dot directories are never captured).
const out = opt('--out') ?? join(process.env.SIM_OUT ?? '.out/parity', `sim-arrive-${W}-${profile}.json`);
mkdirSync(dirname(out), { recursive: true });
const phone = W < 800;
const SLUGS = ['composable-text', 'chessboard', 'calendar-days', 'sculptures-in-words', 'blur-cards', 'the-little-prince', 'magnet-spring', 'sphere-waves', 'clock-time-picker', 'card-shader-reflections'];
const NET = { offline: false, latency: 170, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 };

async function throttle(p: { send: (m: string, a?: any) => Promise<any> }) {
  if (profile !== '4g') return;
  await p.send('Network.enable').catch(() => {});
  await p.send('Network.emulateNetworkConditions', NET).catch(() => {});
  await p.send('Emulation.setCPUThrottlingRate', { rate: 4 }).catch(() => {});
}

async function session(page: Page) {
  // Every frame of the page (the app's out-of-process frame included) is throttled as it attaches.
  page.cdp.on(async (e) => {
    if (e.method !== 'Target.attachedToTarget' || e.sessionId !== page.sessionId) return;
    const s = e.params.sessionId, send = (m: string, a: any = {}) => page.cdp.send(m, a, s);
    await throttle({ send });
    await send('Runtime.runIfWaitingForDebugger').catch(() => {});
  });
  await page.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  await throttle(page);
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('reactiive.demos.hint', '1') } catch {}
    window.__arrive = { fcp: 0, still: 0, live: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__arrive.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
    new MutationObserver(() => { const a = window.__arrive; if (!a.live && document.querySelector('iframe[data-motion~=live], iframe[data-ready]')) a.live = performance.now(); }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-motion'] });` });
}

async function appTarget(page: Page) {
  const { targetInfos } = await page.cdp.send('Target.getTargets');
  const t = targetInfos.filter((t: any) => t.type === 'iframe' && t.url.includes('/demos/app/')).pop();
  if (!t) return null;
  const { sessionId } = await page.cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const f = new (page.constructor as any)(page.cdp, sessionId, t.targetId, '') as Page;
  await f.send('Runtime.enable');
  return f;
}
const until = async (f: () => Promise<boolean>, ms = 30000) => { const t = performance.now(); while (performance.now() - t < ms) { if (await f().catch(() => false)) return performance.now() - t; await Bun.sleep(30); } return NaN; };

async function tapAt(page: Page, x: number, y: number) {
  if (phone) { await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  else for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}
// A tap on the app's `testId`, through the page (the frame's offset added) or on the app at the top.
async function tapApp(page: Page, app: Page, testId: string) {
  const off = app === page ? { x: 0, y: 0 } : await page.eval<any>(`(() => { const f = [...document.querySelectorAll('iframe[data-motion~=live], iframe[data-ready]')].find((f) => f.checkVisibility()); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
  const r = await app.eval<any>(`(() => { const e = document.querySelector('[data-testid="${testId}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!r) return false;
  await tapAt(page, r.x + off.x, r.y + off.y);
  return true;
}
const mounted = (app: Page, slug: string) => app.eval<boolean>(`!!document.querySelector('[data-testid="demo-${slug}"]')`);
async function openClose(page: Page, app: Page, slug: string) {
  const t = performance.now();
  if (!(await tapApp(page, app, `icon-${slug}`))) return NaN;
  const ms = await until(() => mounted(app, slug), 15000);
  await Bun.sleep(700);
  await tapApp(page, app, 'close');
  await until(async () => !(await mounted(app, slug)) || true, 3000);
  await Bun.sleep(900);
  return Math.round(ms);
}

async function run() {
  const { cdp, kill } = await launch({ port: 9580, headed: true });
  const page = await newPage(cdp, W, { height: H, scale: phone ? 3 : 2 });
  await session(page);
  const r: any = {};
  if (!phone) {
    for (const kind of ['cold', 'warm', 'inapp']) {
      if (kind === 'warm') { await page.goto(`${origin}/articles`); await Bun.sleep(1500); }
      if (kind === 'inapp') { await page.goto(`${origin}/articles`); await Bun.sleep(2500); }
      const t0 = performance.now();
      if (kind === 'inapp') {
        // The header's Demos link, as a reader clicks it (an in-app navigation once the runtime is up, D16).
        const l = await page.eval<any>(`(() => { const a = [...document.querySelectorAll('a[href="/demos"]')].find((a) => a.checkVisibility()); const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        await tapAt(page, l.x, l.y);
      } else await page.send('Page.navigate', { url: `${origin}/demos` });
      const still = await until(() => page.eval(`(() => { const e = document.querySelector('[data-motion~=sim-keep] [data-motion~=sim-still]'); if (!e || !e.checkVisibility()) return false; const u = getComputedStyle(e).backgroundImage; if (!u.includes('url')) return false; const src = u.slice(5, -2); const i = performance.getEntriesByName(new URL(src, location.href).href)[0]; return !!i && i.responseEnd > 0; })()`));
      const live = await until(() => page.eval(`!!document.querySelector('iframe[data-motion~=live], iframe[data-ready]')`), 60000);
      const app = await appTarget(page);
      const tapMs = app ? (await until(() => app.eval(`!!document.querySelector('[data-testid=icon-composable-text]')`), 30000), await openClose(page, app, 'composable-text')) : NaN;
      const a = await page.eval<any>('window.__arrive');
      // In-app navigations keep the document: FCP is the first load's; the hero is then drawn with the route.
      r[kind] = { fcp: kind === 'inapp' ? null : Math.round(a.fcp), still: Math.round(still), live: Math.round(live), interactive: Math.round(live + tapMs), tapToDemo: tapMs };
    }
    const app = await appTarget(page);
    if (app) {
      r.tenDemos = [];
      for (const s of SLUGS) r.tenDemos.push([s, await openClose(page, app, s)]);
    }
  } else {
    for (const kind of ['cold', 'warm']) {
      if (kind === 'warm') { await page.goto(`${origin}/articles`); await Bun.sleep(1500); }
      await page.goto(`${origin}/demos`);
      await until(() => page.eval(`!!document.querySelector('[data-testid=open-demos]')?.checkVisibility()`));
      await Bun.sleep(800);
      const b = await page.eval<any>(`(() => { const e = document.querySelector('[data-testid=open-demos]'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      const t0 = performance.now();
      await tapAt(page, b.x, b.y);
      const drawn = await until(() => page.eval(`location.pathname === '/demos/app/' && !!document.querySelector('[data-testid=icon-composable-text] img, [data-testid=icon-composable-text]')`), 60000);
      await throttle(page);
      const tapMs = await (async () => { await Bun.sleep(100); return openClose(page, page, 'composable-text'); })();
      r[kind] = { tapToLauncher: Math.round(drawn), tapToDemo: tapMs };
    }
    r.tenDemos = [];
    for (const s of SLUGS) r.tenDemos.push([s, await openClose(page, page, s)]);
  }
  // A legacy post's deep link → that demo drawn.
  const t0 = performance.now();
  await page.send('Page.navigate', { url: `${origin}/demos/chessboard` });
  r.deepLink = Math.round(await until(() => page.eval(`!!document.querySelector('[data-testid="demo-chessboard"]')`), 60000));
  kill();
  return r;
}

const all: any[] = [];
for (let i = 0; i < runs; i++) { all.push(await run()); console.error(`run ${i + 1}: ${JSON.stringify(all.at(-1))}`); }
const med = (a: number[]) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const summary: any = { size: `${W}x${H}`, profile };
for (const k of Object.keys(all[0])) {
  if (k === 'tenDemos') { summary.tenDemos = { median: med(all.flatMap((r) => r.tenDemos.map((d: any) => d[1]))), max: Math.max(...all.flatMap((r) => r.tenDemos.map((d: any) => d[1])).filter(Number.isFinite)) }; continue; }
  if (typeof all[0][k] === 'number') { summary[k] = med(all.map((r) => r[k])); continue; }
  summary[k] = Object.fromEntries(Object.keys(all[0][k]).map((m) => [m, med(all.map((r) => r[k][m]))]));
}
await Bun.write(out, JSON.stringify({ summary, all }, null, 2));
console.log(JSON.stringify(summary));
process.exit(0);
