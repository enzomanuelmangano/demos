#!/usr/bin/env bun
// Sign In opens the sign-in dialog at once on every page kind, cold (pressed as soon as the page is parsed, before its
// runtime starts: D16's activation on intent replays the press), warm, and after an in-app navigation; at 1440 with the
// header's button and at 390 through the mobile menu. Then a provider button is pressed: with no API behind /api/* it
// must answer with the error toast (never a dead click); with one, the button is a link to the provider.
//   bun tools/parity/sign-in.ts <origin> [--routes /,/articles,...] [--widths 1440,390] [--rounds 1]
import { launch, newPage, type Page } from './cdp.ts';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const origin = args[0];
const routes = (opt('--routes') ?? '/,/articles,/articles/introducing-refined,/demos,/course').split(',');
const widths = (opt('--widths') ?? '1440,390').split(',').map(Number);
const rounds = Number(opt('--rounds') ?? 1);

async function until(page: Page, expr: string, ms: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await page.eval<boolean>(expr)) return Date.now() - t0; } catch {} await Bun.sleep(50); }
  return -1;
}
async function press(page: Page, selector: string) {
  const p = await page.eval<number[] | null>(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => { const r = e.getBoundingClientRect(); if (!r.width) return false; const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return h && (h === e || e.contains(h)); }); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  if (!p) return false;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] });
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: 1 });
  return true;
}
const OPEN = `!!document.querySelector('#signin-modal[open]')`;

const { cdp, kill } = await launch({ port: 9351 });
let failures = 0, checks = 0;
const fail = (s: string) => { failures++; console.log('FAIL ' + s); };
for (let round = 0; round < rounds; round++) for (const w of widths) for (const route of routes) for (const when of ['cold', 'warm', 'in-app']) {
  const page = await newPage(cdp, w);
  const name = `@${w} ${route} (${when})`;
  try {
    if (when === 'in-app') {
      // Arrive by the header's link from another page, after that page's runtime has started.
      const from = route === '/articles' ? '/' : '/articles';
      await page.goto(origin + from); await Bun.sleep(2500);
      if (w < 768) { await press(page, '[aria-controls="mobile-menu"]'); await Bun.sleep(400); }
      const ok = await press(page, w < 768 ? `#mobile-menu a[href="${route}"]` : `header a[href="${route}"]`);
      if (!ok) { await page.goto(origin + route); }
      if ((await until(page, `location.pathname === ${JSON.stringify(route)}`, 5000)) < 0) { fail(`${name}: did not reach ${route}`); continue; }
      await Bun.sleep(800);
    } else if (when === 'cold') {
      await page.send('Page.navigate', { url: origin + route });
      await until(page, `document.readyState !== 'loading' && !!document.querySelector('header')`, 15000);
    } else { await page.goto(origin + route); await Bun.sleep(2500); }
    if (w < 768) {
      if (!(await press(page, '[aria-controls="mobile-menu"]'))) { fail(`${name}: no menu button`); continue; }
      if ((await until(page, `!!document.querySelector('#mobile-menu [data-testid="menu-sign-in"], #mobile-menu button')`, 3000)) < 0) { fail(`${name}: menu`); continue; }
      await Bun.sleep(350);
      if (!(await press(page, '#mobile-menu button'))) { fail(`${name}: no menu Sign In`); continue; }
    } else if (!(await press(page, 'header button'))) { fail(`${name}: no Sign In button`); continue; }
    checks++;
    const t = await until(page, OPEN, 5000);
    if (t < 0) { fail(`${name}: the dialog did not open`); continue; }
    // A provider: wait until it is no longer the spinner, then press it.
    const settled = await until(page, `(() => { const b = document.querySelector('#signin-modal [data-testid="sign-in-google"]'); return !!b && !b.disabled; })()`, 6000);
    if (settled < 0) { fail(`${name}: Google stayed disabled`); continue; }
    const isLink = await page.eval<boolean>(`document.querySelector('#signin-modal [data-testid="sign-in-google"]').localName === 'a'`);
    checks++;
    if (!isLink) {
      await press(page, '#signin-modal [data-testid="sign-in-google"]');
      if ((await until(page, `document.body.innerText.includes('Sign in is not available right now')`, 3000)) < 0) fail(`${name}: no toast after a failed provider`);
    }
    console.log(`ok ${name}: open in ${t} ms, provider ${isLink ? 'link' : 'toast'}`);
  } catch (e) { fail(`${name}: ${String(e).slice(0, 160)}`); }
  finally { await page.close().catch(() => {}); }
}
console.log(JSON.stringify({ origin, checks, failures }));
kill();
process.exit(failures ? 1 : 0);
