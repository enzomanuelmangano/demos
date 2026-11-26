#!/usr/bin/env bun
// A demo post's deep link (docs/decisions.md D21, D25): /demos/<slug> is the article, whose phone beside it (from
// 1024 px) pages to the demo and opens it (web/sim-goto.js asks; tools/demos-web/bridge.js `goto` does it inside the app).
//   bun tools/parity/sim-goto.ts <origin> [--headed] [--only 1,3] [--reps 3] [--out .out/parity/sim-goto]   (exit 1 on any failure)
// 1. For three posts on different launcher pages (the first, a middle and the last page, read from the launcher's
//    layout at run time): the page cold at /demos/<slug> (1440x900); the pager moves to the icon's page, the demo
//    opens, the URL stays /demos/<slug>, the page's history gains no entry, no touch disc or arrow plays. Frame timing
//    (rAF inside the app's own process) over the paging and over the open, then the same paging and open by hand
//    (the app's arrow keys and a click into the frame) on a fresh page cold at /demos, from its live moment, the click
//    as long after live as the deep link's press, `--reps` times each: the deep link's median drops may exceed the
//    hand's by no more than two 60 Hz frames plus a quarter of the hand's, per phase (use --headed: real vsync). Screens: <out>/<slug>-{paging,open}.png.
// 2. Back after a cold deep link (arrived from /articles): the page returns to /articles.
// 3. In-site, with the kept frame live (/demos first): a router navigation to /demos/<slug> runs the goto without a
//    reload of the frame, the URL is /demos/<slug>; Back returns to /demos with the demo closed (launcher); Forward
//    opens it again; a link to /demos from the post closes it too.
// 4. Input during the sequence (a wheel on the page) stops it: no demo opens, the URL stays.
// 5. Reduced motion: the pages jump (no frame between), the demo opens.
// 6. A phone (390x844, touch): no frame loads; "Try the live demo" links to /demos/app/demo/<app>; a tap opens that
//    demo full screen; Back returns to /demos/<slug>.
// 7. A post whose demo has no icon on the web launcher (an unstable demo): the launcher stays as it is.
// 8. Reading: the article scrolls under the header while the phone stays where it is; a post whose demo the app has
//    not shows no phone, and coming back to one with a phone finds the same frame (no reload).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, newPage, type Page } from './cdp.ts';
import { DEMO_POSTS, NOT_IN_APP } from '../demos-web/legacy-posts.ts';

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const origin = (args[0] ?? 'http://127.0.0.1:4318').replace(/\/$/, '');
const out = opt('--out', '.out/parity/sim-goto')!;
// --only 1,3: run those parts (the launcher's pages are always read).
const only = opt('--only')?.split(',');
const part = (n: number) => !only || only.includes(String(n));
mkdirSync(out, { recursive: true });
const { cdp, kill } = await launch({ port: 9622, headed: args.includes('--headed') });
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const report: Record<string, any> = { origin, at: new Date().toISOString() };

