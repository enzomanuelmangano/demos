#!/usr/bin/env bun
// Responsive regression: the rebuild against the live site at every width of a matrix, and the rebuild against itself
// across a live resize (docs/parity.md "Responsive").
//
//   bun tools/parity/responsive.ts <live origin> <local origin> [<route>...] [options]
//
// Matrix (per route, width and height; the live sweep's way, shoot.ts: touch under 800 px, settle, scroll-through):
//   - overflow: the local document scrolls sideways (scrollWidth > clientWidth): a failure, whatever live does;
//   - pixels: the share of differing pixels of the full page (capped at --cap px) live against local, over the route's
//     budget (BUDGETS below: 0.5 % unless a recorded deliberate difference says otherwise): a failure;
//   - texts: live's texts found at the same place in the local page (reported, as compare.ts does).
// Resize (local only, and live with --resize-live): a desktop window loaded at 1440 x 900, then resized step by step
// to 390 and back (RESIZE_STEPS, then a few heights), once before the runtime starts (the static HTML; the runtime is
// held off with a never-resolving `exact.ready`) and once after it has started (its entry imported). After each step
// every box of the page (tag, rect, font size) must equal a fresh load at that size in the same phase to 1 px, and the
// page must not overflow. `--window` also resizes a real headed window (Browser.setWindowBounds; macOS keeps a window
// at least ~500 px wide, so its steps stop at 500).
//
// Options: --widths 320,…  --heights 600,700 (short heights, at --short-widths 390,768,1024,1440)  --no-matrix
//   --no-resize  --resize-live  --window  --scrollbars (classic scrollbars: the layout width is the window less 15 px)
//   --cap 6000  --jobs 3  --out /tmp/responsive  --settle 3500  --scroll 400,100
// Writes <out>/responsive.json (every row) and diff PNGs of the rows over budget; exits 1 on any failure.
import { mkdirSync } from 'node:fs';
import { Cdp, launch, newPage, Page } from './cdp.ts';
import { diffImages } from './diff.ts';
import { DOM_JS, slugName } from './shoot.ts';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const flag = (n: string) => args.includes(n);
const VALUED = new Set(['--widths', '--heights', '--short-widths', '--cap', '--jobs', '--out', '--settle', '--scroll']);
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(args[i - 1])));
const [liveOrigin, localOrigin, ...routeArgs] = pos;
if (!liveOrigin || !localOrigin) { console.error('usage: responsive.ts <live origin> <local origin> [<route>...] [options]'); process.exit(2); }

export const WIDTHS = [320, 360, 375, 390, 414, 480, 540, 600, 639, 640, 700, 767, 768, 820, 900, 1000, 1023, 1024, 1100, 1180, 1279, 1280, 1366, 1440, 1536, 1680, 1920];
export const ROUTES = ['/', '/articles', '/articles/pan-gesture-handler', '/articles/bottom-sheet-animation', '/series/exploring-skia', '/series/what-about-gestures', '/course',
  '/inspirations', '/docs', '/docs/terms', '/docs/license', '/profile', '/manage-subscription', '/nope-404', '/demos'];
export const RESIZE_STEPS = [1440, 1280, 1100, 1024, 1023, 900, 768, 767, 700, 640, 639, 480, 390];
// [width, height] after the width steps (back at 1440): short windows, then the start again.
const HEIGHT_STEPS: [number, number][] = [[1440, 700], [1440, 600], [1024, 600], [768, 700], [390, 600], [1440, 900]];

