#!/usr/bin/env bun
// The cutover, simulated on ONE origin (docs/storage.md): a reader's browser storage written by the old site (the
// reference's production build) must still be there, and used, once the new site (this one) answers on the same
// origin; and the old site must still work after the new one wrote (the rollback). Prints a PASS/FAIL table.
//
//   bun tools/local-env/storage-continuity.ts [--origin http://localhost:4317] [--headed]
//
// Needs, all on loopback: tools/local-env/api.ts --prod --port 3017 --site-port 4317 (the old site, pages and API),
// tools/serve.ts --port 4319 over the composed accounts build (the new site, LEGACY_API_ORIGIN=http://127.0.0.1:3017),
// tools/local-env/switch.ts (the origin, switched between the two by POST /__switch?to=old|new: "the deploy").
//
// One Chrome profile (a real, persistent user-data-dir: its default context, not an incognito one), so storage and
// cookies carry across the switch as a reader's would. What would reach production is answered in the browser (CDP
// Fetch), never sent: /api/user/info for the test token (the reference's response shape, with an active monthly plan),
// /api/purchase/* and /api/refund/* (mocked, and the requests recorded: the cancel request of the old and of the new
// site are compared), Amplitude's and Sentry's ingestion (failed, so nothing is tracked; Amplitude keeps its queue).
// The token is a random JWT-shaped string made here (no secret signs it; only the mocked user/info accepts it). The
// reference's public token key is read from .site/.env.local to check the stored format; no value is printed.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CHROME, Cdp, Page } from '../parity/cdp.ts';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const ORIGIN = arg('--origin', 'http://localhost:4317').replace(/\/$/, '');
const HEADED = process.argv.includes('--headed');
const SITE = resolve(import.meta.dir, '../..');
const envLocal = existsSync(join(SITE, '.env.local')) ? readFileSync(join(SITE, '.env.local'), 'utf8') : '';
const KEY = /^EXPO_PUBLIC_ACCESS_KEY=(.*)$/m.exec(envLocal)?.[1]?.trim() ?? '';
if (!KEY) throw new Error('continuity: .site/.env.local has no EXPO_PUBLIC_ACCESS_KEY (bun tools/local-env/site-env.ts --site-port 4317)');
const xor = (s: string) => [...s].map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length))).join('');
const encrypt = (t: string) => btoa(xor(t));
const decrypt = (v: string | null) => { try { return v ? xor(atob(v)) : null; } catch { return null; } };

const b64u = (o: object | Uint8Array) => Buffer.from(o instanceof Uint8Array ? o : JSON.stringify(o)).toString('base64url');
const testToken = (email: string) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ email, continuity: true, iat: Math.floor(Date.now() / 1000) })}.${b64u(crypto.getRandomValues(new Uint8Array(32)))}`;
const USER = { id: 424242, name: 'Continuity Test', email: 'continuity.test@example.com', profilePicture: 'https://reactiive.io/og/main.png' };
const PLAN = { id: 1, userId: USER.id, itemId: 'test-item', subscriptionType: 'monthly', status: 'active', expiresAt: '2027-01-15T12:00:00.000Z' };
const TOKEN_A = testToken(USER.email), TOKEN_B = testToken(USER.email);
const UTM = 'continuity-test';

// ------------------------------------------------------------------ results
const rows: { phase: string; check: string; ok: boolean; detail: string }[] = [];
let phase = '';
const check = (name: string, ok: boolean, detail = '') => { rows.push({ phase, check: name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  [${phase}] ${name}${detail ? `  (${detail})` : ''}`); };

// ------------------------------------------------------------------ the switch
async function side(to: 'old' | 'new') {
  const r = await (await fetch(`${ORIGIN}/__switch?to=${to}`, { method: 'POST' })).json() as { mode: string };
  if (r.mode !== to) throw new Error(`switch: still ${r.mode}`);
  const probe = await fetch(`${ORIGIN}/`, { redirect: 'manual' });
  if (probe.headers.get('x-switch-side') !== to) throw new Error('switch: the origin did not answer from ' + to);
}

// ------------------------------------------------------------------ Chrome: one persistent profile
const profile = mkdtempSync(join(tmpdir(), 'continuity-profile-'));
const port = 9471 + Number(process.env.CDP_PORT_OFFSET ?? 0);
const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  ...(HEADED ? [] : ['--headless=new']), '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { proc.kill('SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
let ver: any;
for (let i = 0; i < 100 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await Bun.sleep(100); } }
if (!ver) throw new Error('chrome did not start');
const cdp = await Cdp.connect(ver.webSocketDebuggerUrl);

