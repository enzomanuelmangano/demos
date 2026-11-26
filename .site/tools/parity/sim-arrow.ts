#!/usr/bin/env bun
// /demos's arrow (decisions.md D22) with the arrow ON (the other tools turn it off), on every kind of arrival.
//   bun tools/parity/sim-arrow.ts <origin>      (exit 1 on any failure)
// 1. A load, then a reload: the arrow each time.
// 2. /demos → Articles → the header's Demos link (the router may make it a traverse): the arrow on the return.
// 3. Back and Forward: /demos → Articles, Back to /demos: the arrow; Forward, Back again: the arrow again.
// 4. Leaving mid-arrow: the arrow is gone within 350 ms.
// 5. Rapid back-and-forth: never more than one arrow at once, and one plays once the reader stays.
// 6. Twenty round trips add no listeners.
// 7. A demo post (/demos/<slug>) and a phone (390 px): no arrow.
import { launch, newPage, type Page } from './cdp.ts';

const origin = (process.argv[2] ?? 'http://127.0.0.1:4318').replace(/\/$/, '');
const { cdp, kill } = await launch({ port: 9596 });
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

// Every arrow added or removed, by path, and the most arrows ever in the document at once.
const LOG = `(() => { window.__arr = { log: [], max: 0 }; const is = (n) => n.localName === 'svg' && n.querySelector && n.querySelector('[id^=demos-arrow]');
  new MutationObserver((ms) => { for (const m of ms) { for (const n of m.addedNodes) if (is(n)) window.__arr.log.push(['add', location.pathname]); for (const n of m.removedNodes) if (is(n)) window.__arr.log.push(['rm', location.pathname]); }
    window.__arr.max = Math.max(window.__arr.max, [...document.body.children].filter(is).length); }).observe(document.documentElement, { childList: true, subtree: true }); })();`;
async function open(width = 1440) {
  const page = await newPage(cdp, width);
  // The session marked seen (the key the measuring tools share).
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('reactiive.demos.hint', '1') } catch {}; document.addEventListener('DOMContentLoaded', () => { ${LOG} });` });
  return page;
}
type St = { log: [string, string][]; max: number; inDom: number; path: string };
const st = async (p: Page): Promise<St> => JSON.parse(await p.eval(`JSON.stringify({ log: window.__arr.log, max: window.__arr.max, path: location.pathname, inDom: [...document.body.children].filter((e) => e.localName === 'svg' && e.querySelector('[id^=demos-arrow]')).length })`));
const until = async (f: () => Promise<boolean>, ms: number) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f().catch(() => false)) return true; await Bun.sleep(80); } return false; };
// An arrow added on /demos since `from` log entries (the log survives the arrow, so a slow load cannot miss it).
const arrowIn = (p: Page, ms = 8000, from = -1) => until(async () => { const s = await st(p); return from < 0 ? s.inDom > 0 || s.log.some(([k, q]) => k === 'add' && q === '/demos') : s.log.slice(from).some(([k, q]) => k === 'add' && q === '/demos'); }, ms);
const link = (p: Page, href: string) => p.eval(`(() => { const a = [...document.querySelectorAll('a[href="${href}"]')].find((a) => a.getClientRects().length); if (!a) return false; a.click(); return true; })()`);
const hist = async (p: Page) => { const h = await p.send('Page.getNavigationHistory'); return { index: h.currentIndex as number, entries: h.entries as any[] }; };
const step = async (p: Page, d: number) => { const h = await hist(p); await p.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.index + d].id }); };
const at = (p: Page, path: string) => until(async () => (await p.eval('location.pathname')) === path, 8000);
async function listeners(p: Page) {
  let n = 0;
  for (const e of ['window', 'document', 'window.navigation']) {
    const { result } = await p.send('Runtime.evaluate', { expression: e });
    if (result.objectId) n += (await p.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.length;
  }
  return n;
}

{
  const p = await open();
  await p.send('DOMDebugger.enable').catch(() => {});
  // 1.
  await p.goto(`${origin}/demos`);
  check(await arrowIn(p, 20000), '1 a load shows the arrow');
  await p.send('Page.reload');
  await Bun.sleep(500);
  check(await arrowIn(p, 20000), '1 a reload shows it again');
  await until(async () => (await st(p)).inDom === 0, 8000);
  // 2.
  check(await link(p, '/articles') && await at(p, '/articles'), '2 Articles');
  await Bun.sleep(1200);
  let n = (await st(p)).log.length;
  check(await link(p, '/demos') && await at(p, '/demos'), '2 the Demos link');
  check(await arrowIn(p, 8000, n), '2 /demos → Articles → Demos link: the arrow');
  await until(async () => (await st(p)).inDom === 0, 8000);
  // 3.
  await link(p, '/articles'); await at(p, '/articles'); await Bun.sleep(1000);
  n = (await st(p)).log.length;
  await step(p, -1); await at(p, '/demos');
  check(await arrowIn(p, 8000, n), '3 Back to /demos: the arrow');
  await until(async () => (await st(p)).inDom === 0, 8000);
  await step(p, 1); await at(p, '/articles'); await Bun.sleep(1000);
  n = (await st(p)).log.length;
  await step(p, -1); await at(p, '/demos');
  check(await arrowIn(p, 8000, n), '3 Forward, then Back to /demos: the arrow again');
  // 4.
  await Bun.sleep(400);
  await link(p, '/articles'); await Bun.sleep(350);
  check((await st(p)).inDom === 0, '4 leaving mid-arrow removes it within 350 ms');
  // 5.
  await Bun.sleep(800);
  for (let i = 0; i < 6; i++) { await link(p, i % 2 ? '/articles' : '/demos'); await Bun.sleep(250); }
  n = (await st(p)).log.length;
  await link(p, '/demos'); await at(p, '/demos');
  check(await arrowIn(p, 8000, n), '5 after a rapid back-and-forth, staying shows the arrow');
  const s5 = await st(p);
  check(s5.max <= 1, `5 never more than one arrow at once (max ${s5.max})`);
  await until(async () => (await st(p)).inDom === 0, 8000);
  // 6.
  await link(p, '/articles'); await Bun.sleep(600); await link(p, '/demos'); await Bun.sleep(5500);
  const l0 = await listeners(p);
  for (let i = 0; i < 20; i++) { await link(p, '/articles'); await Bun.sleep(350); await link(p, '/demos'); await Bun.sleep(i % 5 === 4 ? 5500 : 700); }
  await link(p, '/articles'); await Bun.sleep(600); await link(p, '/demos'); await Bun.sleep(5500);
  const l20 = await listeners(p);
  check(l20 <= l0, `6 twenty round trips add no listeners (${l0} → ${l20})`);
  check((await st(p)).max <= 1, '6 and never two arrows');
  await p.close();
}
// 7.
{
  const p = await open();
  await p.goto(`${origin}/demos/add-to-cart`); await Bun.sleep(7000);
  check((await st(p)).log.length === 0, '7 a demo post shows no arrow');
  await p.close();
}
{
  const p = await open(390);
  await p.goto(`${origin}/demos`); await Bun.sleep(7000);
  check((await st(p)).log.length === 0, '7 a phone shows no arrow');
  await p.close();
}
console.log(fails.length ? `sim-arrow: ${fails.length} failure(s)` : 'sim-arrow: all ok');
kill();
process.exit(fails.length ? 1 : 0);