// Pixel budget (% of differing pixels, full page) per route and width. The default is the parity bar (docs/parity.md);
// a route with a recorded deliberate difference from live has its own, and Infinity means "reported, not judged".
const DEFAULT_BUDGET = 0.5;
function budget(route: string, w: number): { max: number; why?: string } {
  // D13: the four Demos-tied articles are not built, so every card after them sits one place earlier.
  if (route === '/articles') return { max: Infinity, why: 'D13 (4 cards not ported)' };
  // D10/D12/D17/D20: /demos is redesigned (the app framed beside the hero), and its spiral is random per visit.
  if (route === '/demos' || route.startsWith('/demos/')) return { max: Infinity, why: 'D10/D12/D17/D20 (redesigned hero)' };
  // Signed out, both sites send /profile and /manage-subscription to /demos (live after its runtime, the rebuild at
  // the edge): the redesigned /demos is what is compared.
  if (route === '/profile' || route === '/manage-subscription') return { max: Infinity, why: 'signed out: /demos (redesigned)' };
  // The home page's newsletter row under 360 px: live's email field keeps its intrinsic width and pushes Subscribe
  // 6 px past a 320 px window, where it is cut (a live bug); the rebuild's field shrinks (min-width 0): 1.2 % at 320.
  if (route === '/' && w < 360) return { max: 1.5, why: "live cuts Subscribe at the window's edge" };
  return { max: DEFAULT_BUDGET };
}

const widths = (opt('--widths') ?? WIDTHS.join(',')).split(',').map(Number);
const shortHeights = (opt('--heights') ?? '600,700').split(',').filter(Boolean).map(Number);
const shortWidths = (opt('--short-widths') ?? '390,768,1024,1440').split(',').map(Number);
const routes = routeArgs.length ? routeArgs : ROUTES;
const cap = Number(opt('--cap') ?? 6000);
const jobs = Number(opt('--jobs') ?? 3);
const out = opt('--out') ?? '/tmp/responsive';
const settleMs = Number(opt('--settle') ?? 3500);
const [scrollStep, scrollMs] = (opt('--scroll') ?? '400,100').split(',').map(Number);
mkdirSync(out, { recursive: true });

const OVERFLOW_JS = `(() => {
  const de = document.documentElement, W = de.clientWidth, out = [];
  if (de.scrollWidth > W) for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > W + 0.5) {
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible' && p.getBoundingClientRect().right <= W + 0.5) { clipped = true; break; } }
      if (!clipped) out.push(el.tagName.toLowerCase() + (el.dataset.motion ? '[' + el.dataset.motion + ']' : el.id ? '#' + el.id : '') + ' →' + Math.round(r.right));
    }
  }
  return { scrollWidth: de.scrollWidth, clientWidth: W, overflow: de.scrollWidth > W, offenders: out.slice(-6) };
})()`;
const FINISH_JS = `document.getAnimations().forEach(a => { try { a.finish(); } catch {} })`;
const ACTIVATE_JS = `(async () => { const c = document.querySelector('script[type="application/vnd.exact.checkpoint"]'); if (!c) return false;
  const x = self.exact ??= {}; if (!x.ready) x.ready = import(c.dataset.entry); try { await x.ready; } catch {} return true; })()`;
const HOLD_JS = `self.exact = { ready: new Promise(() => {}) };`;

type Box = { tag: string; text: string; rect: number[]; s: any };
// Every box laid out and in its own face before measuring: `content-visibility: auto` (web/content.css) skips a code
// block far from the window, so a short window's fresh load would never fetch the code font and measure the fallback's
// widths where the resized page (which drew the block before) has the real ones.
const READY_JS = `(async () => { if (!document.getElementById('rsp-cv')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'rsp-cv', textContent: '*{content-visibility:visible !important}' }));
  // The page's transient overlays (aria-hidden, put on the body by a script: /demos's sim hint, which a resize
  // dismisses on purpose, web/sim-hint.js) are no part of the layout.
  for (const n of document.body.children) if (n.getAttribute('aria-hidden') === 'true' && n.id !== 'exact-root') n.style.display = 'none';
  document.body.offsetHeight; await Promise.all([...document.fonts].map((f) => f.load().catch(() => {}))); await document.fonts.ready; })()`;
const boxes = async (p: Page): Promise<Box[]> => { await p.eval(READY_JS); await p.eval(FINISH_JS); await Bun.sleep(60); return p.eval(DOM_JS); };
const failures: string[] = [];
const rows: any[] = [];

