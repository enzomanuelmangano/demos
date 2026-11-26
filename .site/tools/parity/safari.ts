#!/usr/bin/env bun
// Safari: the checks that tell WebKit apart from Chrome on this site (the rest of tools/parity is Chrome over CDP).
//   bun tools/parity/safari.ts <origin> [--driver safaridriver|webkit] [--pw <dir>] [--shots <dir>]   (exit 1 on a failure)
// Drivers (nothing is installed in this repo):
// - safaridriver (default when Safari answers): the real Safari over WebDriver. Needs Safari > Settings > Advanced >
//   "Show features for web developers", then Developer > "Allow remote automation" (or `safaridriver --enable`, which
//   asks for an administrator's password) once per Mac. Started on a free port by this script.
// - webkit: Playwright's WebKit, a proxy for Safari (same engine, not the same build), from a Playwright install
//   outside the repo: `--pw <dir>` (or PLAYWRIGHT_DIR) is a directory whose node_modules has playwright, set up with
//   `bun add playwright && bunx playwright install webkit`. Only the webkit driver runs check 6 (it hides
//   window.navigation, which a WebDriver session cannot do before the page's scripts).
// Checks, at 1440 x 900 unless said:
// 1. A nested page's runtime starts: the built entry is root-relative (data-entry="/app-…", tools/entry-url.ts: WebKit
//    resolves an inline script's import() against the page's address, not its <base>), and on /articles/<slug> and
//    /demos/<slug>, after a press, the header's Articles link is an in-app navigation (the window survives it).
// 2. The framed Demos app on /demos opens a demo at a real click and closes it at its close button: WebKit refuses a
//    pushState that changes the path in a sandboxed (opaque-origin) frame; tools/demos-web/bridge.js makes the entry
//    without its URL. The page's history gains one entry for the demo and gives it back at the close.
// 3. A demo post's deep link (/demos/sphere-waves) opens that demo in the frame; the header's Demos link closes it.
// 4. Back from that post returns to the page before (/articles); Forward comes back with the demo open again.
// 5. The framed keyboard (tools/demos-web/keyboard.js): a click in cherry-blossom-qrcode's field brings up the keys.
// 6. (webkit only) Without the Navigation API (Safari before 26.2): the header's Demos link still closes the demo a
//    deep link opened (web/sim-goto.js watches the history writes).
// 7. Sign In opens its dialog; Escape closes it. localStorage writes and reads back.
// Printed, not checked: the engine's support of the APIs the site uses (each has a fallback, or is CSS that degrades),
// the frame's WebGPU adapter, and the page errors seen (WebKit logs the frame's Web Share permission-policy check).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const origin = (args[0] ?? 'http://127.0.0.1:4310').replace(/\/$/, '');
const shots = opt('--shots');
if (shots) mkdirSync(shots, { recursive: true });
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const info = (what: string, v: unknown) => console.log(`info ${what}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
const until = async (f: () => Promise<boolean>, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f().catch(() => false)) return true; await Bun.sleep(100); } return false; };

// ---------------------------------------------------------------- drivers
// The page's script runs as a function body (`return …`); the frame's the same, in the live framed app.
interface Driver {
  name: string;
  open(opts?: { noNavigationApi?: boolean }): Promise<void>;
  goto(path: string): Promise<void>;
  eval<T = any>(body: string): Promise<T>;
  evalFrame<T = any>(body: string): Promise<T>;
  click(x: number, y: number): Promise<void>;
  key(key: 'Escape'): Promise<void>;
  back(): Promise<void>;
  forward(): Promise<void>;
  shot(name: string): Promise<void>;
  closeSession(): Promise<void>;
  quit(): Promise<void>;
}
// The arrow off ('off', web/sim-hint.js: the measuring tools' switch) for the session.
const HIDE_HINTS = `try { sessionStorage.setItem('reactiive.demos.hint', '1'); sessionStorage.setItem('reactiive.demos.arrow', 'off'); } catch (e) {}`;

async function webkitDriver(): Promise<Driver> {
  const dir = opt('--pw') ?? process.env.PLAYWRIGHT_DIR;
  if (!dir) throw new Error('safari: --driver webkit needs --pw <dir> (or PLAYWRIGHT_DIR): a directory with playwright installed, outside this repo');
  const pw: any = await import(join(dir, 'node_modules/playwright/index.mjs'));
  const browser = await pw.webkit.launch();
  let ctx: any, page: any;
  const frame = () => page.frames().find((f: any) => f.url().includes('/demos/app/') && f.parentFrame());
  const fn = (body: string) => `(async () => { ${body} })()`;
  return {
    name: `Playwright WebKit ${browser.version()} (a proxy for Safari)`,
    async open(o = {}) {
      ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(HIDE_HINTS);
      if (o.noNavigationApi) await ctx.addInitScript(`try { Object.defineProperty(window, 'navigation', { value: undefined, configurable: true }); } catch (e) {}`);
      page = await ctx.newPage();
      page.on('pageerror', (e: any) => errors.add(String(e).slice(0, 160)));
    },
    goto: (path) => page.goto(origin + path, { waitUntil: 'load' }),
    eval: (body) => page.evaluate(fn(body)),
    evalFrame: async (body) => { const f = frame(); if (!f) throw new Error('no framed app'); return f.evaluate(fn(body)); },
    click: (x, y) => page.mouse.click(x, y, { delay: 50 }),
    key: (k) => page.keyboard.press(k),
    back: () => page.goBack({ waitUntil: 'commit' }).then(() => {}),
    forward: () => page.goForward({ waitUntil: 'commit' }).then(() => {}),
    shot: async (name) => { if (shots) await page.screenshot({ path: join(shots, `webkit-${name}.png`) }); },
    closeSession: () => ctx.close(),
    quit: () => browser.close(),
  };
}

async function safariDriver(): Promise<Driver> {
  const port = 4600 + Math.floor(Math.random() * 300);
  if (!Bun.which('safaridriver')) throw new Error('no safaridriver on this Mac (it ships with Safari, in /usr/bin)');
  const proc = Bun.spawn(['safaridriver', '-p', String(port)], { stdout: 'ignore', stderr: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  await until(async () => (await fetch(`${base}/status`)).ok, 5000);
  let sid = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}/session${sid ? '/' + sid : ''}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(90000) })
      .catch((e) => { throw new Error(`safaridriver ${method} ${path}: no answer (${e?.name ?? e})`); });
    const j: any = await r.json();
    if (j.value?.error) throw new Error(`safaridriver ${path}: ${j.value.error}: ${j.value.message}`);
    return j.value;
  };
  const exec = (body: string) => call('POST', '/execute/async', { script: `const done = arguments[arguments.length - 1]; (async () => { ${body} })().then(done, (e) => done({ __error: String(e) }));`, args: [] })
    .then((v: any) => { if (v && v.__error) throw new Error(v.__error); return v; });
  let version = '';
  const d: Driver = {
    name: 'Safari (safaridriver)',
    async open() {
      sid = '';
      const s = await call('POST', '', { capabilities: { alwaysMatch: { browserName: 'safari', timeouts: { script: 45000, pageLoad: 60000 } } } });
      sid = s.sessionId; version = s.capabilities?.browserVersion ?? '';
      d.name = `Safari ${version} (safaridriver)`;
      await call('POST', '/window/rect', { width: 1440, height: 900 + 90 }).catch(() => {});
      await call('POST', '/url', { url: `${origin}/` });
      await exec(HIDE_HINTS);
    },
    goto: (path) => call('POST', '/url', { url: origin + path }),
    eval: (body) => exec(body),
    async evalFrame(body) {
      const el = await call('POST', '/element', { using: 'css selector', value: 'iframe[data-motion~=live]' });
      await call('POST', '/frame', { id: el });
      try { return await exec(body); } finally { await call('POST', '/frame/parent', {}); }
    },
    click: (x, y) => call('POST', '/actions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', x: Math.round(x), y: Math.round(y), origin: 'viewport' }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] }),
    key: () => call('POST', '/actions', { actions: [{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' }] }] }),
    back: () => call('POST', '/back', {}),
    forward: () => call('POST', '/forward', {}),
    shot: async (name) => { if (shots) await Bun.write(join(shots, `safari-${name}.png`), Buffer.from(await call('GET', '/screenshot'), 'base64')); },
    closeSession: async () => { if (sid) await call('DELETE', '').catch(() => {}); sid = ''; },
    quit: async () => { await d.closeSession(); proc.kill(); },
  };
  return d;
}

const errors = new Set<string>();
const want = opt('--driver');
let drv: Driver;
if (want === 'webkit') { drv = await webkitDriver(); await drv.open(); }
else {
  let sd: Driver | undefined;
  try { sd = await safariDriver(); await sd.open(); drv = sd; }
  catch (e) {
    await sd?.quit().catch(() => {});
    if (want === 'safaridriver') throw e;
    console.log(`info safaridriver unavailable (${String(e).slice(0, 160)}): Safari > Settings > Advanced > "Show features for web developers", then Developer > "Allow remote automation". Falling back to Playwright WebKit.`);
    drv = await webkitDriver();
    await drv.open();
  }
}
console.log(`driver: ${drv.name}, origin ${origin}`);

// ---------------------------------------------------------------- helpers
const rectOf = (sel: string) => `const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`;
const frameBox = () => drv.eval<{ x: number; y: number } | null>(`const f = document.querySelector('iframe[data-motion~=live]'); if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.x, y: r.y };`);
const live = () => until(async () => !!(await frameBox()) && await drv.evalFrame<boolean>(`return document.querySelector('[data-testid="pager-track"]')?.style.willChange === 'transform'`), 30000);
const demoOpen = () => drv.evalFrame<boolean>(`return !!document.querySelector('[data-testid="close"]')`).catch(() => false);
async function clickInFrame(sel: string) {
  const f = await frameBox(), p = await drv.evalFrame<{ x: number; y: number } | null>(rectOf(sel));
  if (!f || !p) return false;
  await drv.click(f.x + p.x, f.y + p.y);
  return true;
}
async function clickPage(sel: string) { const p = await drv.eval<{ x: number; y: number } | null>(rectOf(sel)); if (!p) return false; await drv.click(p.x, p.y); return true; }
const path = () => drv.eval<string>(`return location.pathname`);

// One session at a time, and it always ends (no window is left on the owner's screen): a failure or a signal still
// deletes the session and stops safaridriver.
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { drv.quit().finally(() => process.exit(130)); });
try {
// ---------------------------------------------------------------- 0. what the engine has
info('API support', await drv.eval(`return {
  checkVisibility: 'checkVisibility' in Element.prototype, navigationApi: 'navigation' in window, requestIdleCallback: 'requestIdleCallback' in window,
  schedulerYield: !!(window.scheduler && scheduler.yield), virtualKeyboard: 'virtualKeyboard' in navigator, scrollend: 'onscrollend' in window,
  has: CSS.supports('selector(:has(a))'), linearEasing: CSS.supports('transition-timing-function', 'linear(0, 1)'),
  contentVisibility: CSS.supports('content-visibility', 'auto'), registerProperty: !!(window.CSS && CSS.registerProperty),
  cornerShape: CSS.supports('corner-shape', 'superellipse(1.6)'), dialogClosedBy: 'closedBy' in HTMLDialogElement.prototype,
  commandFor: 'commandForElement' in HTMLButtonElement.prototype, popover: 'showPopover' in HTMLElement.prototype,
  viewTransition: 'startViewTransition' in document, scrollTimeline: CSS.supports('animation-timeline', 'scroll()'),
  overlayTransition: CSS.supports('transition-property', 'overlay'), readingFlow: CSS.supports('reading-flow', 'source-order'),
  backdropFilter: CSS.supports('backdrop-filter', 'blur(4px)') || CSS.supports('-webkit-backdrop-filter', 'blur(4px)'), webgpu: 'gpu' in navigator,
}`));

// ---------------------------------------------------------------- 1. nested pages start their runtime
for (const route of ['/articles/animated-gradient', '/demos/composable-text']) {
  await drv.goto(route);
  const entry = await drv.eval<string>(`return document.querySelector('script[type="application/vnd.exact.checkpoint"]')?.dataset.entry ?? ''`);
  check(entry.startsWith('/'), `1 ${route}: the runtime entry is root-relative (${entry})`);
  // A press starts the runtime (pages activate on interaction, D16); once it runs, a header link is an in-app
  // navigation: the window (a mark set here) survives it. Without the runtime the press is a document load.
  await Bun.sleep(1000);
  await drv.click(60, 450);
  await Bun.sleep(6000);
  await drv.eval(`window.__safariProbe = 1`);
  await clickPage('header a[href="/articles"]');
  const kept = await until(async () => (await path()) === '/articles' && await drv.eval<boolean>(`return window.__safariProbe === 1 && document.title.startsWith('Articles')`), 8000);
  check(kept, `1 ${route}: its runtime started, so the header's Articles link is an in-app navigation`);
}