const until = async (f: () => Promise<boolean>, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f().catch(() => false)) return true; await Bun.sleep(40); } return false; };
type App = { eval: <T = any>(e: string) => Promise<T> };
// The page under test (each part's newest), whose frame app() attaches to.
let cur: Page | null = null;
const open = async (...a: Parameters<typeof newPage>) => (cur = await newPage(...a));
async function app(): Promise<App | null> {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const t = targetInfos.filter((t: any) => t.type === 'iframe' && t.url.includes('/demos/app/') && (!cur || t.browserContextId === cur.contextId)).pop();
  if (!t) return null;
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  return { eval: async (e) => (await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId)).result.value };
}
const appPath = async () => (await (await app())?.eval<string>('location.pathname')) ?? '';
const path = (page: Page) => page.eval<string>('location.pathname');
const hist = async (page: Page) => { const h = await page.send('Page.getNavigationHistory'); return { index: h.currentIndex, paths: h.entries.map((e: any) => new URL(e.url).pathname) as string[], entries: h.entries }; };
const back = async (page: Page) => { const h = await hist(page); await page.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.index - 1].id }); };
const forward = async (page: Page) => { const h = await hist(page); await page.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.index + 1].id }); };
const live = (page: Page) => until(() => page.eval(`!!document.querySelector('iframe[data-motion~=live], iframe[data-ready]')?.checkVisibility()`), 45000);
const launcher = () => until(async () => (await appPath()).replace(/\/$/, '') === '/demos/app', 8000);
const click = async (page: Page, x: number, y: number) => { await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); for (const type of ['mousePressed', 'mouseReleased']) { await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); await Bun.sleep(60); } };
const shot = async (page: Page, name: string) => { const s = await page.send('Page.captureScreenshot', { format: 'png' }); const f = join(out, `${name}.png`); writeFileSync(f, Buffer.from(s.data, 'base64')); return f; };
// The goto's progress as the page hears it (web/sim-goto.js listens to the same messages).
const LISTEN = `window.__goto = []; addEventListener('message', (e) => { if (e.data && e.data.demos === 'goto') window.__goto.push({ ...e.data, t: performance.now() }); });`;
const states = (page: Page) => page.eval<{ state: string; slug: string; t: number }[]>('window.__goto || []');
const hasHints = (page: Page) => page.eval<boolean>(`[...document.body.children].some((e) => (e.style && e.style.width === '44px' && e.style.borderRadius === '50%') || (e.localName === 'svg' && e.querySelector('[id^=demos-arrow]')))`);
// Frame sampler in the app's document: rAF times while on.
const SAMPLER = `(() => { if (window.__fs) return; const s = window.__fs = { t: [], on: false }; const step = (t) => { if (s.on) s.t.push(t); requestAnimationFrame(step); }; requestAnimationFrame(step); })()`;
const dropped = (t: number[], vsync: number) => t.slice(1).reduce((n, v, i) => n + Math.max(0, Math.round((v - t[i]) / vsync) - 1), 0);
const appPage = (a: App, slug: string) => a.eval<number | null>(`(() => { const i = [...document.querySelectorAll('[data-testid="icon-${slug}"]')].find((e) => e.closest('[data-testid=pager-track]') && e.getBoundingClientRect().width > 0); if (!i) return null; const p = i.closest('[data-testid=pager]').getBoundingClientRect(), r = i.getBoundingClientRect(); return Math.floor((r.left + r.width / 2 - p.left) / p.width); })()`);
const frameOff = (page: Page) => page.eval<{ x: number; y: number }>(`(() => { const f = [...document.querySelectorAll('iframe[data-motion~=live], iframe[data-ready]')].find((f) => f.checkVisibility()); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);

const mark = async (page: Page) => { await page.eval('window.__kept = 1'); await (await app())!.eval('window.__kept = 1'); };
const kept = async (page: Page) => (await page.eval<number>('window.__kept')) === 1 && (await (await app())!.eval<number>('window.__kept')) === 1;

// ---------------------------------------------------------------- the launcher's pages, from its layout
const pages: Record<string, number> = {};
{
  const page = await open(cdp, 1440, { height: 900 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('reactiive.demos.hint', '1'); sessionStorage.setItem('reactiive.demos.arrow', 'off') } catch {}` });
  await page.goto(`${origin}/demos`);
  await live(page);
  const a = (await app())!;
  await until(async () => (await a.eval<number>(`document.querySelectorAll('[data-testid=pager-track] [data-testid^=icon-]').length`)) > 50);
  for (const d of DEMO_POSTS) { const p = await appPage(a, d.app); if (p !== null) pages[d.slug] = p; }
  const missing = DEMO_POSTS.filter((d) => !(d.slug in pages)).map((d) => d.slug);
  report.pages = pages; report.missing = missing;
  console.log(`launcher: ${Object.keys(pages).length} posts' icons on ${Math.max(...Object.values(pages)) + 1} pages${missing.length ? `; no icon (the phone stays on its launcher): ${missing.join(' ')}` : ''}`);
  await page.close();
}
const last = Math.max(...Object.values(pages));
const pick = (p: number) => DEMO_POSTS.find((d) => pages[d.slug] === p)!;
const chosen = [pick(0), pick(Math.max(1, Math.floor(last / 2))), pick(last)].filter((d, i, a) => d && a.indexOf(d) === i);