// A small pool: `jobs` pages at once, each a fresh browser context (cold cache, no storage).
async function pool<T>(items: T[], fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function settled(cdp: Cdp, url: string, w: number, h: number) {
  const p = await newPage(cdp, w, { height: h });
  await p.goto(url);
  await Bun.sleep(settleMs);
  await p.eval(`(async()=>{const h=document.documentElement.scrollHeight;for(let y=0;y<h;y+=${scrollStep}){scrollTo(0,y);await new Promise(r=>setTimeout(r,${scrollMs}))}scrollTo(0,0)})()`);
  await p.eval(`self.exact && self.exact.startNow && self.exact.startNow()`);
  // The images the scroll-through passed (the rebuild's are loading=lazy, live's eager), loaded and decoded, up to 5 s.
  await p.eval(`Promise.race([Promise.all([...document.images].map((i) => i.complete ? i.decode().catch(() => {}) : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))), new Promise((r) => setTimeout(r, 5000))])`);
  await Bun.sleep(1200);
  return p;
}

async function fullShot(p: Page, w: number, file: string) {
  const height = Math.min(await p.eval<number>('document.documentElement.scrollHeight'), cap);
  await p.eval(`document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '*{content-visibility:visible !important}' })); document.body.offsetHeight`);
  await Bun.sleep(100);
  const shot = await p.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height, scale: 1 } });
  await Bun.write(file, Buffer.from(shot.data, 'base64'));
}

function placed(live: Box[], local: Box[]) {
  const lt = live.filter((b) => b.text), bt = local.filter((b) => b.text);
  let n = 0;
  for (const t of lt) {
    const d = (x: Box) => Math.abs(x.rect[0] - t.rect[0]) + Math.abs(x.rect[1] - t.rect[1]);
    const m = bt.filter((x) => x.text === t.text).sort((a, b) => d(a) - d(b))[0];
    if (m && Math.abs(m.rect[0] - t.rect[0]) <= 2 && Math.abs(m.rect[1] - t.rect[1]) <= 2 && m.s.fontSize === t.s.fontSize) n++;
  }
  return `${n}/${lt.length}`;
}

// Boxes of a resized page against a fresh load: by DOM order when both list the same tags, else by text.
function sameLayout(fresh: Box[], resized: Box[]): string[] {
  const bad: string[] = [];
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 1);
  const label = (b: Box) => `${b.tag}${b.text ? ' "' + b.text.slice(0, 24) + '"' : ''}`;
  if (fresh.length === resized.length && fresh.every((b, i) => b.tag === resized[i].tag)) {
    fresh.forEach((b, i) => { const r = resized[i]; if (!near(b.rect, r.rect) || b.s.fontSize !== r.s.fontSize) bad.push(`${label(b)} ${b.rect.join(',')} ${b.s.fontSize} → ${r.rect.join(',')} ${r.s.fontSize}`); });
    return bad;
  }
  bad.push(`boxes: ${fresh.length} fresh, ${resized.length} resized`);
  for (const t of fresh.filter((b) => b.text)) {
    const d = (x: Box) => Math.abs(x.rect[0] - t.rect[0]) + Math.abs(x.rect[1] - t.rect[1]);
    const m = resized.filter((x) => x.text === t.text).sort((a, b) => d(a) - d(b))[0];
    if (!m || !near(m.rect, t.rect) || m.s.fontSize !== t.s.fontSize) bad.push(`${label(t)} ${t.rect.join(',')} → ${m ? m.rect.join(',') : 'missing'}`);
  }
  return bad;
}

const { cdp, kill } = await launch({ port: 9480, scrollbars: flag('--scrollbars') });
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { kill(); process.exit(130); });
const differ = await newPage(cdp, 400);

