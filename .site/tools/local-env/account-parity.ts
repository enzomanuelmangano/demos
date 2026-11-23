#!/usr/bin/env bun
// The signed-in screens, old site against new, on the one origin of tools/local-env/switch.ts (the same setup as
// storage-continuity.ts): for each user state (no plan, an active monthly plan, a cancelled annual one, a billing issue)
// both sides are shot at 1440 and 390 (first viewport): /profile, /manage-subscription, the avatar's menu (1440), the
// cancel confirmation; signed out: the sign-in dialog over /articles. Then each pair is diffed (threshold 32/255); it
// exits 1 when a pair is over its budget (2 %; /manage-subscription 10 %: the price cards removed by design).
//   bun tools/local-env/account-parity.ts [--origin http://localhost:4317] [--out /tmp/account-parity]
// /api/user/info is answered in the browser (the reference's shape) for a made-up token; /api/purchase/* is never
// forwarded. Nothing reaches production.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, Page } from '../parity/cdp.ts';
import { diffImages } from '../parity/diff.ts';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const ORIGIN = arg('--origin', 'http://localhost:4317').replace(/\/$/, '');
const OUT = arg('--out', '/tmp/account-parity');
mkdirSync(OUT, { recursive: true });
const TOKEN = 'parity.' + crypto.randomUUID();
const USER = { id: 1, name: 'Parity Person', email: 'parity.person@example.com', profilePicture: 'https://reactiive.io/og/main.png' };
const PLANS: Record<string, unknown> = {
  none: null,
  active: { id: 1, userId: 1, itemId: 'x', subscriptionType: 'monthly', status: 'active', expiresAt: '2027-01-15T12:00:00.000Z' },
  cancelled: { id: 1, userId: 1, itemId: 'x', subscriptionType: 'annual', status: 'cancelled', expiresAt: '2027-03-02T12:00:00.000Z' },
  pastdue: { id: 1, userId: 1, itemId: 'x', subscriptionType: 'monthly', status: 'past_due', expiresAt: '2027-01-15T12:00:00.000Z' },
};
const side = async (to: string) => { await fetch(`${ORIGIN}/__switch?to=${to}`, { method: 'POST' }); };

const { cdp, kill } = await launch({ port: 9481 });
async function open(width: number, plan: unknown) {
  const mobile = width < 800;
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = new Page(cdp, sessionId, targetId, browserContextId);
  for (const d of ['Page', 'Runtime', 'Network']) await page.send(`${d}.enable`);
  await page.send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile });
  await page.send('Fetch.enable', { patterns: ['*/api/user/info*', '*/api/purchase/*', '*amplitude.com/2/*', '*api2.amplitude.com*', '*sentry.io*'].map((urlPattern) => ({ urlPattern })) });
  page.on(async (e) => {
    if (e.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = e.params;
    if (/amplitude|sentry/.test(request.url)) return page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
    const body = request.url.includes('/purchase/') ? { success: true } : { user: USER, plan, github: null, patreon: null };
    if (!request.url.includes('/purchase/') && !(request.headers.Authorization ?? request.headers.authorization ?? '').endsWith(TOKEN)) return page.send('Fetch.continueRequest', { requestId });
    await page.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
  });
  return page;
}
const until = async (page: Page, expr: string, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await page.eval(`!!(${expr})`).catch(() => false)) return true; await Bun.sleep(150); } return false; };
async function at(page: Page, finder: string, type: 'click' | 'hover') {
  const r = await page.eval(`(() => { const e = ${finder}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  if (!r) return false;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  if (type === 'click') for (const t of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type: t, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
}
const byText = (sel: string, text: string) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.innerText && e.innerText.trim() === ${JSON.stringify(text)} && e.getClientRects().length)`;
async function shot(page: Page, name: string) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 899 }).catch(() => {});
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}