// ---------------------------------------------------------------- 1. cold deep links, and the same by hand
const reps = Number(opt('--reps', '3'));
const runs: Record<string, { deep: any; hand: any }[]> = {};
if (part(1)) for (let rep = 0; rep < reps; rep++) for (const d of chosen) {
  const page = await open(cdp, 1440, { height: 900, scale: 2 });
  const errors: string[] = [];
  page.on((e) => { if (e.method === 'Runtime.exceptionThrown') errors.push(e.params.exceptionDetails?.exception?.description?.slice(0, 160)); });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LISTEN });
  await page.goto(`${origin}/demos/${d.slug}`);
  await live(page);
  const a = (await app())!;
  await a.eval(SAMPLER);
  await a.eval(`(window.__fs.t = [], window.__fs.on = true)`);
  const tl = await a.eval<number>('performance.now()');
  // A screen mid-paging (the last page only: the first has none).
  let paging = '';
  if (pages[d.slug] > 0) { await until(async () => ((await appPage(a, d.app)) ?? 0) < pages[d.slug], 8000); await Bun.sleep(120); paging = await shot(page, `${d.slug}-paging`); }
  const opened = await until(async () => (await states(page)).some((s) => s.state === 'opened'), 20000);
  await Bun.sleep(900);
  const t = await a.eval<number[]>('(window.__fs.on = false, window.__fs.t)');
  const ss = await states(page);
  const openShot = await shot(page, `${d.slug}-open`);
  const vsync = [...t.slice(1).map((v, i) => v - t[i])].sort((x, y) => x - y)[Math.floor(t.length / 2)] || 16.67;
  // The page's clock and the app's differ: the phases are split by the app's own times (paged: the pager at rest).
  const pagedAt = await a.eval<number>(`performance.now()`) - ((await page.eval<number>('performance.now()')) - (ss.find((s) => s.state === 'paged')?.t ?? 0));
  const deep = { paging: dropped(t.filter((x) => x <= pagedAt), vsync), open: dropped(t.filter((x) => x > pagedAt), vsync), frames: t.length, vsync: +vsync.toFixed(2), sinceLive: Math.round(pagedAt - tl) };
  const h = await hist(page);
  check(opened && (await appPath()) === `/demos/app/demo/${d.app}`, `1 ${d.slug} (page ${pages[d.slug] + 1}): the demo opened in the frame (${await appPath()})`);
  check((await path(page)) === `/demos/${d.slug}` && h.paths.filter((p) => p !== 'blank').length === 1, `1 ${d.slug}: the URL stayed /demos/${d.slug}, no entry added (${h.paths.join(' ')})`);
  check(!(await hasHints(page)), `1 ${d.slug}: no touch disc, no arrow`);
  check(errors.length === 0, `1 ${d.slug}: no exceptions ${errors.join(' | ')}`);
  await page.close();
  // By hand, on the same terms: a fresh page cold at /demos (the same first load of the app and of the demo's code),
  // from the frame's live moment: its arrow keys to the icon's page, a click on the icon as long after live as the deep link's.
  const hp = await open(cdp, 1440, { height: 900, scale: 2 });
  await hp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('reactiive.demos.hint', '1'); sessionStorage.setItem('reactiive.demos.arrow', 'off') } catch {}` });
  await hp.goto(`${origin}/demos`);
  await live(hp);
  const ha = (await app())!;
  await ha.eval(SAMPLER);
  await ha.eval(`(window.__fs.t = [], window.__fs.on = true)`);
  const handLive = await ha.eval<number>('performance.now()');
  await until(async () => (await ha.eval<string>(`document.querySelector('[data-testid=pager-track]')?.style.willChange ?? ''`)) === 'transform', 20000);
  await Bun.sleep(300);
  const off = await frameOff(hp);
  // The app's own keys page it (a click on the status bar first gives the frame the focus): real input on the same
  // pager and paging spring. (CDP's mouse drags and wheels into this clipped out-of-process frame reach it once and then
  // no more, so they cannot stand in for a swipe here.)
  for (const type of ['mousePressed', 'mouseReleased']) await hp.send('Input.dispatchMouseEvent', { type, x: off.x + 300, y: off.y + 40, button: 'left', clickCount: 1 });
  await Bun.sleep(200);
  for (let i = 0; i < 8 && ((await appPage(ha, d.app)) ?? 0) > 0; i++) { for (const type of ['rawKeyDown', 'keyUp']) await hp.send('Input.dispatchKeyEvent', { type, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }); await Bun.sleep(450); }
  // At rest (a press while the pages settle only catches them, as on iOS).
  let lx = NaN;
  await until(async () => { const x = await ha.eval<number>(`document.querySelector('[data-testid="icon-${d.app}"]').getBoundingClientRect().left`); const ok = Math.abs(x - lx) < 0.02; lx = x; return ok; }, 3000);
  // The click at the moment the deep link pressed (as long after live), so both open the demo as cold.
  const sinceLive = async () => (await ha.eval<number>('performance.now()')) - handLive;
  if ((await sinceLive()) < deep.sinceLive + 260) await Bun.sleep(deep.sinceLive + 260 - (await sinceLive()));
  const mPaged = await ha.eval<number>('performance.now()');
  const icon = await ha.eval<any>(`(() => { const i = [...document.querySelectorAll('[data-testid="icon-${d.app}"]')].find((e) => e.closest('[data-testid=pager-track]') && e.getBoundingClientRect().width > 0); const r = i.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await click(hp, off.x + icon.x, off.y + icon.y);
  const handOpened = await until(async () => (await appPath()) === `/demos/app/demo/${d.app}`, 8000);
  await Bun.sleep(900);
  const m = await ha.eval<number[]>('(window.__fs.on = false, window.__fs.t)');
  const hand = { paging: dropped(m.filter((x) => x <= mPaged), vsync), open: dropped(m.filter((x) => x > mPaged), vsync), frames: m.length };
  check(handOpened, `1 ${d.slug}: by hand, the click opened the demo too (${await appPath()})`);
  (runs[d.slug] ??= []).push({ deep, hand });
  console.log(`     ${d.slug} run ${rep + 1}: dropped frames, deep link paging ${deep.paging} / open ${deep.open}; by hand paging ${hand.paging} / open ${hand.open} (vsync ${deep.vsync} ms)`);
  (report.cold ??= []).push({ slug: d.slug, app: d.app, page: pages[d.slug], deep, hand, states: ss.map((s) => s.state), shots: [paging, openShot].filter(Boolean) });
  await hp.close();
}

// A cold demo's first mount drops 10-40 frames at 120 Hz whichever way it is opened, run to run: compared as medians
// over the runs, with a slack of two 60 Hz frames (four at 120 Hz) plus a quarter of the hand's.
for (const [slug, rs] of Object.entries(runs)) {
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const vs = rs[0].deep.vsync, slack = (n: number) => n + Math.round(2 * 16.67 / vs) + Math.round(n / 4);
  const dp = med(rs.map((r) => r.deep.paging)), hp = med(rs.map((r) => r.hand.paging)), dO = med(rs.map((r) => r.deep.open)), hO = med(rs.map((r) => r.hand.open));
  (report.medians ??= {})[slug] = { deep: { paging: dp, open: dO }, hand: { paging: hp, open: hO }, runs: rs.length, vsync: vs };
  check(dp <= slack(hp) && dO <= slack(hO), `1 ${slug}: dropped frames (median of ${rs.length}), deep link paging ${dp} / open ${dO}; by hand paging ${hp} / open ${hO} (vsync ${vs} ms)`);
}

// ---------------------------------------------------------------- 2. Back after a cold deep link
if (part(2)) {
  const d = chosen[1] ?? chosen[0];
  const page = await open(cdp, 1440, { height: 900 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LISTEN });
  await page.goto(`${origin}/articles`); await Bun.sleep(1500);
  await page.goto(`${origin}/demos/${d.slug}`);
  await live(page);
  const opened = await until(async () => (await states(page)).some((s) => s.state === 'opened'), 20000);
  await Bun.sleep(600);
  await back(page);
  check(opened && await until(async () => (await path(page)) === '/articles', 8000), `2 ${d.slug}: Back after the deep link returns to /articles (where the reader came from)`);
  await page.close();
}

// ---------------------------------------------------------------- 3. in-site, with the kept frame live
if (part(3)) {
  const d = chosen.at(-1)!, d2 = chosen[0];
  const page = await open(cdp, 1440, { height: 900 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LISTEN + `try { sessionStorage.setItem('reactiive.demos.hint', '1'); sessionStorage.setItem('reactiive.demos.arrow', 'off') } catch {}` });
  await page.goto(`${origin}/demos`);
  await live(page); await Bun.sleep(1500);
  // The same documents throughout: a mark on the page and in the app (a reload of either would lose it).
  await mark(page);
  // A link as a page of the site holds it (inside the app's root, so the router takes it in place).
  const go = async (href: string) => {
    await page.eval(`(() => { const a = document.createElement('a'); a.href = ${JSON.stringify(href)}; a.id = 'probe-link'; a.textContent = 'x'; a.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:99;font-size:12px'; document.getElementById('probe-link')?.remove(); document.getElementById('exact-root').appendChild(a); })()`);
    const r = await page.eval<any>(`(() => { const r = document.getElementById('probe-link').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await click(page, r.x, r.y);
  };
  await go(`/demos/${d.slug}`);
  const opened = await until(async () => (await appPath()) === `/demos/app/demo/${d.app}`, 20000);
  await Bun.sleep(800);
  const h = await hist(page);
  check(opened && (await path(page)) === `/demos/${d.slug}`, `3 in-site link to /demos/${d.slug} with the frame live: the demo opened, URL /demos/${d.slug}`);
  check(await kept(page), '3 neither the page nor the kept frame was reloaded');
  check(h.paths.filter((p) => p !== 'blank').join(' ') === `/demos /demos/${d.slug}`, `3 the history is the reader's two pages: ${h.paths.join(' ')}`);
  await back(page);
  const closed = await until(async () => (await path(page)) === '/demos', 8000) && await launcher();
  check(closed, `3 Back: /demos, the demo closed (${await appPath()})`);
  await Bun.sleep(800);
  await forward(page);
  check(await until(async () => (await path(page)) === `/demos/${d.slug}` && (await appPath()) === `/demos/app/demo/${d.app}`, 20000), `3 Forward: /demos/${d.slug}, the demo open again`);
  await Bun.sleep(800);
  // Another post in-site: the open demo closes and the other opens (no reload).
  await go(`/demos/${d2.slug}`);
  check(await until(async () => (await appPath()) === `/demos/app/demo/${d2.app}`, 20000) && await kept(page), `3 a second post in-site: ${d2.app} open, no reload`);
  await Bun.sleep(800);
  await go('/demos');
  check(await until(async () => (await path(page)) === '/demos', 8000) && await launcher(), `3 a link to /demos from the post closes the demo (${await appPath()})`);
  check(!(await hasHints(page)), '3 no touch disc or arrow on /demos after a deep link');
  await page.close();
}

// ---------------------------------------------------------------- 4. input stops it
if (part(4)) {
  const d = chosen.at(-1)!;
  const page = await open(cdp, 1440, { height: 900 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LISTEN });
  await page.goto(`${origin}/demos/${d.slug}`);
  await live(page);
  const a = (await app())!;
  await until(async () => ((await appPage(a, d.app)) ?? 0) < pages[d.slug], 15000);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 200, y: 400, deltaX: 0, deltaY: 40 });
  await Bun.sleep(3500);
  check((await appPath()).replace(/\/$/, '') === '/demos/app' && (await path(page)) === `/demos/${d.slug}`, `4 a wheel on the page mid-paging stops the rest: no demo opened (${await appPath()})`);
  await page.close();
}

// ---------------------------------------------------------------- 5. reduced motion
if (part(5)) {
  const d = chosen.at(-1)!;
  const page = await open(cdp, 1440, { height: 900 });
  const reduce = { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] };
  await page.send('Emulation.setEmulatedMedia', reduce);
  // The app's frame is its own target: it gets the same media before its scripts run (as the OS setting would).
  const offAttach = cdp.on(async (e) => {
    if (e.method !== 'Target.attachedToTarget' || e.sessionId !== page.sessionId || e.params.targetInfo.type !== 'iframe') return;
    const sid = e.params.sessionId;
    await cdp.send('Emulation.setEmulatedMedia', reduce, sid).catch(() => {});
    await cdp.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {});
  });
  await page.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LISTEN });
  await page.goto(`${origin}/demos/${d.slug}`);
  await live(page);
  const a = (await app())!;
  const seen = new Set<number>();
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && !(await states(page)).some((s) => s.state === 'opened')) { const p = await a.eval<number | null>(`(() => { const i = [...document.querySelectorAll('[data-testid="icon-${d.app}"]')].find((e) => e.closest('[data-testid=pager-track]')); if (!i) return null; const p = i.closest('[data-testid=pager]').getBoundingClientRect(), r = i.getBoundingClientRect(); return Math.round((r.left - p.left) / p.width * 100) / 100; })()`); if (p !== null) seen.add(p); await Bun.sleep(16); }
  // The icon's place in pages (its column's offset in the page): it jumps from page to page, never between.
  const frac = (p: number) => +(p - Math.floor(p)).toFixed(2);
  const fracs = new Set([...seen].map(frac));
  check((await appPath()) === `/demos/app/demo/${d.app}` && fracs.size === 1, `5 reduced motion: the pages jump (offsets seen ${[...seen].join(' ')}), the demo opened (${await appPath()})`);
  offAttach();
  await page.close();
}