if (!flag('--no-matrix')) {
  const cells: [string, number, number][] = [];
  for (const r of routes) {
    for (const w of widths) cells.push([r, w, w < 800 ? 844 : 900]);
    for (const h of shortHeights) for (const w of shortWidths) cells.push([r, w, h]);
  }
  await pool(cells, async ([route, w, h]) => {
    const name = `${slugName(route)}@${w}x${h}`;
    // One after the other, each shot and closed before the next loads: two heavy pages settling at once starve each
    // other (an unrevealed card, a late font, a demo not yet drawn).
    const capture = async (origin: string, side: string) => {
      const p = await settled(cdp, origin + route, w, h);
      const r = { ov: await p.eval<any>(OVERFLOW_JS), dom: await p.eval<Box[]>(DOM_JS) };
      await fullShot(p, w, `${out}/${name}.${side}.jpg`);
      await p.close();
      return r;
    };
    const { max, why } = budget(route, w);
    let A = await capture(liveOrigin, 'live'), B = await capture(localOrigin, 'local');
    let d = await diffImages(differ, `${out}/${name}.live.jpg`, `${out}/${name}.local.jpg`, { diffOut: '' });
    // Over budget: once more, both sides. A third party's late frame (live's YouTube player is made by its API script,
    // sometimes after the settle), a reveal missed by the scroll-through or a late font is not the layout.
    if (d.ratio * 100 > max) {
      A = await capture(liveOrigin, 'live'); B = await capture(localOrigin, 'local');
      d = await diffImages(differ, `${out}/${name}.live.jpg`, `${out}/${name}.local.jpg`, { diffOut: '' });
    }
    const ov = B.ov, liveOv = A.ov, texts = placed(A.dom, B.dom);
    const px = Math.round(d.ratio * 10000) / 100;
    const row = { kind: 'matrix', route, w, h, overflow: ov.overflow, liveOverflow: liveOv.overflow, offenders: ov.offenders, px, budget: max, why, texts, heights: [d.a[1], d.b[1]] };
    rows.push(row);
    const fail = ov.overflow || px > max;
    if (px > max) await diffImages(differ, `${out}/${name}.live.jpg`, `${out}/${name}.local.jpg`, { diffOut: `${out}/${name}.diff.png` });
    if (fail) failures.push(`${route} ${w}x${h}: ${ov.overflow ? `overflow ${ov.scrollWidth} > ${ov.clientWidth} ${ov.offenders.join(' ')}` : ''}${px > max ? ` pixels ${px}% > ${max}%` : ''}`);
    console.log(`${fail ? 'FAIL' : 'ok  '} ${route} ${w}x${h}: ${ov.overflow ? 'OVERFLOW ' : ''}${px}% px (budget ${max}${why ? ', ' + why : ''}), texts ${texts}${liveOv.overflow ? ', live overflows' : ''}`);
  });
}

// One page resized through the steps against fresh loads at each size, in one phase (static HTML or started runtime).
async function resizeRoute(origin: string, route: string, phase: 'static' | 'runtime', side: string) {
  const sizes: [number, number][] = [...RESIZE_STEPS.map((w) => [w, 900] as [number, number]), ...RESIZE_STEPS.slice(0, -1).reverse().map((w) => [w, 900] as [number, number]), ...HEIGHT_STEPS];
  const open = async (w: number, h: number) => {
    const p = await newPage(cdp, w, { height: h });
    // A desktop window being resized: never the touch emulation newPage gives a narrow one.
    await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    if (phase === 'static') await p.send('Page.addScriptToEvaluateOnNewDocument', { source: HOLD_JS });
    await p.goto(origin + route);
    await Bun.sleep(1500);
    if (phase === 'runtime') { await p.eval(ACTIVATE_JS); await Bun.sleep(1500); }
    return p;
  };
  const fresh = new Map<string, Box[]>();
  const uniq = [...new Map(sizes.map((s) => [s.join('x'), s])).values()];
  await pool(uniq, async ([w, h]) => { const p = await open(w, h); fresh.set(`${w}x${h}`, await boxes(p)); await p.close(); });
  const p = await open(1440, 900);
  let bad = 0;
  for (const [w, h] of sizes) {
    await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await Bun.sleep(500);
    const diff = sameLayout(fresh.get(`${w}x${h}`)!, await boxes(p));
    const ov = await p.eval<any>(OVERFLOW_JS);
    if (diff.length || ov.overflow) {
      bad++;
      failures.push(`resize ${side} ${route} (${phase}) → ${w}x${h}: ${ov.overflow ? 'overflow; ' : ''}${diff.length} boxes moved: ${diff.slice(0, 3).join(' | ')}`);
    }
    rows.push({ kind: 'resize', side, route, phase, w, h, moved: diff.length, overflow: ov.overflow, sample: diff.slice(0, 5) });
  }
  console.log(`${bad ? 'FAIL' : 'ok  '} resize ${side} ${route} (${phase}): ${sizes.length} steps, ${bad} differ from a fresh load`);
  await p.close();
}