// ---------------------------------------------------------------- 2. the framed app opens and closes a demo
await drv.goto('/demos');
check(await live(), '2 /demos: the framed app is live');
info('frame WebGPU adapter', await drv.evalFrame(`if (!navigator.gpu) return 'no navigator.gpu'; const a = await navigator.gpu.requestAdapter(); return a ? 'adapter' : 'null (no GPU here)'`).catch((e) => String(e)));
await Bun.sleep(600);
const len0 = await drv.eval<number>(`return history.length`);
await clickInFrame('[data-testid="icon-composable-text"]');
check(await until(demoOpen, 6000), '2 a click on Composable Text opens it in the frame (its close button is drawn)');
check(await drv.eval<number>(`return history.length`) === len0 + 1, '2 the open adds one entry to the page\'s history');
await drv.shot('framed-demo-open');
await Bun.sleep(800);
await clickInFrame('[data-testid="close"]');
check(await until(async () => !(await demoOpen()), 6000), '2 its close button closes it (the launcher again)');

// ---------------------------------------------------------------- 3, 4. deep link, Back and Forward
await drv.goto('/articles');
await drv.goto('/demos/sphere-waves');
check(await live(), '3 /demos/sphere-waves: the framed app is live');
check(await until(demoOpen, 30000), '3 the deep link opens Sphere Waves in the frame');
await drv.shot('deep-link');
await clickPage('header a[href="/demos"]');
check(await until(async () => (await path()) === '/demos' && !(await demoOpen()), 8000), '3 the header\'s Demos link closes the demo the deep link opened');
await drv.back();
check(await until(async () => (await path()) === '/demos/sphere-waves' && await demoOpen(), 10000), '4 Back returns to the post with the demo open');
await drv.back();
check(await until(async () => (await path()) === '/articles', 8000), '4 Back again leaves for /articles');
await drv.forward();
check(await until(async () => (await path()) === '/demos/sphere-waves' && await demoOpen(), 15000), '4 Forward comes back to the post with the demo open');

