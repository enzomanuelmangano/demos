#!/usr/bin/env bun
// Frame pacing inside the Demos app, embedded in /demos (the site's frame) or standalone (/demos/app/ at the top),
// in a HEADED Chrome (real vsync, real GPU). docs/perf.md "Navigating the sim".
//   bun tools/parity/sim-frames.ts <origin> [--mode site|app] [--size 1440x900] [--runs 3] [--cpu 1] [--out f.json]
//     [--only paging,open,search,scroll]
// --mode site loads <origin>/demos and drives the app through the page (input lands on the page and is routed into
// the frame, as a reader's); --mode app loads <origin>/demos/app/ at the top level. Widths under 800 are a phone
// (touch, scale 3); others a desktop (mouse and wheel, scale 2).
// Per interaction, frame intervals are read from requestAnimationFrame in the app's own document (its renderer
// process) and in the page's (site mode): dropped = Σ(round(interval / vsync) - 1), p95 = the 95th percentile
// interval, vsync = the median idle interval. Also: tap → the demo's root mounted, and its first frame after.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { launch, newPage, type Page } from './cdp.ts';

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const origin = args[0].replace(/\/$/, '');
const mode = opt('--mode', 'site');
const [W, H] = opt('--size', '1440x900')!.split('x').map(Number);
const runs = Number(opt('--runs', '3'));
const cpu = Number(opt('--cpu', '1'));
const only = opt('--only')?.split(',');
// --css <rules>: a style sheet added to the page (site mode) before the frame loads, for A/B of the embedding's costs.
const css = opt('--css');
// --hint-off: mark the one-time touch demo seen, so it never runs during a measurement.
const hintOff = !args.includes('--hint-on');
// --out <file>, else $SIM_OUT (a directory), else .out/parity/ under the working directory (dot directories are never captured).
const out = opt('--out') ?? join(process.env.SIM_OUT ?? '.out/parity', `sim-frames-${mode}-${W}.json`);
mkdirSync(dirname(out), { recursive: true });
const phone = W < 800;
const SLUGS = (opt('--demos') ?? 'sculptures-in-words,light-on-painting,the-little-prince,chessboard,art-gallery,cherry-blossom-qrcode,github-terrain,sphere-waves,calendar-days,blur-cards,composable-text,card-shader-reflections').split(',');

const SAMPLER = `(() => { if (window.__fs) return; const s = window.__fs = { t: [], on: false };
  const step = (t) => { if (s.on) s.t.push(t); requestAnimationFrame(step); }; requestAnimationFrame(step); })()`;

type Frame = { page: Page; dx: number; dy: number };

async function frameOf(page: Page): Promise<Page> {
  // The app's document: the page itself (app mode) or the out-of-process frame (site mode).
  if (mode === 'app') return page;
  const { targetInfos } = await page.cdp.send('Target.getTargets');
  const t = targetInfos.find((t: any) => t.type === 'iframe' && t.url.includes('/demos/app/'));
  if (!t) throw new Error('no app frame');
  const { sessionId } = await page.cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const f = new (page.constructor as any)(page.cdp, sessionId, t.targetId, '') as Page;
  await f.send('Runtime.enable');
  return f;
}

