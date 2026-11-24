#!/usr/bin/env bun
// The framed app's history and the page's stay in step through the one-time touch demo (D19) and after it
// (modules/web/index.js: a parent's press replaces, a hidden or overtaken frame moves in place).
//   bun tools/parity/sim-history.ts <origin>      (exit 1 on any failure)
// 1. A site link clicked at several moments of the touch demo (opening, open, after the pill, closing): the page
//    goes to /articles; back on /demos the app is on its launcher; the page's history holds no entry of the app's.
// 2. Back while the touch demo has the demo open (arrived from /articles): the page returns to /articles; then
//    /demos again shows the launcher.
// 3. A full touch demo, then Back and Forward: Back leaves /demos, Forward returns to it with the launcher (no
//    forward entry reopens the demo).
// 4. After all of that, a reader's own open and close move the history: +1 entry with the demo, back to the
//    launcher and the same index after the close.
// 5. A reader opens a demo, follows a site link, comes Back (the demo still open), then closes it: the close goes back
//    one entry (the page told the app it is on /demos again), and the next Back reaches the page before: no dead entry.
// 6. On a tablet (820x1180) a reader opens a demo, scrolls the frame off screen, presses Back: the demo closes by
//    going back one entry (an off-screen frame draws nothing, yet the page is on /demos), and the next Back leaves.
import { launch, newPage, type Page } from './cdp.ts';

const origin = (process.argv[2] ?? 'http://127.0.0.1:4318').replace(/\/$/, '');
const { cdp, kill } = await launch({ port: 9592, headed: process.argv.includes('--headed') });
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

