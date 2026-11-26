#!/usr/bin/env bun
// The framed app's history and the page's stay in step (modules/web/index.js: a parent's press replaces, a hidden or
// overtaken frame moves in place).
//   bun tools/parity/sim-history.ts <origin>      (exit 1 on any failure)
// 3. Arriving at /demos, nothing ever opens a demo by itself (the one-time touch demo, D19, is gone): 8 s later the app
//    is on its launcher, the history is /articles /demos; Back and Forward keep the launcher.
// 4. Then a reader's own open and close move the history: +1 entry with the demo, back to the
//    launcher and the same index after the close.
// 5. A reader opens a demo, follows a site link, comes Back (the demo still open), then closes it: the close goes back
//    one entry (the page told the app it is on /demos again), and the next Back reaches the page before: no dead entry.
// 6. On a tablet (820x1180) a reader opens a demo, scrolls the frame off screen, presses Back: the demo closes by
//    going back one entry (an off-screen frame draws nothing, yet the page is on /demos), and the next Back leaves.
// 7. A demo the reader opened on /demos, then the header's Home and Articles: each lands on its page, the address and the
//    page together (the router goes to a route in its stack by go(-n); the frame's entry must not shift it).
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
const live = (page: Page) => until(() => page.eval(`!!document.querySelector('iframe[data-motion~=live], iframe[data-ready]')?.checkVisibility()`));
const back = async (page: Page) => { const h = await hist(page); await page.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.index - 1].id }); };
const forward = async (page: Page) => { const h = await hist(page); await page.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.index + 1].id }); };
const tapApp = async (page: Page, testId: string) => {
  const off = await page.eval<any>(`(() => { const f = [...document.querySelectorAll('iframe[data-motion~=live], iframe[data-ready]')].find((f) => f.checkVisibility()); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
  const p = await (await app(page))!.eval<any>(`(() => { const e = document.querySelector('[data-testid=${testId}]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (p) await click(page, off.x + p.x, off.y + p.y);
};
const launcher = (page: Page) => until(async () => (await appPath(page)).replace(/\/$/, '') === '/demos/app', 8000);

// 3 and 4. Nothing opens by itself; Back and Forward; then the reader's own open and close.
{
  const page = await newPage(cdp, 1440);
  await page.goto(`${origin}/articles`); await Bun.sleep(2000);
  const l = await link(page, '/demos'); await click(page, l.x, l.y);
  await live(page);
  let opened = false;
  for (const t = Date.now(); Date.now() - t < 8000; await Bun.sleep(100)) if ((await appPath(page)).includes('/demo/')) opened = true;
  check(!opened && (await appPath(page)).replace(/\/$/, '') === '/demos/app', `3 8 s on /demos and no demo opened by itself (${await appPath(page)})`);
  const h0 = await hist(page);
  check(h0.paths.filter((p) => p !== 'blank').join(' ') === '/articles /demos' && h0.index === h0.paths.length - 1, `3 the history is /articles /demos at /demos: ${h0.paths.join(' ')} @${h0.index}`);
  await back(page);
  check(await until(() => page.eval(`location.pathname === '/articles'`), 8000), '3 Back leaves /demos for /articles');
  await forward(page);
  await until(() => page.eval(`location.pathname === '/demos'`), 8000);
  await Bun.sleep(800);
  check((await page.eval('location.pathname')) === '/demos' && await launcher(page), `3 Forward returns to /demos on the launcher (${await appPath(page)})`);
  // 4. The reader's own open and close (real input through the page).
  const off = await page.eval<any>(`(() => { const f = [...document.querySelectorAll('iframe[data-motion~=live], iframe[data-ready]')].find((f) => f.checkVisibility()); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
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

// 7. A demo open, then the header's links (the router's go(-n) over the frame's entry).
{
  const page = await newPage(cdp, 1440);
  await page.goto(`${origin}/`); await Bun.sleep(1500);
  const go = async (href: string, text: string) => {
    const l = await link(page, href); await click(page, l.x, l.y);
    const ok = await until(() => page.eval(`location.pathname === '${href}' && (document.querySelector('main')?.innerText ?? '').includes(${JSON.stringify(text)})`), 8000);
    await Bun.sleep(400);
    return ok && (await page.eval(`location.pathname`)) === href;
  };
  check(await go('/articles', 'Introducing Refined'), '7 / → /articles');
  check(await go('/demos', '100+ animations'), '7 → /demos');
  await live(page); await Bun.sleep(1500);
  const h1 = await hist(page);
  await tapApp(page, 'icon-calendar-days');
  check(await until(async () => (await appPath(page)).includes('/demo/calendar-days'), 8000), '7 a demo opened by hand');
  await Bun.sleep(400);
  const h2 = await hist(page);
  check(h2.index === h1.index + 1, `7 its entry is in the joint history (@${h1.index} → @${h2.index})`);
  await Bun.sleep(800);
  check(await go('/', "Hey, I'm Enzo"), `7 the header's Home lands on / with its page (${await page.eval('location.pathname')})`);
  check(await go('/articles', 'Introducing Refined'), `7 then Articles lands on /articles with its page (${await page.eval('location.pathname')})`);
  check(await go('/demos', '100+ animations'), `7 then Demos lands on /demos (${await page.eval('location.pathname')})`);
  // The browser's Back and Forward still move one page at a time, the page and the address together.
  const was = await page.eval<string>('location.pathname');
  await back(page);
  const b = await until(() => page.eval(`location.pathname !== '${was}'`), 6000);
  await Bun.sleep(600);
  const atBack = await page.eval<string>('location.pathname');
  await forward(page);
  const f = await until(() => page.eval(`location.pathname === '${was}' && (document.querySelector('main')?.innerText ?? '').includes('100+ animations')`), 6000);
  check(b && f, `7 Back (${atBack}) and Forward (${await page.eval('location.pathname')}) move one page, address and page together`);
  await page.close();
}
kill();
if (fails.length) { console.error(`sim-history: ${fails.length} failure(s)`); process.exit(1); }
console.log('sim-history: the app and the page keep one history');
process.exit(0);