// The same through a real window (headed Chrome, its own process): innerWidth/innerHeight set by the window's bounds.
async function windowRoute(origin: string, route: string) {
  const { cdp: c, kill: k } = await launch({ port: 9481, headed: true, scrollbars: flag('--scrollbars') });
  const win = async () => {
    const { browserContextId } = await c.send('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await c.send('Target.createTarget', { url: 'about:blank', browserContextId, newWindow: true });
    const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
    const p = new Page(c, sessionId, targetId, browserContextId);
    await p.send('Page.enable'); await p.send('Runtime.enable');
    const { windowId } = await c.send('Browser.getWindowForTarget', { targetId });
    return { p, windowId };
  };
  const size = async (windowId: number, p: Page, w: number, h: number) => {
    for (let i = 0; i < 4; i++) {
      const [iw, ih, ow, oh] = await p.eval<number[]>('[innerWidth, innerHeight, outerWidth, outerHeight]');
      if (iw === w && ih === h) break;
      await c.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0, width: ow + w - iw, height: oh + h - ih } });
      await Bun.sleep(250);
    }
    return p.eval<number[]>('[innerWidth, innerHeight]');
  };
  const steps = [1440, 1100, 1024, 900, 768, 767, 640, 500];
  const sizes = [...steps, ...steps.slice(0, -1).reverse()];
  const fresh = new Map<number, Box[]>();
  for (const w of steps) { const { p, windowId } = await win(); await size(windowId, p, w, 800); await p.goto(origin + route); await Bun.sleep(2500); fresh.set(w, await boxes(p)); await p.close(); }
  const { p, windowId } = await win();
  await size(windowId, p, 1440, 800);
  await p.goto(origin + route);
  await Bun.sleep(2500);
  let bad = 0;
  for (const w of sizes) {
    const got = await size(windowId, p, w, 800);
    await Bun.sleep(500);
    if (got[0] !== w) { console.log(`  window ${route}: asked ${w}, got ${got[0]}`); continue; }
    const diff = sameLayout(fresh.get(w)!, await boxes(p));
    const ov = await p.eval<any>(OVERFLOW_JS);
    if (diff.length || ov.overflow) { bad++; failures.push(`window ${route} → ${w}: ${ov.overflow ? 'overflow; ' : ''}${diff.length} boxes moved: ${diff.slice(0, 3).join(' | ')}`); }
    rows.push({ kind: 'window', route, w, moved: diff.length, overflow: ov.overflow, sample: diff.slice(0, 5) });
  }
  console.log(`${bad ? 'FAIL' : 'ok  '} window ${route}: ${sizes.length} steps, ${bad} differ from a fresh load`);
  await p.close();
  k();
}

if (!flag('--no-resize')) {
  for (const route of routes) {
    for (const phase of ['static', 'runtime'] as const) {
      await resizeRoute(localOrigin, route, phase, 'local');
      if (flag('--resize-live') && phase === 'runtime') await resizeRoute(liveOrigin, route, phase, 'live');
    }
    if (flag('--window')) await windowRoute(localOrigin, route);
  }
}

await Bun.write(`${out}/responsive.json`, JSON.stringify(rows, null, 2));
console.log(failures.length ? `\n${failures.length} failure(s):\n${failures.join('\n')}` : '\nresponsive: no overflow, every width within budget, every resize equal to a fresh load');
kill();
process.exit(failures.length ? 1 : 0);