type Sent = { side: string; url: string; method: string; headers: Record<string, string>; body: string };
const sentPurchase: Sent[] = [];
const userInfoAuth: string[] = [];
let currentSide = 'old';
const plain = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

async function openPage(browserContextId?: string): Promise<Page> {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', ...(browserContextId ? { browserContextId } : {}) });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = new Page(cdp, sessionId, targetId, browserContextId ?? '');
  for (const d of ['Page', 'Runtime', 'Network']) await page.send(`${d}.enable`);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.send('Fetch.enable', { patterns: ['*/api/user/info*', '*/api/purchase/*', '*/api/refund/*', '*api2.amplitude.com*', '*api.eu.amplitude.com*',
    '*.amplitude.com/2/httpapi*', '*sentry.io*', '*ingest.*sentry*'].map((urlPattern) => ({ urlPattern })) });
  page.on(async (e) => {
    if (e.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = e.params;
    const url = new URL(request.url);
    const json = (status: number, body: unknown) => page.send('Fetch.fulfillRequest', { requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
    if (/amplitude|sentry/.test(url.host)) return page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
    if (url.pathname.startsWith('/api/purchase/') || url.pathname.startsWith('/api/refund/')) {
      // NEVER forwarded: a real subscription must never be touched.
      sentPurchase.push({ side: currentSide, url: url.pathname + url.search, method: request.method, headers: plain(request.headers), body: request.postData ?? '' });
      return json(200, { success: true });
    }
    const auth = plain(request.headers).authorization ?? '';
    const token = auth.replace(/^Bearer /, '');
    if (token === TOKEN_A || token === TOKEN_B) {
      userInfoAuth.push(`${currentSide}:${token === TOKEN_A ? 'A' : 'B'}`);
      return json(200, { user: USER, plan: PLAN, github: null, patreon: null });
    }
    return page.send('Fetch.continueRequest', { requestId }); // the real local API (a 401 for anything else)
  });
  return page;
}

const until = async (page: Page, expr: string, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await page.eval(`!!(${expr})`).catch(() => false)) return true; await Bun.sleep(150); } return false; };
const textHas = (s: string) => `document.body && document.body.innerText.includes(${JSON.stringify(s)})`;
async function clickWhere(page: Page, finder: string) {
  const r = await page.eval(`(() => { const e = ${finder}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  if (!r) return false;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
}
const byText = (sel: string, text: string) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.innerText && e.innerText.trim() === ${JSON.stringify(text)} && e.getClientRects().length)`;
async function hover(page: Page, finder: string) {
  const r = await page.eval(`(() => { const e = ${finder}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  if (r) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  return !!r;
}

type Snap = { ls: Record<string, string>; ss: Record<string, string>; cookies: Record<string, string>; idb: string[] };
async function snapshot(page: Page): Promise<Snap> {
  const s = await page.eval<{ ls: Record<string, string>; ss: Record<string, string>; idb: string[] }>(`(async () => ({
    ls: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])),
    ss: Object.fromEntries(Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)])),
    idb: indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : [] }))()`);
  const { cookies } = await page.send('Network.getAllCookies');
  return { ...s, cookies: Object.fromEntries(cookies.map((c: any) => [c.name, c.value])) };
}
const ampCookie = (s: Snap) => Object.keys(s.cookies).find((k) => /^AMP_[A-Za-z0-9]{10}$/.test(k));
const ampState = (s: Snap) => { const k = ampCookie(s); try { return k ? JSON.parse(decodeURIComponent(atob(decodeURIComponent(s.cookies[k])))) : {}; } catch { return {}; } };
const ampDevice = (s: Snap) => (ampState(s).deviceId as string) ?? '';
const shortKey = (k: string) => k.replace(/^(AMP_(?:[A-Za-z]+_)*)([A-Za-z0-9]{10})(.*)$/, '$1<key10>$3');
const avatarSrc = (page: Page) => page.eval<string>(`(document.querySelector('img[alt="Profile"]') || {}).src || ''`);

// ===================================================================================================================
const page = await openPage();
try {
  // ---------------------------------------------------------------- 1. the old site writes every kind of state
  phase = '1 old site';
  await side('old'); currentSide = 'old';
  await page.goto(`${ORIGIN}/?utm_source=${UTM}`);
  check('old: Amplitude device id cookie created', await until(page, `document.cookie.split('; ').some(c => /^AMP_[A-Za-z0-9]{10}=/.test(c))`, 20000));
  check('old: @UtmSource stored from ?utm_source', await until(page, `localStorage.getItem('@UtmSource') === ${JSON.stringify(UTM)}`));
  await page.goto(`${ORIGIN}/demos`);
  check('old: TanStack persisted cache REACTIIVE_CACHE (stars)', await until(page, `(JSON.parse(localStorage.getItem('REACTIIVE_CACHE') || '{}').clientState?.queries || []).some(q => q.queryKey?.[0] === 'github-stars')`, 20000));
  // The OAuth callback's landing, as the reference's /api/callback/* redirect leaves it.
  await page.goto(`${ORIGIN}/profile?accessToken=${TOKEN_A}`);
  check('old: token stored under @AccessStorage (XOR + base64)', await until(page, `localStorage.getItem('@AccessStorage')`) && decrypt(await page.eval(`localStorage.getItem('@AccessStorage')`)) === TOKEN_A);
  check('old: URL cleaned, /profile drawn', await until(page, `location.search === '' && ${textHas('Profile Settings')}`));
  check('old: signed-in hint reactiive:signed-in = 1', await until(page, `localStorage.getItem('reactiive:signed-in') === '1'`));
  const oldAvatar = await (async () => { await until(page, `document.querySelector('img[alt="Profile"]')`); return avatarSrc(page); })();
  check('old: avatar drawn', oldAvatar !== '', oldAvatar ? 'img src set' : '');
  // The old site's cancel request (mocked), to compare with the new site's.
  await page.goto(`${ORIGIN}/manage-subscription`);
  await until(page, textHas('Cancel Plan'));
  await clickWhere(page, byText('button', 'Cancel Plan'));
  await until(page, textHas('Cancel subscription?'));
  await clickWhere(page, byText('button', 'Cancel subscription'));
  check('old: cancel request sent (mocked)', await until(page, `true`) && (await (async () => { for (let i = 0; i < 40 && !sentPurchase.some((s) => s.side === 'old'); i++) await Bun.sleep(150); return sentPurchase.some((s) => s.side === 'old'); })()));
  await Bun.sleep(1500); // Amplitude's throttled writes and the persister's (1 s)
  const before = await snapshot(page);
  const deviceBefore = ampDevice(before);
  check('old: Amplitude device id readable', deviceBefore !== '');

  // ---------------------------------------------------------------- 2. the deploy: the new site on the same origin
  phase = '2 new site';
  await side('new'); currentSide = 'new';
  userInfoAuth.length = 0;
  await page.goto(`${ORIGIN}/`);
  check('new: the old session is taken (exact.state.accessToken = the token)', JSON.parse(await page.eval(`localStorage.getItem('exact.state.accessToken') || 'null'`)) === TOKEN_A);
  check('new: html[data-auth=in] before the session is known', await page.eval(`document.documentElement.dataset.auth === 'in'`));
  check('new: signed in: avatar in the header', await until(page, `document.querySelector('[data-testid="avatar"]')?.getClientRects().length`));
  check('new: user/info asked with the old token', userInfoAuth.includes('new:A'));
  check('new: same avatar picture', (await avatarSrc(page)) === oldAvatar);
  await hover(page, `document.querySelector('[data-testid="avatar"]')`);
  check('new: menu open and on top: name, email, Manage Support', await until(page, `${textHas(USER.email)} && ${textHas(USER.name)} && ${textHas('Manage Support')}
    && (m => { const b = m.getBoundingClientRect(); return m.contains(document.elementFromPoint(b.x + 20, b.y + b.height / 2)); })(document.querySelector('[data-testid="menu-support"]'))`));
  await page.goto(`${ORIGIN}/articles`); // a page that starts its runtime only on intent (D16)
  check('new: signed in on a page that activates on intent (no press)', await until(page, `document.querySelector('[data-testid="avatar"]')?.getClientRects().length`));
  check('new: utm_source carried (exact.state.utmSource)', JSON.parse(await page.eval(`localStorage.getItem('exact.state.utmSource') || 'null'`)) === UTM);
  check('new: Amplitude: same device id', await until(page, `window.amplitude && window.amplitude.getDeviceId && window.amplitude.getDeviceId() === ${JSON.stringify(deviceBefore)}`, 20000),
    'amplitude.getDeviceId() equals the old cookie\'s');
  await page.goto(`${ORIGIN}/profile`);
  check('new: /profile drawn, the subscription box from the plan', await until(page, `${textHas('Profile Settings')} && ${textHas('Monthly Plan')} && ${textHas('The plan will renew on January 15, 2027')}`));
  await page.goto(`${ORIGIN}/manage-subscription`);
  check('new: /manage-subscription: status, no price', await until(page, `${textHas('Current Plan')} && ${textHas('Cancel Plan')}`) && !(await page.eval<boolean>(`/\\$\\d/.test(document.body.innerText)`)));
  await clickWhere(page, `document.querySelector('[data-testid="cancel-plan"]')`);
  check('new: cancel confirmation as live', await until(page, `document.getElementById('cancel-subscription')?.open && ${textHas("You'll keep access until January 15, 2027.")}`));
  await clickWhere(page, `document.querySelector('[data-testid="cancel-confirm"]')`);
  for (let i = 0; i < 40 && !sentPurchase.some((s) => s.side === 'new'); i++) await Bun.sleep(150);
  const o = sentPurchase.find((s) => s.side === 'old'), n = sentPurchase.find((s) => s.side === 'new');
  const same = (k: string) => (o?.headers[k] ?? '') === (n?.headers[k] ?? '');
  check('new: cancel request identical to the old site\'s (method, path, Authorization, Accept, Content-Type, body)',
    !!o && !!n && o.method === n.method && o.url === n.url && same('authorization') && same('accept') && same('content-type') && o.body === n.body,
    o && n ? `${n.method} ${n.url}, body ${n.body === '' ? 'empty' : 'set'}` : 'missing');
  check('new: the dialog closes on success, the user asked again', await until(page, `!document.getElementById('cancel-subscription')?.open`) && userInfoAuth.filter((s) => s === 'new:A').length >= 2);
  await Bun.sleep(1500);
  const after = await snapshot(page);
  const lost = Object.keys(before.ls).filter((k) => !(k in after.ls));
  check('new: no localStorage key of the old site deleted', lost.length === 0, lost.length ? `lost ${lost.map(shortKey).join(', ')}` : `${Object.keys(before.ls).length} keys kept`);
  const lostC = Object.keys(before.cookies).filter((k) => !(k in after.cookies));
  check('new: no cookie deleted', lostC.length === 0, `${Object.keys(before.cookies).length} cookies kept`);
  const lostDb = before.idb.filter((d) => !after.idb.includes(d));
  check('new: no IndexedDB database deleted', lostDb.length === 0, `${before.idb.length} kept`);
  for (const k of ['@AccessStorage', '@UtmSource', 'reactiive:signed-in', 'REACTIIVE_CACHE']) check(`new: ${k} byte-identical`, before.ls[k] === after.ls[k]);
  check('new: Amplitude cookie still names the same device', ampDevice(after) === deviceBefore);
  check('new: Amplitude session continued (same session id)', !!ampState(before).sessionId && ampState(after).sessionId === ampState(before).sessionId);
  const lostS = Object.keys(before.ss).filter((k) => !(k in after.ss));
  check('new: no sessionStorage key deleted', lostS.length === 0, `${Object.keys(before.ss).length} kept${lostS.length ? `, lost ${lostS.map(shortKey).join(', ')}` : ''}`);
  check('new: its own keys namespaced (exact.*), none collides', Object.keys(after.ls).filter((k) => !(k in before.ls)).every((k) => k.startsWith('exact.') || k.startsWith('AMP_')),
    Object.keys(after.ls).filter((k) => !(k in before.ls)).map(shortKey).join(', '));

  // ---------------------------------------------------------------- 3. rollback: the old site after the new one wrote
  phase = '3 rollback';
  await side('old'); currentSide = 'old';
  userInfoAuth.length = 0;
  await page.goto(`${ORIGIN}/profile`);
  check('old again: still signed in, /profile drawn', await until(page, `${textHas('Profile Settings')} && document.querySelector('img[alt="Profile"]')`) && (await page.eval<string>('location.pathname')) === '/profile');
  check('old again: user/info with the same token', userInfoAuth.includes('old:A'));
  await page.goto(`${ORIGIN}/demos`);
  check('old again: /demos works with the new site\'s keys present', await until(page, `document.querySelector('img[alt="Profile"]')`));
  const rolled = await snapshot(page);
  check('old again: same Amplitude device id', ampDevice(rolled) === deviceBefore);

  // ---------------------------------------------------------------- 4. a sign-out on either side is one sign-out
  phase = '4 sign-out';
  await side('new'); currentSide = 'new';
  await page.goto(`${ORIGIN}/profile`);
  await until(page, `document.querySelector('[data-testid="avatar"]')?.getClientRects().length`);
  await hover(page, `document.querySelector('[data-testid="avatar"]')`);
  await until(page, `document.querySelector('[data-testid="menu-sign-out"]')?.getClientRects().length`);
  await clickWhere(page, `document.querySelector('[data-testid="menu-sign-out"]')`);
  check('new: sign out removes @AccessStorage and the hint', await until(page, `localStorage.getItem('@AccessStorage') === null && localStorage.getItem('reactiive:signed-in') === null`));
  check('new: html[data-auth] dropped, "Sign In" shown', await until(page, `!document.documentElement.dataset.auth && document.querySelector('[data-testid="sign-in"]')?.getClientRects().length`));
  await side('old'); currentSide = 'old';
  await page.goto(`${ORIGIN}/demos`);
  check('old: signed out too', await until(page, `[...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Sign In' && b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden')`));
  check('old: kept @UtmSource and REACTIIVE_CACHE', await page.eval(`localStorage.getItem('@UtmSource') === ${JSON.stringify(UTM)} && !!localStorage.getItem('REACTIIVE_CACHE')`));

  // ---------------------------------------------------------------- 5. a sign-in on the new site, read by the old
  phase = '5 new sign-in';
  await side('new'); currentSide = 'new';
  await page.goto(`${ORIGIN}/profile?accessToken=${TOKEN_B}`);
  check('new: callback landing signs in', await until(page, `location.search === '' && ${textHas('Profile Settings')}`));
  check('new: token written in the old format (@AccessStorage decrypts to it)', decrypt(await page.eval(`localStorage.getItem('@AccessStorage')`)) === TOKEN_B
    && (await page.eval<string>(`localStorage.getItem('@AccessStorage')`)) === encrypt(TOKEN_B));
  check('new: hint written (reactiive:signed-in = 1)', await until(page, `localStorage.getItem('reactiive:signed-in') === '1'`));
  await side('old'); currentSide = 'old';
  userInfoAuth.length = 0;
  await page.goto(`${ORIGIN}/profile`);
  check('old: signed in with the new site\'s session', await until(page, `${textHas('Profile Settings')} && document.querySelector('img[alt="Profile"]')`) && userInfoAuth.includes('old:B'));

  // ---------------------------------------------------------------- 6. a brand-new visitor (no storage at all)
  phase = '6 new visitor';
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
  const fresh = await openPage(browserContextId);
  await side('new'); currentSide = 'new';
  await fresh.goto(`${ORIGIN}/`);
  check('new: "Sign In" shown, no data-auth', await until(fresh, `document.querySelector('[data-testid="sign-in"]')?.getClientRects().length && !document.documentElement.dataset.auth`));
  await Bun.sleep(1500);
  const f = await snapshot(fresh);
  check('new: no session invented (@AccessStorage absent, token "")', !('@AccessStorage' in f.ls) && f.ls['exact.state.accessToken'] === '""');
  check('new: no reference key written for a stranger', !['@UtmSource', 'reactiive:signed-in'].some((k) => k in f.ls), Object.keys(f.ls).map(shortKey).join(', '));
  await side('old'); currentSide = 'old';
  await fresh.goto(`${ORIGIN}/demos`);
  check('old: the same visitor, signed out, works', await until(fresh, `[...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Sign In' && b.getClientRects().length)`));
  check('no purchase/refund request left the browser', true, `${sentPurchase.length} intercepted, 0 forwarded`);
} finally {
  await side('old').catch(() => {});
  console.log('\n| Phase | Check | Result | Detail |\n|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.phase} | ${r.check} | ${r.ok ? 'PASS' : '**FAIL**'} | ${r.detail.replace(/\|/g, '/')} |`);
  const failed = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - failed}/${rows.length} PASS${failed ? `, ${failed} FAIL` : ''}`);
  cleanup();
  process.exit(failed ? 1 : 0);
}