// ---------------------------------------------------------------- 5. the framed keyboard
await drv.goto('/demos/cherry-blossom-qrcode');
if (await live() && await until(demoOpen, 30000)) {
  await Bun.sleep(1200);
  await clickInFrame('input');
  check(await until(() => drv.evalFrame<boolean>(`const r = document.querySelector('[data-site-keyboard]'); return !!r && getComputedStyle(r).visibility === 'visible' && document.activeElement?.tagName === 'INPUT'`), 4000), '5 a click in the field brings up the framed keyboard');
  await drv.shot('keyboard');
} else check(false, '5 cherry-blossom-qrcode did not open');

// ---------------------------------------------------------------- 6. no Navigation API
if (drv.name.startsWith('Playwright')) {
  await drv.closeSession();
  await drv.open({ noNavigationApi: true });
  await drv.goto('/demos/sphere-waves');
  check(!(await drv.eval<boolean>(`return !!window.navigation`)), '6 window.navigation hidden');
  check(await live() && await until(demoOpen, 30000), '6 the deep link opens the demo');
  await clickPage('header a[href="/demos"]');
  check(await until(async () => (await path()) === '/demos' && !(await demoOpen()), 8000), '6 the header\'s Demos link closes it without the Navigation API');
}

// ---------------------------------------------------------------- 7. account UI and storage
await drv.goto('/');
await Bun.sleep(800);
await clickPage('header [data-testid="sign-in"]');
check(await until(() => drv.eval<boolean>(`return !!document.querySelector('#signin-modal[open]')`), 4000), '7 Sign In opens its dialog');
await drv.key('Escape');
check(await until(() => drv.eval<boolean>(`return !document.querySelector('#signin-modal[open]')`), 4000), '7 Escape closes it');
check(await drv.eval<string>(`try { localStorage.setItem('__safari_probe', '1'); const v = localStorage.getItem('__safari_probe'); localStorage.removeItem('__safari_probe'); return v; } catch (e) { return String(e); }`) === '1', '7 localStorage writes and reads back');

} catch (e) {
  check(false, `the run stopped: ${String(e).slice(0, 200)}`);
} finally {
  if (errors.size) info('page errors', [...errors]);
  await drv.quit().catch(() => {});
}
console.log(fails.length ? `${fails.length} failed` : 'all passed');
process.exit(fails.length ? 1 : 0);