async function app(page: Page) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const t = targetInfos.filter((t: any) => t.type === 'iframe' && t.url.includes('/demos/app/')).pop();
  if (!t) return null;
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  return {
    eval: async <T = any>(e: string): Promise<T> => (await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId)).result.value,
  };
}
const appPath = async (page: Page) => (await (await app(page))?.eval<string>('location.pathname')) ?? '';
const until = async (f: () => Promise<boolean>, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f().catch(() => false)) return true; await Bun.sleep(40); } return false; };
const hist = async (page: Page) => { const h = await page.send('Page.getNavigationHistory'); return { index: h.currentIndex, paths: h.entries.map((e: any) => new URL(e.url).pathname) as string[], entries: h.entries }; };
const click = async (page: Page, x: number, y: number) => { for (const type of ['mousePressed', 'mouseReleased']) { await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); await Bun.sleep(60); } };
const link = (page: Page, href: string) => page.eval<{ x: number; y: number }>(`(() => { const a = [...document.querySelectorAll('a[href="${href}"]')].find((a) => a.checkVisibility()); const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const live = (page: Page) => until(() => page.eval(`!!document.querySelector('iframe[data-motion~=live]')?.checkVisibility()`));
const dot = (page: Page) => page.eval<boolean>(`[...document.body.children].some((e) => e.style && e.style.width === '44px' && e.style.borderRadius === '50%')`);
const hintOpened = (page: Page) => until(async () => (await appPath(page)).includes('/demo/'), 20000);
const back = async (page: Page) => { const h = await hist(page); await page.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.index - 1].id }); };
const forward = async (page: Page) => { const h = await hist(page); await page.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.index + 1].id }); };
const tapApp = async (page: Page, testId: string) => {
  const off = await page.eval<any>(`(() => { const f = [...document.querySelectorAll('iframe[data-motion~=live]')].find((f) => f.checkVisibility()); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
  const p = await (await app(page))!.eval<any>(`(() => { const e = document.querySelector('[data-testid=${testId}]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (p) await click(page, off.x + p.x, off.y + p.y);
};
const launcher = (page: Page) => until(async () => (await appPath(page)).replace(/\/$/, '') === '/demos/app', 8000);

// 1. A link at several moments of the touch demo.
for (const delay of [0, 400, 1200, 2200, 3200]) {
  const page = await newPage(cdp, 1440);
  await page.goto(`${origin}/demos`);
  await live(page);
  const opened = await hintOpened(page);
  await Bun.sleep(delay);
  const l = await link(page, '/articles');
  await click(page, l.x, l.y);
  await until(() => page.eval(`location.pathname === '/articles'`), 8000);
  await Bun.sleep(1200);
  const h = await hist(page);
  check(opened && (await page.eval('location.pathname')) === '/articles' && !(await dot(page)), `1 [+${delay} ms] a link during the touch demo reaches /articles, no disc`);
  check(h.paths.every((p) => !p.startsWith('/demos/app')) && h.paths.filter((p) => p === '/demos').length === 1, `1 [+${delay} ms] the page's history holds no app entry: ${h.paths.join(' ')}`);
  await back(page);
  await until(() => page.eval(`location.pathname === '/demos'`), 8000);
  check(await launcher(page), `1 [+${delay} ms] back on /demos the app is on its launcher (${await appPath(page)})`);
  await page.close();
}

// 2. Back while the touch demo has the demo open.
{
  const page = await newPage(cdp, 1440);
  await page.goto(`${origin}/articles`); await Bun.sleep(2000);
  const l = await link(page, '/demos'); await click(page, l.x, l.y);
  await live(page);
  const opened = await hintOpened(page);
  await Bun.sleep(500);
  await back(page);
  await until(() => page.eval(`location.pathname === '/articles'`), 8000);
  await Bun.sleep(800);
  check(opened && (await page.eval('location.pathname')) === '/articles' && !(await dot(page)), '2 Back mid-demo returns to /articles, no disc');
  const l2 = await link(page, '/demos'); await click(page, l2.x, l2.y);
  await until(() => page.eval(`location.pathname === '/demos'`), 8000);
  check(await launcher(page), `2 /demos again shows the launcher (${await appPath(page)})`);
  await page.close();
}

// 3 and 4. A full touch demo, Back and Forward; then the reader's own open and close.
{
  const page = await newPage(cdp, 1440);
  await page.goto(`${origin}/articles`); await Bun.sleep(2000);
  const l = await link(page, '/demos'); await click(page, l.x, l.y);
  await live(page);
  await hintOpened(page);
  await until(async () => !(await dot(page)) && (await appPath(page)).replace(/\/$/, '') === '/demos/app', 15000);
  await Bun.sleep(600);
  const h0 = await hist(page);
  check(h0.paths.filter((p) => p !== 'blank').join(' ') === '/articles /demos' && h0.index === h0.paths.length - 1, `3 after the full touch demo the history is /articles /demos at /demos: ${h0.paths.join(' ')} @${h0.index}`);
  await back(page);
  check(await until(() => page.eval(`location.pathname === '/articles'`), 8000), '3 Back leaves /demos for /articles');
  await forward(page);
  await until(() => page.eval(`location.pathname === '/demos'`), 8000);
  await Bun.sleep(800);
  check((await page.eval('location.pathname')) === '/demos' && await launcher(page), `3 Forward returns to /demos on the launcher (${await appPath(page)})`);
  // 4. The reader's own open and close (real input through the page).
  const off = await page.eval<any>(`(() => { const f = [...document.querySelectorAll('iframe[data-motion~=live]')].find((f) => f.checkVisibility()); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
  const a = (await app(page))!;
  const icon = await a.eval<any>(`(() => { const r = document.querySelector('[data-testid=icon-calendar-days]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const before = await hist(page);
  await click(page, off.x + icon.x, off.y + icon.y);
  const openOk = await until(async () => (await appPath(page)).includes('/demo/calendar-days'), 8000);
  await Bun.sleep(1200);
  const during = await hist(page);
  check(openOk && during.paths.length === before.paths.length + 1 && during.index === before.index + 1, `4 a reader's open adds one entry: ${before.paths.length}@${before.index} → ${during.paths.length}@${during.index}`);
  const close = await a.eval<any>(`(() => { const r = document.querySelector('[data-testid=close]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await click(page, off.x + close.x, off.y + close.y);
  const closed = await launcher(page);
  await Bun.sleep(600);
  const after = await hist(page);
  check(closed && after.index === before.index && (await page.eval('location.pathname')) === '/demos', `4 its close goes back to the launcher, same index: @${after.index}, page ${await page.eval('location.pathname')}`);
  await page.close();
}

// 5. The reader's open, a site link, Back, then the close button.
{
  const page = await newPage(cdp, 1440);
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('reactiive.demos.hint', '1') } catch {}` });
  await page.goto(`${origin}/articles`); await Bun.sleep(2000);
  let l = await link(page, '/demos'); await click(page, l.x, l.y);
  await live(page); await Bun.sleep(800);
  const h0 = await hist(page);
  await tapApp(page, 'icon-calendar-days');
  await until(async () => (await appPath(page)).includes('/demo/'), 8000); await Bun.sleep(1200);
  l = await link(page, '/articles'); await click(page, l.x, l.y);
  await until(() => page.eval(`location.pathname === '/articles'`), 8000); await Bun.sleep(1200);
  await back(page);
  await until(() => page.eval(`location.pathname === '/demos'`), 8000); await Bun.sleep(1200);
  const open = (await appPath(page)).includes('/demo/calendar-days');
  await tapApp(page, 'close');
  const closed = await launcher(page); await Bun.sleep(800);
  const h1 = await hist(page);
  check(open && closed && h1.index === h0.index && (await page.eval('location.pathname')) === '/demos', `5 link, Back, close: the close goes back one entry (@${h0.index} → @${h1.index}, ${h1.paths.join(' ')})`);
  await back(page);
  check(await until(() => page.eval(`location.pathname === '/articles'`), 8000), '5 the next Back reaches /articles (no dead entry)');
  await page.close();
}

// 6. Tablet: open, scroll the frame off screen, Back.
{
  const page = await newPage(cdp, 820, { height: 1180 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('reactiive.demos.hint', '1') } catch {}` });
  await page.goto(`${origin}/articles`); await Bun.sleep(2000);
  const l = await link(page, '/demos'); await click(page, l.x, l.y);
  await until(() => page.eval(`location.pathname === '/demos'`), 8000);
  await page.eval(`document.querySelector('iframe[title="Demos"]')?.scrollIntoView({ block: 'center' })`);
  await live(page); await Bun.sleep(1000);
  const h0 = await hist(page);
  await tapApp(page, 'icon-calendar-days');
  const opened = await until(async () => (await appPath(page)).includes('/demo/'), 8000); await Bun.sleep(1200);
  // The page is too short to scroll the whole frame away at tablet sizes: moved off screen by a transform instead (the
  // same for the browser: no intersection, no animation frames for the cross-origin frame).
  await page.eval(`(() => { const st = document.createElement('style'); st.id = 'offscreen'; st.textContent = 'iframe[title="Demos"]{transform:translateY(4000px)}'; document.head.appendChild(st); })()`);
  await Bun.sleep(800);
  const off = await page.eval<boolean>(`(() => { const r = document.querySelector('iframe[title="Demos"]').getBoundingClientRect(); return r.bottom <= 0 || r.top >= innerHeight; })()`);
  await back(page);
  const closed = await launcher(page); await Bun.sleep(800);
  await page.eval(`document.getElementById('offscreen')?.remove()`);
  const h1 = await hist(page);
  check(opened && closed && h1.index === h0.index && (await page.eval('location.pathname')) === '/demos', `6 off screen (${off ? 'off' : 'partly on'} screen), Back closes the demo one entry back (@${h0.index} → @${h1.index})`);
  await back(page);
  check(await until(() => page.eval(`location.pathname === '/articles'`), 8000), '6 the next Back reaches /articles (no dead entry)');
  await page.close();
}

kill();
if (fails.length) { console.error(`sim-history: ${fails.length} failure(s)`); process.exit(1); }
console.log('sim-history: the app and the page keep one history');
process.exit(0);
