#!/usr/bin/env bun
// Navigation correctness: every header link, from every page kind, at every moment of a page's life, lands on the page
// its URL names (the URL and the content agree), and Back / Forward do too. A stuck in-app navigation (the URL changed,
// the old page still drawn) is a failure.
//   bun tools/parity/nav-correct.ts <origin> [--rounds 20] [--widths 1440,390] [--quick]
// Per round, width, start page and header target: timings `cold` (press at once after DOMContentLoaded), `warm` (after
// the runtime had time to start, 2.5 s), `hovered` (pointer rests 800 ms on the link first: the speculation rules'
// prerender), `scrolled` (the page scrolled, the press mid-scroll), `key` (focus + Enter). After each press, within
// 4 s: location.pathname is the target and the page's own marker for that path is drawn. Then Back and Forward: the
// same check against the previous / next path. Exit 1 on any failure.
import { launch, newPage, type Page } from './cdp.ts';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const origin = args[0];
const rounds = Number(opt('--rounds') ?? 20);
const widths = (opt('--widths') ?? '1440,390').split(',').map(Number);
const quick = args.includes('--quick');

// What each page draws that no other does (its h1, or a known text); checked in the rendered body text.
const MARK: Record<string, string> = {
  '/': "Hey, I'm Enzo.",
  '/articles': 'Articles',
  '/demos': 'Demos',
  '/course': 'Reanimate.dev',
  '/articles/introducing-refined': 'Introducing Refined',
  '/docs/license': 'License',
  '/series/exploring-skia': 'Animated Loader with React Native',
  '/this-page-does-not-exist': '404',
};
const STARTS = quick ? ['/', '/articles', '/demos'] : ['/', '/articles', '/demos', '/course', '/articles/introducing-refined', '/docs/license', '/series/exploring-skia', '/this-page-does-not-exist'];
const TARGETS = ['/', '/articles', '/demos'];
const TIMINGS = quick ? ['cold', 'hovered'] : ['cold', 'warm', 'hovered', 'scrolled', 'key'];

// The page shows `path` when its h1 (or, for pages without one, the body) carries the path's marker and no other
// start page's h1 is drawn.
const shows = (path: string) => `(() => {
  const h1s = [...document.querySelectorAll('h1')].filter((h) => h.getClientRects().length && getComputedStyle(h).visibility !== 'hidden').map((h) => h.textContent.trim());
  const body = document.body.innerText;
  const want = ${JSON.stringify(MARK[path] ?? '')};
  const home = h1s.some((t) => t.startsWith("Hey, I'm Enzo"));
  if (${JSON.stringify(path)} !== '/' && home) return false;
  if (${JSON.stringify(path)} === '/') return home;
  if (${JSON.stringify(path)} === '/demos') return h1s.some((t) => t === 'Demos') && !home;
  if (${JSON.stringify(path)} === '/articles') return h1s.some((t) => t === 'Articles');
  return h1s.some((t) => t.includes(want)) || body.includes(want);
})()`;

async function until(page: Page, expr: string, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await page.eval<boolean>(expr)) return true; } catch {}
    await Bun.sleep(100);
  }
  return false;
}
// A link the reader can press: what is drawn at its centre is the link (or inside it), so a closed menu's or a hidden
// copy's links never count.
const HIT = `window.hit = (a) => { const r = a.getBoundingClientRect(); if (!r.width || !r.height) return false; const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && (e === a || a.contains(e)); }`;
const at = (path: string) => `location.pathname === ${JSON.stringify(path)} && ${shows(path)}`;

const { cdp, kill } = await launch({ port: Number(opt('--port') ?? 9348) });
let checks = 0, failures = 0;
const fails: string[] = [];
const fail = (s: string) => { failures++; fails.push(s); console.log('FAIL ' + s); };

for (let round = 0; round < rounds; round++) for (const w of widths) for (const start of STARTS) for (const to of TARGETS) for (const timing of TIMINGS) {
  if (to === start) continue;
  const mobile = w < 768;
  const page = await newPage(cdp, w);
  const name = `r${round} @${w} ${start} → ${to} (${timing})`;
  try {
    if (timing === 'cold') {
      // Press as soon as the document is parsed: navigate without waiting for load.
      await page.send('Page.navigate', { url: origin + start });
      await until(page, `document.readyState !== 'loading' && !!document.querySelector('header a')`, 15000);
    } else {
      await page.goto(origin + start);
      await Bun.sleep(timing === 'warm' ? 2500 : 600);
    }
    if (timing === 'scrolled') await page.eval(`window.scrollTo(0, 0); (function s(n){ window.scrollBy(0, 40); if (n) requestAnimationFrame(() => s(n - 1)); })(20)`);
    await page.eval(HIT);
    if (mobile) {
      const m = await page.eval<number[]>(`(() => { const r = document.querySelector('[aria-controls="mobile-menu"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: m[0], y: m[1] });
      for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: m[0], y: m[1], button: 'left', clickCount: 1 });
      // The menu opens once the press is handled (a page not yet awake starts its runtime at it): wait until its
      // links can be pressed.
      await until(page, `[...document.querySelectorAll('#mobile-menu a')].some((a) => hit(a))`, 6000);
      await Bun.sleep(350);
    }
    const sel = mobile ? '#mobile-menu a' : 'header a';
    const p = await page.eval<number[] | null>(`(() => { const a = [...document.querySelectorAll(${JSON.stringify(sel)})].find((a) => hit(a) && new URL(a.href).pathname === ${JSON.stringify(to)}); if (!a) return null; const r = a.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!p) { fail(`${name}: no link to ${to}`); await page.close(); continue; }
    if (timing === 'key') {
      await page.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].find((a) => hit(a) && new URL(a.href).pathname === ${JSON.stringify(to)}).focus()`);
      for (const type of ['rawKeyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'rawKeyDown' ? { text: '\r' } : {}) });
    } else {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] });
      if (timing === 'hovered') await Bun.sleep(800);
      for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: 1 });
    }
    checks++;
    if (!(await until(page, at(to)))) { fail(`${name}: at ${await page.eval('location.pathname').catch(() => '?')}, drawn ${await page.eval(`[...document.querySelectorAll('h1')].map(h=>h.textContent.trim().slice(0,20)).join('|')`).catch(() => '?')}`); await page.close(); continue; }
    if (timing === 'cold' || timing === 'hovered') {
      await page.eval('history.back()');
      checks++;
      if (!(await until(page, at(start)))) fail(`${name}: Back → ${await page.eval('location.pathname').catch(() => '?')}, drawn ${await page.eval(`[...document.querySelectorAll('h1')].map(h=>h.textContent.trim().slice(0,20)).join('|')`).catch(() => '?')}`);
      else {
        await page.eval('history.forward()');
        checks++;
        if (!(await until(page, at(to)))) fail(`${name}: Forward → ${await page.eval('location.pathname').catch(() => '?')}, drawn ${await page.eval(`[...document.querySelectorAll('h1')].map(h=>h.textContent.trim().slice(0,20)).join('|')`).catch(() => '?')}`);
      }
    }
  } catch (e) { fail(`${name}: ${String(e).slice(0, 200)}`); }
  await page.close().catch(() => {});
}
console.log(JSON.stringify({ origin, rounds, widths, checks, failures }));
if (fails.length) console.log(fails.slice(0, 50).join('\n'));
kill();
process.exit(failures ? 1 : 0);
