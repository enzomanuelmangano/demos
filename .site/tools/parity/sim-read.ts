#!/usr/bin/env bun
// "Read article" in the framed app (docs/decisions.md D25): the app's menus offer it (tools/demos-web/patches.ts for
// the icons', tools/demos-web/bridge.js for a search result's and an open demo's) and the page goes to the post
// (web/sim-goto.js). Real input (CDP mouse and touch) into the sandboxed frame.
//   bun tools/parity/sim-read.ts <origin> [--out .out/parity/sim-read]      (exit 1 on any failure)
// 1. /demos, 1440: a right click on an icon: the menu holds "Read article"; picking it goes to /demos/<post> (the same
//    tab, one entry, the article at its top, the page and frame not reloaded) with the demo open in the phone; Back
//    returns to /demos.
// 2. On that post, scrolled down: a right click in the open demo, "Read article": the article's top, no new entry.
// 3. A demo the reader opened on /demos: a right click in it goes to its post; Back returns to /demos.
// 4. Search results: a right click on one offers it; picking it goes to the post, the demo open.
// 5. No article, no item: a demo the app has without a post (its icon's menu), and the app unframed (/demos/app/).
// 6. Touch (a 820 px tablet): a long press on an icon, and on a search result, offers it; a tap goes to the post.
// 7. Only the framed app is heard: the page's own message goes nowhere.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, newPage, type Page } from './cdp.ts';
import { DEMO_POSTS } from '../demos-web/legacy-posts.ts';

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const origin = (args[0] ?? 'http://127.0.0.1:4318').replace(/\/$/, '');
const out = opt('--out', '.out/parity/sim-read');
mkdirSync(out, { recursive: true });
const { cdp, kill } = await launch({ port: 9624, headed: args.includes('--headed') });
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const until = async (f: () => Promise<boolean>, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f().catch(() => false)) return true; await Bun.sleep(60); } return false; };
type App = { eval: <T = any>(e: string) => Promise<T> };
let cur: Page;
async function app(): Promise<App> {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const t = targetInfos.filter((t: any) => t.type === 'iframe' && t.url.includes('/demos/app/') && t.browserContextId === cur.contextId).pop();
  if (!t) throw new Error('no app frame');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  return { eval: async (e) => (await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId)).result.value };
}
const open = async (width: number, path: string, height = 900) => {
  cur = await newPage(cdp, width, { height });
  await cur.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('reactiive.demos.hint', '1'); sessionStorage.setItem('reactiive.demos.arrow', 'off') } catch {}` });
  await cur.goto(origin + path);
  return cur;
};
const live = (page: Page) => until(() => page.eval(`!!document.querySelector('iframe[data-motion~=live]')?.checkVisibility()`), 60000);
const ready = async () => until(async () => (await (await app()).eval<string>(`document.querySelector('[data-testid=pager-track]')?.style.willChange ?? ''`)) === 'transform', 30000);
const appPath = async () => (await (await app()).eval<string>('location.pathname')).replace(/\/$/, '');
const path = (page: Page) => page.eval<string>('location.pathname');
const entries = async (page: Page) => { const h = await page.send('Page.getNavigationHistory'); return h.entries.slice(0, h.currentIndex + 1).map((e: any) => new URL(e.url).pathname).filter((p: string) => p !== 'blank') as string[]; };
const shot = async (page: Page, name: string) => { const s = await page.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${name}.png`), Buffer.from(s.data, 'base64')); };
// An element of the app (an expression there) as a point of the page.
const point = async (page: Page, expr: string) => {
  const r = await (await app()).eval<any>(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
  if (!r) return null;
  const f = await page.eval<{ x: number; y: number }>(`(() => { const r = [...document.querySelectorAll('iframe[title="Demos"]')].find((f) => f.checkVisibility()).getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
  return { x: f.x + r.x, y: f.y + r.y };
};
const mouse = async (page: Page, p: { x: number; y: number }, button: 'left' | 'right' = 'left') => {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button, buttons: button === 'left' ? 1 : 2, clickCount: 1 }); await Bun.sleep(70);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button, clickCount: 1 });
};
const touch = async (page: Page, p: { x: number; y: number }, ms = 60) => {
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }); await Bun.sleep(ms);
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const icon = (slug: string) => `[...document.querySelectorAll('[data-testid="icon-${slug}"]')].find((e) => e.closest('[data-testid=pager-track]') && e.getBoundingClientRect().right <= innerWidth && e.getBoundingClientRect().left >= 0)`;
// The open menu's items, whichever drew it (both live in a shadow root on the app's body).
const MENU = `[...document.body.children].flatMap((e) => (e.shadowRoot ? [...e.shadowRoot.querySelectorAll('[role=menuitem]')] : []))`;
const items = async () => (await (await app()).eval<string[]>(`${MENU}.map((b) => b.textContent.trim())`)) ?? [];
const hasMenu = () => until(async () => (await items()).length > 0, 4000);
const READ = `${MENU}.find((b) => b.textContent.trim() === 'Read article')`;
const row = (slug: string) => `document.querySelector('[data-testid=search]')?.shadowRoot?.querySelector('.row[data-slug="${slug}"]')`;
// The pull-to-search, by the trackpad's own path into the pager.
const search = async () => {
  await (await app()).eval(`(async () => { const p = document.querySelector('[data-testid=pager]'); for (let i = 0; i < 12; i++) { p.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, bubbles: true })); await new Promise((r) => setTimeout(r, 16)); } })()`);
  await Bun.sleep(900);
};
const mark = async (page: Page) => { await page.eval('window.__kept = 1'); await (await app()).eval('window.__kept = 1'); };
const kept = async (page: Page) => (await page.eval<number>('window.__kept')) === 1 && (await (await app()).eval<number>('window.__kept')) === 1;

// The posts whose icons are on the launcher's first page.
let first: { slug: string; app: string }[] = [];
let bare = '';
{
  const page = await open(1440, '/demos');
  await live(page); await ready();
  const on = await (await app()).eval<string[]>(`[...document.querySelectorAll('[data-testid=pager-track] [data-testid^=icon-]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.left >= 0 && r.right <= innerWidth; }).map((e) => e.dataset.testid.slice(5))`);
  first = on.flatMap((a) => DEMO_POSTS.filter((d) => d.app === a));
  const every = await (await app()).eval<string[]>(`[...document.querySelectorAll('[data-testid=pager-track] [data-testid^=icon-]')].map((e) => e.dataset.testid.slice(5))`);
  bare = every.find((a) => !DEMO_POSTS.some((d) => d.app === a)) ?? '';
  await page.close();
}
const [A, B, C] = [first[3] ?? first[0], first[1], first[2]];

// ---- 1, 2
{
  const page = await open(1440, '/demos');
  await live(page); await ready(); await Bun.sleep(600); await mark(page);
  await mouse(page, (await point(page, icon(A.app)))!, 'right');
  check(await hasMenu() && (await items())[0] === 'Read article', `1 right click on ${A.app}'s icon: ${(await items()).join(' | ')}`);
  await Bun.sleep(500); await shot(page, 'menu-icon');
  await mouse(page, (await point(page, READ))!);
  check(await until(async () => (await path(page)) === `/demos/${A.slug}`, 8000), `1 "Read article": the page is /demos/${A.slug} (${await path(page)})`);
  check(await until(async () => (await appPath()) === `/demos/app/demo/${A.app}`, 20000), `1 the demo is open in the phone (${await appPath()})`);
  await Bun.sleep(900); await shot(page, 'read-post');
  check((await page.eval<number>('scrollY')) === 0 && (await page.eval<string>(`document.querySelector('main h1')?.textContent ?? ''`)).length > 0, '1 the article at its top');
  check((await entries(page)).join(' ') === `/demos /demos/${A.slug}` && await kept(page), `1 one entry added, nothing reloaded (${(await entries(page)).join(' ')})`);
  // 2: from inside the demo, scrolled down the article.
  await page.eval('scrollTo(0, 700)'); await Bun.sleep(500);
  const inside = (await point(page, `document.querySelector('[data-testid=web-screen]')`))!;
  await mouse(page, inside, 'right');
  check(await hasMenu() && (await items()).join() === 'Read article', `2 right click in the open demo: ${(await items()).join(' | ')}`);
  await Bun.sleep(500); await shot(page, 'menu-demo');
  await mouse(page, (await point(page, READ))!);
  check(await until(async () => (await page.eval<number>('scrollY')) === 0, 6000) && (await entries(page)).length === 2 && (await appPath()) === `/demos/app/demo/${A.app}`, `2 on its post already: back to the top, no new entry, the demo as it was`);
  await page.send('Runtime.evaluate', { expression: 'history.back()' });
  check(await until(async () => (await path(page)) === '/demos' && (await appPath()) === '/demos/app', 10000) && await kept(page), `1 Back: /demos, the launcher, the same page and frame (${await path(page)}, ${await appPath()})`);
  await page.close();
}
// ---- 3
{
  const page = await open(1440, '/demos');
  await live(page); await ready(); await Bun.sleep(600); await mark(page);
  await mouse(page, (await point(page, icon(B.app)))!);
  await until(async () => (await appPath()) === `/demos/app/demo/${B.app}`, 10000); await Bun.sleep(1500);
  await mouse(page, (await point(page, `document.querySelector('[data-testid=web-screen]')`))!, 'right');
  const said = await hasMenu();
  await Bun.sleep(400);
  if (said) await mouse(page, (await point(page, READ))!);
  check(said && await until(async () => (await path(page)) === `/demos/${B.slug}`, 8000) && (await appPath()) === `/demos/app/demo/${B.app}`, `3 a demo opened by hand: "Read article" goes to /demos/${B.slug}, the demo still open`);
  await Bun.sleep(1200);
  await page.send('Runtime.evaluate', { expression: 'history.back()' });
  check(await until(async () => (await path(page)) === '/demos', 8000) && await kept(page), `3 Back returns to /demos, nothing reloaded (phone at ${await appPath()})`);
  await page.close();
}
// ---- 4
{
  const page = await open(1440, '/demos');
  await live(page); await ready(); await Bun.sleep(600); await mark(page);
  await search();
  const at = await point(page, row(C.app)) ?? await point(page, `document.querySelector('[data-testid=search]').shadowRoot.querySelector('.row')`);
  const slug = await (await app()).eval<string>(`(() => { const l = document.querySelector('[data-testid=search]').shadowRoot; return (l.querySelector('.row[data-slug="${C.app}"]') ?? l.querySelector('.row')).dataset.slug; })()`);
  const want = DEMO_POSTS.find((d) => d.app === slug);
  await mouse(page, at!, 'right');
  check(!!want && await hasMenu() && (await items()).join() === 'Read article', `4 right click on the search result ${slug}: ${(await items()).join(' | ')}`);
  await Bun.sleep(500); await shot(page, 'menu-search');
  await mouse(page, (await point(page, READ))!);
  check(await until(async () => (await path(page)) === `/demos/${want?.slug}`, 8000) && await until(async () => (await appPath()) === `/demos/app/demo/${slug}`, 20000) && await kept(page), `4 it goes to /demos/${want?.slug}, the demo open (${await appPath()})`);
  await page.close();
}
// ---- 5
{
  const page = await open(1440, '/demos');
  await live(page); await ready(); await Bun.sleep(600);
  if (bare) {
    await search();
    const at = await point(page, row(bare));
    if (at) { await mouse(page, at, 'right'); await Bun.sleep(600); check((await items()).length === 0, `5 ${bare} (no article): its search result offers no menu`); }
    await (await app()).eval(`document.querySelector('[data-testid=search]').shadowRoot.querySelector('.cancel').click()`); await Bun.sleep(800);
    await (await app()).eval(`document.querySelector('[data-testid="icon-${bare}"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
    check(await hasMenu() && !(await items()).includes('Read article'), `5 ${bare} (no article): its icon's menu is ${(await items()).join(' | ')}`);
  } else console.log('     5: every demo on the launcher has an article');
  const has = await (await app()).eval<boolean[]>(`[__siteArticle.has('${A.app}'), __siteArticle.has('no-such-demo')]`);
  check(has[0] === true && has[1] === false, `5 the item is offered by the list of articles alone (${A.app} ${has[0]}, a demo not in it ${has[1]})`);
  await page.close();
  const top = await open(1440, '/demos/app/');
  await until(() => top.eval(`!!document.querySelector('[data-testid="icon-${A.app}"]') && document.querySelector('[data-testid=pager-track]')?.style.willChange === 'transform'`), 40000);
  await Bun.sleep(800);
  const p = await top.eval<any>(`(() => { const r = ${icon(A.app)}.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await mouse(top, p, 'right'); await Bun.sleep(700);
  const own = await top.eval<string[]>(`${MENU}.map((b) => b.textContent.trim())`);
  check(own.length > 0 && !own.includes('Read article'), `5 /demos/app/ unframed: the app's own menu (${own.join(' | ')})`);
  await top.close();
}
// ---- 6
for (const how of ['icon', 'search'] as const) {
  cur = await newPage(cdp, 820, { height: 1100 });
  const page = cur;
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('reactiive.demos.hint', '1'); sessionStorage.setItem('reactiive.demos.arrow', 'off') } catch {}` });
  await page.goto(`${origin}/demos`);
  await page.eval(`(async () => { for (let i = 0; i < 40 && !document.querySelector('iframe[title="Demos"]'); i++) await new Promise((r) => setTimeout(r, 100)); document.querySelector('[data-motion~=sim-route] iframe')?.scrollIntoView({ block: 'end' }); })()`);
  await live(page); await ready(); await Bun.sleep(800);
  if (how === 'search') await search();
  const slug = how === 'icon' ? A.app : await (await app()).eval<string>(`document.querySelector('[data-testid=search]').shadowRoot.querySelector('.row').dataset.slug`);
  const want = DEMO_POSTS.find((d) => d.app === slug)!;
  await touch(page, (await point(page, how === 'icon' ? icon(slug) : row(slug)))!, 900);
  await Bun.sleep(600);
  const said = (await items()).includes('Read article');
  check(said && (await appPath()) === '/demos/app', `6 touch, a long press on ${how === 'icon' ? `${slug}'s icon` : `the search result ${slug}`}: ${(await items()).join(' | ') || 'no menu'} (nothing opened)`);
  await shot(page, `touch-${how}`);
  if (said) await touch(page, (await point(page, READ))!);
  check(said && await until(async () => (await path(page)) === `/demos/${want.slug}`, 8000) && await until(() => page.eval<boolean>(`scrollY === 0 && !!document.querySelector('[data-testid=open-demo]')?.checkVisibility()`), 6000), `6 a tap goes to /demos/${want.slug}, at its top (the try button: no phone under 1024 px)`);
  await page.close();
}
// ---- 7
{
  const page = await open(1440, '/demos');
  await live(page); await Bun.sleep(600);
  await page.eval(`postMessage({ demos: 'read', slug: '${A.app}' }, '*')`); await Bun.sleep(1200);
  check((await path(page)) === '/demos', `7 a message that is not the framed app's goes nowhere (${await path(page)})`);
  await page.close();
}
kill();
if (fails.length) { console.error(`sim-read: ${fails.length} failure(s)`); process.exit(1); }
console.log(`sim-read: "Read article" goes from the framed app to the post (screens in ${out})`);
process.exit(0);