// ---------------------------------------------------------------- 6. a phone
if (part(6)) {
  const d = chosen[1] ?? chosen[0];
  const page = await open(cdp, 390, { height: 844, scale: 3 });
  await page.goto(`${origin}/demos/${d.slug}`); await Bun.sleep(2500);
  const frame = await page.eval<boolean>(`[...document.querySelectorAll('iframe[title="Demos"]')].some((f) => f.src.includes('/demos/app/'))`);
  const btn = await page.eval<any>(`(() => { const a = document.querySelector('[data-testid=open-demo]'); if (!a) return null; const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), text: a.textContent.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  check(!frame, '6 phone: no frame loads');
  check(btn?.href === `/demos/app/demo/${d.app}` && btn?.text === 'Try the live demo' && btn.y < 844, `6 phone: the button "${btn?.text}" → ${btn?.href}, in the first screen (y ${Math.round(btn?.y)})`);
  const before = await shot(page, `phone-${d.slug}`);
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: btn.x, y: btn.y }] }); await Bun.sleep(60);
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const opened = await until(async () => (await path(page)) === `/demos/app/demo/${d.app}` && await page.eval<boolean>(`!!document.querySelector('[data-testid="demo-${d.app}"]')`), 30000);
  await Bun.sleep(1500);
  const opened2 = await shot(page, `phone-${d.slug}-open`);
  check(opened, `6 phone: a tap opens ${d.app} full screen (${await path(page)})`);
  await back(page);
  check(await until(async () => (await path(page)) === `/demos/${d.slug}`, 8000), '6 phone: Back returns to the post');
  report.phone = { slug: d.slug, shots: [before, opened2] };
  await page.close();
}

// ---------------------------------------------------------------- 7. a post whose icon the launcher lacks
if (part(7) && report.missing.length) {
  const slug = report.missing[0], d = DEMO_POSTS.find((x) => x.slug === slug)!;
  const page = await open(cdp, 1440, { height: 900 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LISTEN });
  await page.goto(`${origin}/demos/${slug}`);
  await live(page);
  const said = await until(async () => (await states(page)).some((s) => s.state === 'missing'), 20000);
  await Bun.sleep(800);
  check(said && (await appPath()).replace(/\/$/, '') === '/demos/app' && (await path(page)) === `/demos/${slug}`, `7 ${slug} (no icon on the web launcher): the phone stays on its launcher, the URL stays (${await appPath()})`);
  void d;
  await page.close();
}

// ---------------------------------------------------------------- 8. reading, and a post without a phone
if (part(8)) {
  const d = chosen[0], bare = NOT_IN_APP[0];
  const page = await open(cdp, 1440, { height: 900 });
  await page.goto(`${origin}/demos/${d.slug}`);
  await live(page); await Bun.sleep(1500);
  await mark(page);
  const box = () => page.eval<any>(`(() => { const f = [...document.querySelectorAll('iframe[title="Demos"]')].find((f) => f.checkVisibility()); const h = document.querySelector('main h1').getBoundingClientRect(), a = document.querySelector('[data-motion~=post-sim]').getBoundingClientRect(); if (!f) return null; const r = f.getBoundingClientRect(), sw = Math.min(420, (r.height - 48) * 0.448718); return { top: Math.round(r.top), left: Math.round(r.left + (r.width - sw) / 2), title: Math.round(h.top), right: Math.round(a.right), hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === f, y: scrollY }; })()`);
  const b0 = await box();
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 200, y: 400, deltaX: 0, deltaY: 900 }); await Bun.sleep(900);
  const b1 = await box();
  check(!!b0 && !!b1 && b1.y > 600 && b1.title < b0.title && b1.top === b0.top, `8 the article scrolls (${b1?.y} px), the phone stays (top ${b0?.top} → ${b1?.top})`);
  check(!!b1 && b1.right <= b1.left && b1.hit, `8 the phone beside the column (column to ${b1?.right}, screen from ${b1?.left}), taking the pointer`);
  await page.eval(`scrollTo(0, document.documentElement.scrollHeight)`); await Bun.sleep(600);
  const footer = await page.eval<boolean>(`(() => { const as = [...document.querySelectorAll('footer a')].filter((a) => a.checkVisibility()); return as.length > 0 && as.every((a) => { const r = a.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('a') === a; }); })()`);
  check(footer, "8 the footer's links are clear at the page's end");
  const go = async (href: string) => page.eval(`(() => { const a = document.createElement('a'); a.href = ${JSON.stringify(href)}; a.hidden = true; document.getElementById('exact-root').appendChild(a); a.click(); a.remove(); })()`);
  await go(`/demos/${bare}`);
  const gone = await until(async () => (await path(page)) === `/demos/${bare}` && await page.eval<boolean>(`document.querySelector('main h1')?.textContent.length > 0 && ![...document.querySelectorAll('iframe[title="Demos"]')].some((f) => f.checkVisibility()) && !!document.querySelector('[data-motion~=post-plain]') && scrollY === 0`), 8000);
  check(gone, `8 /demos/${bare} (no demo in the app): the article at its top, no phone`);
  await go(`/demos/${d.slug}`);
  check(await until(async () => (await box()) !== null && (await appPath()) === `/demos/app/demo/${d.app}`, 20000) && await kept(page), `8 back to a post with a phone: the same page and frame, ${d.app} open`);
  await page.close();
}

writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(`report: ${join(out, 'report.json')}`);
kill();
if (fails.length) { console.error(`sim-goto: ${fails.length} failure(s)`); process.exit(1); }
console.log('sim-goto: deep links page, open, and keep the history');
process.exit(0);