const shots: string[] = [];
for (const s of ['old', 'new']) {
  await side(s);
  for (const width of [1440, 390]) {
    for (const [state, plan] of Object.entries(PLANS)) {
      const page = await open(width, plan);
      await page.goto(`${ORIGIN}/profile?accessToken=${TOKEN}`);
      await until(page, `location.search === '' && document.body.innerText.includes('Profile Settings')`);
      await page.goto(`${ORIGIN}/profile`);
      await until(page, `document.body.innerText.includes('Profile Settings')`);
      await Bun.sleep(1800);
      await shot(page, `${s}.profile-${state}@${width}`); shots.push(`profile-${state}@${width}`);
      await page.goto(`${ORIGIN}/manage-subscription`);
      await until(page, `document.body.innerText.includes('View and manage your support options')`);
      await Bun.sleep(1800);
      await shot(page, `${s}.manage-${state}@${width}`); shots.push(`manage-${state}@${width}`);
      if (state === 'active') {
        await at(page, byText('button', 'Cancel Plan'), 'click');
        await until(page, `document.body.innerText.includes('Cancel subscription?')`);
        await Bun.sleep(900);
        await shot(page, `${s}.cancel-dialog@${width}`); shots.push(`cancel-dialog@${width}`);
      }
      if (state === 'active' && width === 1440) {
        await page.goto(`${ORIGIN}/demos`);
        await until(page, `document.querySelector('img[alt="Profile"]')`);
        // A hover before the new site's runtime has started is not replayed (Exact's capture keeps presses and fields).
        await until(page, `!document.querySelector('script[type="application/vnd.exact.checkpoint"]') || (self.exact && self.exact.ready)`);
        await Bun.sleep(1200);
        await at(page, `document.querySelector('img[alt="Profile"]')`, 'hover');
        await Bun.sleep(600);
        const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 852, y: 24, width: 232, height: 234, scale: 1 } /* the avatar and the menu (opaque) only */ });
        writeFileSync(join(OUT, `${s}.menu@${width}.png`), Buffer.from(data, 'base64')); shots.push(`menu@${width}`);
      }
      await page.close();
    }
    // Signed out: the sign-in dialog over /articles (the same page on both sides; /demos is the redesigned page, D17).
    const page = await open(width, null);
    await page.goto(`${ORIGIN}/articles`);
    await Bun.sleep(2500);
    if (width < 768) {
      // Under 768 px Sign In is the mobile menu's last entry (the header's handleProfileClick).
      await at(page, `[...document.querySelectorAll('button')].find(b => /menu/i.test(b.getAttribute('aria-label') || '') && b.getClientRects().length)`, 'click');
      await Bun.sleep(700);
      await at(page, `[...document.querySelectorAll('button,a,[role=button]')].filter(e => e.innerText && e.innerText.trim() === 'Sign In' && e.getClientRects().length).pop()`, 'click');
    } else await at(page, byText('button', 'Sign In'), 'click');
    await until(page, `document.body.innerText.includes('Sign in to Reactiive')`);
    await Bun.sleep(1200);
    // The dialog's own box only: the page behind it (article cards, their images still decoding) is not the account UI.
    const box = await page.eval<{ x: number; y: number; width: number; height: number }>(`(() => { const h = [...document.querySelectorAll('body *')].filter(e => e.textContent.trim() === 'Sign in to Reactiive' && e.getClientRects().length).pop(); const d = (h && h.closest('dialog,[role=dialog],[data-vaul-drawer]')) || document.documentElement; const r = d === document.documentElement ? { x: 0, y: 0, width: innerWidth, height: innerHeight } : d.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(Math.min(r.height, innerHeight - r.y)) }; })()`);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } });
    writeFileSync(join(OUT, `${s}.sign-in@${width}.png`), Buffer.from(data, 'base64')); shots.push(`sign-in@${width}`);
    await page.close();
  }
}
await side('old');
const page = await open(1440, null);
const results: Record<string, number> = {};
// The most a pair may differ (% of pixels over 32/255, first viewport). /manage-subscription lacks the reference's price
// cards by the owner's decision (docs/stubs.md): its budget covers their area; everything else is the same screen.
const budget = (n: string) => n.startsWith('manage-') ? 10 : 2;
const over: string[] = [];
// Every screen, on both sides: 4 user states x (/profile, /manage-subscription) + the cancel dialog + the sign-in dialog
// at each width, + the menu at 1440. A shot missing on a side (a flow that broke before it) is a failure, not a pass.
const EXPECTED = 2 * (4 * 2 + 2) + 1;
const counts = new Map<string, number>();
for (const n of shots) counts.set(n, (counts.get(n) ?? 0) + 1);
const missing = counts.size !== EXPECTED || [...counts.values()].some((c) => c !== 2);
if (missing) console.log(`FAIL  ${counts.size} screens shot (expected ${EXPECTED}), some not on both sides: ${[...counts].filter(([, c]) => c !== 2).map(([n]) => n).join(', ') || '-'}`);
for (const n of [...new Set(shots)]) {
  const r = await diffImages(page, join(OUT, `old.${n}.png`), join(OUT, `new.${n}.png`), { diffOut: join(OUT, `diff.${n}.png`) }).catch(() => null);
  results[n] = r ? Math.round(r.ratio * 10000) / 100 : -1;
  const ok = results[n] >= 0 && results[n] <= budget(n);
  if (!ok) over.push(n);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n.padEnd(28)} ${results[n]} % px differ (budget ${budget(n)} %)`);
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
kill();
console.log(over.length ? `${over.length} over budget: ${over.join(', ')}` : missing ? 'screens missing' : `all ${counts.size} within budget`);
process.exit(over.length || missing ? 1 : 0);