async function run() {
  const { cdp, kill } = await launch({ port: 9570, headed: true });
  const page = await newPage(cdp, W, { height: H, scale: phone ? 3 : 2 });
  if (cpu > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const errors: string[] = [];
  page.on((e) => { if (e.method === 'Runtime.exceptionThrown') errors.push(e.params.exceptionDetails?.exception?.description?.slice(0, 200)); });
  if (hintOff) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('reactiive.demos.hint', '1') } catch {}` });
  if (css) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); })` });
  await page.goto(`${origin}${mode === 'site' ? '/demos' : '/demos/app/'}`);
  if (mode === 'site') {
    // Wait for the frame to be live (the page marks it `live` once the app has drawn).
    for (let i = 0; i < 150; i++) { if (await page.eval(`!!document.querySelector('iframe[data-motion~=live]')`)) break; await Bun.sleep(200); }
    if (phone) { await page.eval(`(() => { const f = document.querySelector('iframe[src*="/demos/app/"]'); scrollTo(0, f.getBoundingClientRect().top + scrollY - 73); })()`); }
  }
  const app = await frameOf(page);
  app.on((e) => { if (e.method === 'Runtime.exceptionThrown') errors.push('app: ' + e.params.exceptionDetails?.exception?.description?.slice(0, 200)); });
  for (let i = 0; i < 100; i++) { if (await app.eval(`!!document.querySelector('[data-testid=pager]')`).catch(() => false)) break; await Bun.sleep(200); }
  await Bun.sleep(2500);
  await app.eval(SAMPLER);
  if (mode === 'site') await page.eval(SAMPLER);

  const offset = async () => mode === 'app' ? { x: 0, y: 0 } : page.eval<{ x: number; y: number }>(`(() => { const f = [...document.querySelectorAll('iframe[src*="/demos/app/"]')].find((f) => f.getBoundingClientRect().width > 0 && f.checkVisibility()); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
  let off = await offset();
  const rect = async (sel: string) => {
    const r = await app.eval<any>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, l: r.x, t: r.y }; })()`);
    return r && { ...r, x: r.x + off.x, y: r.y + off.y, l: r.l + off.x, t: r.t + off.y };
  };
  const tap = async (x: number, y: number) => {
    if (phone) {
      await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await Bun.sleep(60);
      await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await Bun.sleep(60);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
  };
  const drag = async (x0: number, y0: number, x1: number, y1: number, ms: number) => {
    const n = Math.max(2, Math.round(ms / 16));
    if (phone) await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    else { await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 }); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 }); }
    for (let i = 1; i <= n; i++) {
      const p = i / n, e = 1 - (1 - p) ** 2, x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e;
      if (phone) await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      else await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
      await Bun.sleep(16);
    }
    if (phone) await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
  };
  const wheel = async (x: number, y: number, dy: number, steps: number) => {
    for (let i = 0; i < steps; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); await Bun.sleep(16); }
  };
  const begin = async () => { await app.eval(`(window.__fs.t = [], window.__fs.on = true)`); if (mode === 'site') await page.eval(`(window.__fs.t = [], window.__fs.on = true)`); };
  const end = async () => {
    const a = await app.eval<number[]>(`(window.__fs.on = false, window.__fs.t)`);
    const p = mode === 'site' ? await page.eval<number[]>(`(window.__fs.on = false, window.__fs.t)`) : [];
    return { app: a, page: p };
  };

  // The display's vsync: the median rAF interval while idle.
  await begin(); await Bun.sleep(1000); const idle = await end();
  const iv = (t: number[]) => t.slice(1).map((v, i) => v - t[i]);
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
  const vsync = med(iv(idle.app)) || 16.67;
  const stats = (t: number[]) => {
    const d = iv(t);
    if (!d.length) return { frames: 0, dropped: 0, p95: 0, max: 0 };
    const s = [...d].sort((a, b) => a - b);
    return { frames: d.length, dropped: d.reduce((n, v) => n + Math.max(0, Math.round(v / vsync) - 1), 0), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) };
  };
  const result: Record<string, any> = { vsync: +vsync.toFixed(2), mode, size: `${W}x${H}` };
  const measure = async (name: string, act: () => Promise<any>, settle = 700) => {
    await begin();
    const extra = await act();
    await Bun.sleep(settle);
    const t = await end();
    (result[name] ??= []).push({ app: stats(t.app), page: mode === 'site' ? stats(t.page) : undefined, ...extra });
  };

  const pager = await rect('[data-testid=pager]');
  if (!only || only.includes('paging')) {
    const y = pager!.t + pager!.h * 0.45, x0 = pager!.l + pager!.w * 0.8, x1 = pager!.l + pager!.w * 0.15;
    await measure('page-drag', () => drag(x0, y, x1, y, 450));
    await measure('page-flick', () => drag(x0, y, x0 - pager!.w * 0.3, y, 120));
    await measure('page-back', async () => { await drag(x1, y, x0, y, 300); await Bun.sleep(500); await drag(x1, y, x0, y, 120); });
    await Bun.sleep(800);
  }
  if (!only || only.includes('open')) {
    for (const slug of SLUGS) {
      off = await offset();
      const icon = await rect(`[data-testid=icon-${slug}]`);
      if (!icon || icon.x < off.x || icon.x > off.x + (mode === 'app' ? W : 600)) { (result.skipped ??= []).push(slug); continue; }
      // tap → the demo's root mounted, then its first frame after (a rAF in the app after the root exists).
      await app.eval(`(() => { const s = window.__open = { t0: 0, mount: 0, frame: 0 }; const sel = ${JSON.stringify(`[data-testid="demo-${slug}"]`)};
        const poll = () => { if (!s.mount && document.querySelector(sel)) s.mount = performance.now(); else if (s.mount && !s.frame) { s.frame = performance.now(); return; } requestAnimationFrame(poll); };
        addEventListener('pointerdown', () => { s.t0 = performance.now(); requestAnimationFrame(poll); }, { once: true, capture: true }); })()`);
      await measure('open', async () => { await tap(icon.x, icon.y); await Bun.sleep(900); const o = await app.eval<any>('window.__open'); return { slug, mount: Math.round(o.mount - o.t0), frame: Math.round(o.frame - o.t0) }; }, 300);
      await Bun.sleep(600);
      const close = await rect('[data-testid=close]');
      await measure('close', async () => { if (close) await tap(close.x, close.y); }, 1000);
      await Bun.sleep(400);
    }
  }
  if (!only || only.includes('search')) {
    const p = (await rect('[data-testid=pager]'))!;
    await measure('pull-search', () => drag(p.x, p.t + 60, p.x, p.t + 320, 400), 900);
    await Bun.sleep(400);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await Bun.sleep(800);
  }
  if (!only || only.includes('scroll')) {
    // A demo that scrolls: Stacked Modals is on page 2; use the search-free path: Blur Cards (a vertical scroller).
    off = await offset();
    const icon = await rect('[data-testid=icon-blur-cards]');
    if (icon) {
      await tap(icon.x, icon.y); await Bun.sleep(1500);
      const r = (await rect('[data-testid=demo-blur-cards]'))!;
      await measure('demo-scroll', async () => { if (phone) { await drag(r.x, r.t + r.h * 0.75, r.x, r.t + r.h * 0.25, 400); await Bun.sleep(300); await drag(r.x, r.t + r.h * 0.75, r.x, r.t + r.h * 0.25, 150); } else await wheel(r.x, r.y, 60, 40); }, 900);
      const close = await rect('[data-testid=close]'); if (close) await tap(close.x, close.y); await Bun.sleep(1000);
    }
  }
  result.errors = errors;
  kill();
  return result;
}

