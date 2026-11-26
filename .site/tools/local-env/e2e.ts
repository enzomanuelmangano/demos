#!/usr/bin/env bun
// The accounts' features end to end on the local composed site (docs/local-env.md), in headless Chrome:
//   bun tools/local-env/e2e.ts [http://localhost:4314]
// Real requests go to the local API (tools/local-env/api.ts) for what writes nothing anywhere: the sign-in URLs, the
// GitHub stars, a rejected token. What would need a real session or would send something (user/info for a signed-in
// user, feedback/submit) is answered in the browser by CDP's Fetch domain with the reference's response shapes, and
// the request the page sent is checked (method, path, Authorization, JSON body). No OAuth consent is completed, no
// Telegram message is sent, nothing is written to the database. Prints no secret: URLs are reduced to host + the
// redirect_uri parameter, tokens to "<test token>".
import { launch, newPage, type Page } from '../parity/cdp.ts';

const ORIGIN = (process.argv[2] ?? `http://localhost:${process.env.SITE_PORT ?? 4314}`).replace(/\/$/, '');
const TOKEN = 'e2e-test-token';
const USER = { id: 1, name: 'Test Person', email: 'test.person@example.com', profilePicture: '' };
const SPONSORS = 'https://github.com/sponsors/enzomanuelmangano';
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push([name, ok, detail]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const until = async (page: Page, expr: string, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await page.eval(`!!(${expr})`).catch(() => false)) return true; await Bun.sleep(100); } return false; };
const q = (id: string) => `document.querySelector('[data-testid="${id}"]')`;
const visible = (id: string) => `(e => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden')(${q(id)})`;
async function click(page: Page, id: string) {
  const r = await page.eval(`(() => { const e = ${q(id)}; if (!e) return null; e.scrollIntoView({block: 'center'}); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  if (!r) throw new Error(`no ${id}`);
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
}
const short = (u: string) => { try { const x = new URL(u); return `${x.host} redirect_uri=${x.searchParams.get('redirect_uri') ?? '-'}`; } catch { return '(none)'; } };

const { cdp, kill } = await launch({ port: 9371 });
try {
  const page = await newPage(cdp, 1440);
  // Mocked endpoints (CDP Fetch): user/info for the test token (`plan`: none until step 4b), feedback/submit.
  let plan: unknown = null;
  const sent: { url: string; method: string; auth: string; body: string }[] = [];
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/user/info*' }, { urlPattern: '*/api/feedback/submit*' }] });
  page.on(async (e) => {
    if (e.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = e.params;
    const auth = request.headers.Authorization ?? request.headers.authorization ?? '';
    if (!auth.endsWith(TOKEN)) return page.send('Fetch.continueRequest', { requestId }); // the real API answers (401)
    sent.push({ url: request.url, method: request.method, auth: auth.replace(TOKEN, '<test token>'), body: request.postData ?? '' });
    const body = request.url.includes('/user/info') ? { user: USER, plan, github: null, patreon: null } : { success: true };
    await page.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
  });

  // Nothing may reach the production analytics or error projects from localhost.
  const beacons: string[] = [];
  page.on((e) => { if (e.method === 'Network.requestWillBeSent' && /sentry\.io|ingest\.|amplitude\.com\/(2\/)?httpapi|api2\.amplitude|api\.eu\.amplitude/.test(e.params.request.url)) beacons.push(new URL(e.params.request.url).host); });
  const consoleLines: string[] = [];
  page.on((e) => { if (e.method === 'Runtime.consoleAPICalled') consoleLines.push(e.params.args.map((x: any) => x.value ?? '').join(' ')); });

  // 1. Signed out: Sign In opens the dialog; its links are the providers' URLs from the API.
  await page.goto(`${ORIGIN}/`);
  check('signed out: "Sign In" shown', await until(page, visible('sign-in')));
  await click(page, 'sign-in');
  check('sign-in dialog opens', await until(page, `document.getElementById('signin-modal')?.open`));
  check('Google link ready', await until(page, `${q('sign-in-google')}?.href?.startsWith('https://accounts.google.com/')`));
  check('Apple link ready', await until(page, `${q('sign-in-apple')}?.href?.startsWith('https://appleid.apple.com/')`));
  const g = await page.eval<string>(`${q('sign-in-google')}?.href ?? ''`);
  const a = await page.eval<string>(`${q('sign-in-apple')}?.href ?? ''`);
  check('Google redirect_uri is the local callback', new URL(g).searchParams.get('redirect_uri') === `${ORIGIN.replace('127.0.0.1', 'localhost')}/api/callback/google`, short(g));
  check('Apple redirect_uri is the local callback', (new URL(a).searchParams.get('redirect_uri') ?? '').endsWith('/api/callback/apple'), short(a));
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('Escape closes it', await until(page, `!document.getElementById('signin-modal')?.open`));

  // 2. The OAuth callback's landing: /profile?accessToken=… keeps the token, cleans the URL, shows the profile.
  await page.goto(`${ORIGIN}/profile?accessToken=${TOKEN}`);
  check('token taken from the URL, URL cleaned', await until(page, `location.pathname === '/profile' && location.search === ''`));
  check('signed in: avatar in the header', await until(page, visible('avatar')));
  check('/profile drawn', await until(page, `document.body.innerText.includes('Profile Settings')`));
  // Without a plan (decisions.md D26): the sponsor box, nothing about a subscription.
  const external = (id: string) => `(e => !!e && e.href === '${SPONSORS}' && e.target === '_blank' && e.rel.includes('noopener') && e.innerText.trim() === 'Sponsor on GitHub')(${q(id)})`;
  check('no plan: /profile invites to sponsor on GitHub', await until(page, external('sponsor-github'))
    && !(await page.eval<boolean>(`!!${q('subscription-box')} || /No Active Plan|Manage Subscription/.test(document.body.innerText)`)));
  check('user/info sent with the Bearer token', sent.some((s) => s.url.endsWith('/api/user/info') && s.auth === 'Bearer <test token>'));

  // 3. The session survives navigation and a reload.
  await page.goto(`${ORIGIN}/articles`);
  check('session kept across navigation (avatar on /articles)', await until(page, visible('avatar')));
  await page.goto(`${ORIGIN}/profile`);
  check('session kept across reload (/profile stays)', await until(page, `document.body.innerText.includes('Profile Settings')`) && (await page.eval<string>('location.pathname')) === '/profile');
  await click(page, 'avatar');
  check('menu: name and email', await until(page, `document.body.innerText.includes('${USER.email}') && document.body.innerText.includes('${USER.name}')`));

  check('no plan: menu: "Sponsor on GitHub", external, no "Manage Support"', await until(page, external('menu-sponsor')) && !(await page.eval<boolean>(`!!${q('menu-support')}`)));
  await page.goto(`${ORIGIN}/manage-subscription`);
  check('no plan: /manage-subscription goes to /profile', await until(page, `location.pathname === '/profile' && ${q('sponsor-box')}`));

  // 4. Feedback: the request's shape, mocked (no Telegram message).
  await click(page, 'send-feedback');
  check('feedback dialog opens', await until(page, `document.getElementById('feedback')?.open`));
  await click(page, 'feedback-text');
  await page.send('Input.insertText', { text: '[localhost test] feedback from the e2e check' });
  await click(page, 'feedback-anonymous');
  await click(page, 'feedback-send');
  check('feedback toast', await until(page, `document.body.innerText.includes('Thank you for your feedback!')`));
  const fb = sent.find((s) => s.url.endsWith('/api/feedback/submit'));
  const body = fb ? JSON.parse(fb.body) : {};
  check('feedback POST shape', !!fb && fb.method === 'POST' && fb.auth === 'Bearer <test token>' && body.feedback === '[localhost test] feedback from the e2e check' && body.isAnonymous === true, fb ? JSON.stringify({ ...body }) : 'not sent');

  // 4b. With a plan (nothing is pressed: no purchase endpoint is called): status and cancel, nothing to buy.
  plan = { id: 1, userId: 1, itemId: 'x', subscriptionType: 'monthly', status: 'active', expiresAt: '2027-01-15T12:00:00.000Z' };
  await page.goto(`${ORIGIN}/profile`);
  check('plan: /profile shows the subscription, no sponsor box', await until(page, q('subscription-box')) && !(await page.eval<boolean>(`!!${q('sponsor-box')}`)));
  await page.goto(`${ORIGIN}/manage-subscription`);
  check('plan: /manage-subscription: "Your subscription", Cancel Plan, nothing sold', await until(page, `document.body.innerText.includes('Your subscription') && ${q('cancel-plan')}`)
    && !(await page.eval<boolean>(`/All 100\\+|Plan Benefits|Review Billing|refund|\\$\\d/i.test(document.body.innerText) || !!document.querySelector('a[href*="checkout."]')`)));
  plan = null;

  // 5. Sign out.
  await page.goto(`${ORIGIN}/articles`);
  await until(page, visible('avatar'));
  await click(page, 'avatar');
  await until(page, `getComputedStyle(${q('menu-sign-out')}).pointerEvents !== 'none' && getComputedStyle(${q('menu-sign-out')}.parentElement.parentElement).opacity === '1'`);
  await click(page, 'menu-sign-out');
  check('signed out: "Sign In" back', await until(page, visible('sign-in')));
  await page.goto(`${ORIGIN}/profile`);
  check('/profile signed out goes to /demos', await until(page, `location.pathname === '/demos'`));

  // 6. A token the real API rejects (401): shown signed out, kept stored (the old site keeps @AccessStorage on a 401;
  //    only a sign-out removes it: docs/storage.md).
  await page.goto(`${ORIGIN}/profile?accessToken=not-a-valid-jwt`);
  check('rejected token: signed out, sent to /demos', await until(page, `location.pathname === '/demos'`, 15000));
  check('rejected token: "Sign In" shown, the token kept stored', await until(page, `${visible('sign-in')}`)
    && await page.eval<boolean>(`localStorage.getItem('exact.state.accessToken') === JSON.stringify('not-a-valid-jwt') && localStorage.getItem('@AccessStorage') !== null`));

  // 7. Live GitHub stars on /demos (the real API; the snapshot is the fallback).
  const stars = await fetch(`${ORIGIN}/api/github/stars?repo=enzomanuelmangano/demos`).then((r) => r.json()).catch(() => ({}));
  await page.goto(`${ORIGIN}/demos`);
  const want = typeof stars.stars === 'number' ? stars.stars.toLocaleString('en-US') : '';
  check('stars pill shows the live count', !!want && (await until(page, `document.querySelector('[aria-label$=" stars"]')?.getAttribute('aria-label') === '${want} stars'`)), `${want} stars`);
  for (let t = 0; t < 10000 && !consoleLines.some((l) => l.includes('[amplitude] localhost')); t += 200) await Bun.sleep(200); // the SDK loads after the page
  check('Amplitude initialised opted out on localhost', consoleLines.some((l) => l.includes('[amplitude] localhost')));
  check('Sentry initialised disabled on localhost', consoleLines.some((l) => l.includes('[sentry] localhost')));
  check('no request to Sentry or Amplitude ingestion', beacons.length === 0, beacons.join(', '));
  await page.close();
} finally {
  kill();
}
const failed = results.filter((r) => !r[1]).length;
console.log(`\ne2e: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