const all = [];
for (let i = 0; i < runs; i++) all.push(await run());
// Medians per interaction over runs and repeats.
const summary: Record<string, any> = { mode, size: `${W}x${H}`, vsync: all.map((r) => r.vsync) };
const medOf = (a: number[]) => { const s = a.filter((v) => Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
for (const k of ['page-drag', 'page-flick', 'page-back', 'open', 'close', 'pull-search', 'demo-scroll']) {
  const rows = all.flatMap((r) => r[k] ?? []);
  if (!rows.length) continue;
  summary[k] = {
    n: rows.length,
    dropped: medOf(rows.map((r: any) => r.app.dropped)), droppedTotal: rows.reduce((n: number, r: any) => n + r.app.dropped, 0),
    p95: medOf(rows.map((r: any) => r.app.p95)), max: Math.max(...rows.map((r: any) => r.app.max)),
    pageDropped: mode === 'site' ? medOf(rows.map((r: any) => r.page.dropped)) : undefined,
    mount: k === 'open' ? medOf(rows.map((r: any) => r.mount)) : undefined, frame: k === 'open' ? medOf(rows.map((r: any) => r.frame)) : undefined,
  };
}
summary.errors = [...new Set(all.flatMap((r) => r.errors))];
await Bun.write(out, JSON.stringify({ summary, all }, null, 2));
console.log(JSON.stringify(summary, null, 1));
process.exit(0);
