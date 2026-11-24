#!/usr/bin/env bun
// The framed phone's iOS keyboard on /demos (desktop, tools/demos-web/keyboard.js): a focused field in the drawn
// iPhone Air brings up the keys, they type into it, what iOS lifts rides on them, and they go when the field lets go.
//   bun tools/parity/sim-keyboard.ts <origin> [--shots <dir>] [--headed]      (exit 1 on any failure)
// 1. cherry-blossom-qrcode (opened in the frame): its URL field takes focus; the keys slide up (light, URL layout,
//    318 pt, no suggestions); the field's toolbar ends on the keys' top; mouse presses on q, w, e type "qwe" into
//    the field (the app's own state: the field shows it) and three Backspaces take it back; Return keeps the keys up
//    (the demo refocuses its field); the key balloon shows while a letter is held.
// 2. verification-code: the number pad (318 pt) and env.keyboardHeight: the code lifts by half of it; digits type.
// 2b. dot-sheet's text view: the blue "send" key; Return types its new line, which the demo takes as send (keys down).
// 3. gl-transitions' note field: the text keyboard with suggestions (344.2 pt) and a capital first letter.
// 3b. prefers-reduced-motion (emulated in the frame): the keys fade out and in place, by opacity only, never moving.
// 4. The home's pull-down search: a dark keyboard (the home's colour scheme) with a blue search key; typing filters
//    the results; Cancel lets go of the field and the keys slide down; nothing of the keyboard is left visible.
// 5. Not framed (the app at /demos/app/ full window): no keyboard is ever built.
// --shots writes DPR 2 (--dpr n) screenshots of the phone (before / after each step) into <dir>.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, newPage, type Page } from './cdp.ts';

const args = process.argv.slice(2);
const origin = (args[0] ?? 'http://127.0.0.1:4310').replace(/\/$/, '');
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : '';
if (shots) mkdirSync(shots, { recursive: true });
const { cdp, kill } = await launch({ port: 9617, headed: args.includes('--headed') });
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const until = async (f: () => Promise<boolean>, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f().catch(() => false)) return true; await Bun.sleep(50); } return false; };

type App = { eval: <T = any>(e: string) => Promise<T>; send: (method: string, params?: object) => Promise<any> };
async function frameApp(): Promise<App | null> {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const t = targetInfos.filter((t: any) => t.type === 'iframe' && t.url.includes('/demos/app/')).pop();
  if (!t) return null;
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  return { send: (method, params = {}) => cdp.send(method, params, sessionId), eval: async (e) => { const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; } };
}
// The keyboard's state, read in the frame, in display points.
// The drawn phone in use (each route draws its own): the one holding the focus, else the last drawn.
const DEV = `(() => { const ds = [...document.querySelectorAll('[data-testid="web-device"]')]; const a = document.activeElement; return ds.find((d) => d.contains(a)) ?? ds.pop(); })`;
const KB = `(() => { const DEV = ${DEV};
  const r = document.querySelector('[data-site-keyboard]'); if (!r) return { built: false };
  const kb = r.querySelector('.kb'), dev = DEV().getBoundingClientRect(), s = dev.width / 420;
  const k = kb.getBoundingClientRect();
  const keys = [...kb.querySelectorAll('.k')].map((e) => e.textContent);
  return { built: true, visible: getComputedStyle(r).visibility === 'visible' && k.top < dev.bottom - 1, top: (k.top - dev.top) / s, height: k.height / s,
    pred: getComputedStyle(kb.querySelector('.pred')).display !== 'none', keys, dark: kb.style.color === 'rgb(255, 255, 255)',
    vk: navigator.virtualKeyboard.boundingRect.height };
})()`;
const rectIn = (sel: string) => `(() => { const DEV = ${DEV}; const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(), d = DEV().getBoundingClientRect(), s = d.width / 420; return { x: r.x, y: r.y, w: r.width, h: r.height, top: (r.top - d.top) / s, bottom: (r.bottom - d.top) / s }; })()`;

async function frameOffset(page: Page) {
  return page.eval<{ x: number; y: number }>(`(() => { const f = [...document.querySelectorAll('iframe[title="Demos"]')].find((f) => f.checkVisibility()); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
}
async function mouse(page: Page, type: string, x: number, y: number) { await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }); }
// A real press on the drawn key whose label is `label` (or the key element matched by `pick`).
async function pressKey(page: Page, app: App, label: string, hold = 60) {
  const off = await frameOffset(page);
  const p = await app.eval<any>(`(() => { const e = [...document.querySelectorAll('[data-site-keyboard] .k')].find((e) => e.dataset.id === ${JSON.stringify(label)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!p) return false;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: off.x + p.x, y: off.y + p.y });
  await mouse(page, 'mousePressed', off.x + p.x, off.y + p.y);
  await Bun.sleep(hold);
  await mouse(page, 'mouseReleased', off.x + p.x, off.y + p.y);
  await Bun.sleep(40);
  return true;
}
async function clickIn(page: Page, sel: string) {
  const off = await frameOffset(page), r = await app.eval<any>(rectIn(sel));
  if (!r) return;
  const x = off.x + r.x + r.w / 2, y = off.y + r.y + r.h / 2;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await mouse(page, 'mousePressed', x, y); await Bun.sleep(50); await mouse(page, 'mouseReleased', x, y);
}
// Until the keys rest (up at their height, or down).
const settled = () => until(async () => { const a = await app.eval<any>(KB); await Bun.sleep(120); const b = await app.eval<any>(KB); return a.built && a.top === b.top && (!b.visible || Math.abs(b.top + b.height - 912) < 0.6); }, 4000);
async function shot(page: Page, app: App, name: string) {
  if (!shots) return;
  const off = await frameOffset(page);
  const d = await app.eval<any>(rectIn('[data-testid="web-device"]'));
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: off.x + d.x, y: off.y + d.y, width: d.w, height: d.h, scale: 1 }, captureBeyondViewport: false });
  writeFileSync(join(shots, `${name}.png`), Buffer.from(data, 'base64'));
}
// The parent's press (the touch demo's channel, D19): a testId pressed as a tap would press it.
const pressApp = (page: Page, target: string) => page.eval(`(() => { const f = [...document.querySelectorAll('iframe[title="Demos"]')].find((f) => f.checkVisibility()); f.contentWindow.postMessage({ demos: 'press', target: ${JSON.stringify(target)} }, '*'); })()`);
const path = () => app.eval<string>('location.pathname');
async function home(page: Page) {
  for (let i = 0; i < 3 && (await path()).includes('/demo/'); i++) {
    await pressApp(page, 'close');
    await until(async () => !(await path()).includes('/demo/'), 5000);
  }
  await Bun.sleep(700);
}
async function openDemo(page: Page, slug: string) {
  await home(page);
  for (let i = 0; i < 4 && !(await path()).endsWith('/demo/' + slug); i++) {
    // A real click on the icon when it is on the launcher's page in view, else the parent's press.
    const r = await app.eval<any>(rectIn(`[data-testid="icon-${slug}"]`));
    if (i % 2 === 0 && r && r.top > 60 && r.bottom < 860 && r.x > 0) await clickIn(page, `[data-testid="icon-${slug}"]`);
    else await pressApp(page, 'icon-' + slug);
    await until(async () => (await path()).endsWith('/demo/' + slug), 4000);
  }
}

const page = await newPage(cdp, 1440, { height: 1000, scale: args.includes('--dpr') ? Number(args[args.indexOf('--dpr') + 1]) : 2 });
// The page's one-time touch demo (web/sim-hint.js) and hero arrow are marked seen for this session, so nothing but
// the probe drives the phone.
await page.goto(`${origin}/demos`);
await page.eval(`sessionStorage.setItem('reactiive.demos.hint', '1'); sessionStorage.setItem('reactiive.demos.arrow', 'off')`);
await page.goto(`${origin}/demos`);
await until(() => page.eval(`!!document.querySelector('iframe[data-motion~=live]')?.checkVisibility()`), 30000);
let app = (await frameApp())!;
await until(() => app.eval(`!!document.querySelector('[data-testid="web-device"]')`));
await Bun.sleep(1500);
check(!(await app.eval<any>(KB)).built, '0 nothing of the keyboard exists before a field is focused');
await shot(page, app, '0-launcher');

// 1. cherry-blossom-qrcode
await openDemo(page, 'cherry-blossom-qrcode');
// The demo focuses its field when its GPU scene says so; without a GPU (a headless run) a click on the field does.
let focused = await until(() => app.eval(`document.activeElement?.dataset?.testid === 'cherry-input'`), 8000);
if (!focused) { await clickIn(page, '[data-testid="cherry-input"]'); focused = await until(() => app.eval(`document.activeElement?.dataset?.testid === 'cherry-input'`), 3000); }
check(focused, '1 the QR demo\'s URL field has focus');
await settled();
await shot(page, app, '1-qr-keyboard');
let kb = await app.eval<any>(KB);
check(kb.built && kb.visible && Math.abs(kb.top - (912 - 318)) < 0.6 && Math.abs(kb.height - 318) < 0.6, `1 the keys are up: top ${kb.top?.toFixed(2)} pt, ${kb.height?.toFixed(2)} pt tall`);
check(!kb.dark && !kb.pred && kb.keys?.includes('.com'), '1 light keys, the URL layout (.com), no suggestions');
check(kb.vk === 318, `1 env.keyboardHeight (VirtualKeyboard rect) is 318: ${kb.vk}`);
const bar = await app.eval<any>(rectIn('[data-testid="cherry-blossom-qrcode-bar"]'));
const input = await app.eval<any>(rectIn('[data-testid="cherry-input"]'));
check(Math.abs(bar.bottom - kb.top) < 1 && input.bottom <= kb.top, `1 the field rides on the keys: bar bottom ${bar.bottom.toFixed(2)}, field bottom ${input.bottom.toFixed(2)}, keys' top ${kb.top.toFixed(2)}`);
const before = await app.eval<string>(`document.querySelector('[data-testid="cherry-input"]').value`);
await app.eval(`(() => { const i = document.querySelector('[data-testid="cherry-input"]'); i.setSelectionRange(i.value.length, i.value.length); })()`);
for (const k of ['c:q', 'c:w', 'c:e']) await pressKey(page, app, k);
const typed = await app.eval<string>(`document.querySelector('[data-testid="cherry-input"]').value`);
check(typed === before + 'qwe', `1 q, w, e type into the field: "${typed}"`);
// The balloon while a key is held.
{
  const off = await frameOffset(page);
  const p = await app.eval<any>(`(() => { const r = [...document.querySelectorAll('[data-site-keyboard] .k')].find((e) => e.dataset.id === 'c:r').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await mouse(page, 'mousePressed', off.x + p.x, off.y + p.y);
  await Bun.sleep(80);
  const pop = await app.eval<boolean>(`getComputedStyle(document.querySelector('[data-site-keyboard] .pop')).display === 'block' && document.querySelector('[data-site-keyboard] .pop').textContent === 'r'`);
  await shot(page, app, '1-qr-balloon');
  await mouse(page, 'mouseReleased', off.x + p.x, off.y + p.y);
  check(pop, '1 a held key shows its balloon');
}
for (let i = 0; i < 4; i++) await pressKey(page, app, 'del');
const back = await app.eval<string>(`document.querySelector('[data-testid="cherry-input"]').value`);
check(back === before, `1 four Backspaces take it back: "${back}"`);
// Backspace held: it repeats.
await app.eval(`document.execCommand('insertText', false, 'abcdefgh')`);
await pressKey(page, app, 'del', 1100);
const held = await app.eval<string>(`document.querySelector('[data-testid="cherry-input"]').value`);
check(held.length <= before.length + 3, `1 a held Backspace repeats (${before.length + 8} → ${held.length} characters)`);
await app.eval(`(() => { const i = document.querySelector('[data-testid="cherry-input"]'); i.select(); document.execCommand('insertText', false, ${JSON.stringify(before)}); })()`);
// The Mac's keyboard still types.
await page.send('Input.insertText', { text: 'z' });
check((await app.eval<string>(`document.querySelector('[data-testid="cherry-input"]').value`)).endsWith('z'), '1 the physical keyboard still types');
await pressKey(page, app, 'del');
await pressKey(page, app, 'return');
await Bun.sleep(400);
kb = await app.eval<any>(KB);
check(kb.visible && (await app.eval(`document.activeElement?.dataset?.testid === 'cherry-input'`)), '1 Return: the demo refocuses its field and the keys stay up');

// 2. verification-code
await openDemo(page, 'verification-code');
if (!(await until(() => app.eval(`document.activeElement?.dataset?.testid === 'code-field'`), 6000))) await clickIn(page, '[data-testid="code"]');
await until(() => app.eval(`document.activeElement?.dataset?.testid === 'code-field'`), 3000);
await settled(); await Bun.sleep(500);
kb = await app.eval<any>(KB);
check(kb.visible && kb.keys?.includes('2ABC') && Math.abs(kb.height - 318) < 0.6, `2 the number pad is up (${kb.height?.toFixed(2)} pt)`);
const lift = await app.eval<string>(`getComputedStyle(document.querySelector('[data-testid="code"]').parentElement).translate`);
check(/-159px/.test(lift), `2 the code lifts by half of the keys (env.keyboardHeight / 2): ${lift}`);
await shot(page, app, '2-code-keyboard');
for (const d of ['c:1', 'c:2']) await pressKey(page, app, d);
check((await app.eval<string>(`document.querySelector('[data-testid="code-field"]').value`)) === '12', '2 digits type into the code field');

// 2b. dot-sheet: its sheet's text view (enterkeyhint send): the blue "send" key; Return types a new line, the demo's send.
await openDemo(page, 'dot-sheet');
await until(() => app.eval(`!!document.querySelector('[data-testid="dot-input"]')`), 8000);
await Bun.sleep(1500);
// A tap on the card opens the sheet, which focuses its field (the demo's own flow).
{
  const off = await frameOffset(page), d = await app.eval<any>(rectIn('[data-testid="web-device"]')), s = d.w / 420;
  const x = off.x + d.x + 210 * s, y = off.y + d.y + 490 * s;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await mouse(page, 'mousePressed', x, y); await Bun.sleep(60); await mouse(page, 'mouseReleased', x, y);
}
await until(() => app.eval(`document.activeElement?.dataset?.testid === 'dot-input'`), 4000);
await settled();
kb = await app.eval<any>(KB);
check(kb.visible && kb.keys?.includes('send') && !kb.pred && Math.abs(kb.height - 318) < 0.6, `2b the sheet's text view: the "send" key, no suggestions (${kb.height?.toFixed(2)} pt)`);
await shot(page, app, '2b-dot-sheet-keyboard');
for (const k of ['c:h', 'c:i']) await pressKey(page, app, k);
const note = await app.eval<string>(`document.querySelector('[data-testid="dot-input"]').value`);
await pressKey(page, app, 'return');
await Bun.sleep(150); await settled();
kb = await app.eval<any>(KB);
check(note === 'hi' && !kb.visible, `2b "hi" typed (${JSON.stringify(note)}); Return (a new line) is the demo's send: it lets go of the field, the keys go down`);

// 3. gl-transitions: its note field opens from the + (a canvas button): focus it as its own flow does.
await openDemo(page, 'gl-transitions');
await Bun.sleep(2500);
// The note screen opens from the + once the GPU scene is up; its field shows when the scene says it is presented.
await until(() => app.eval(`!!document.querySelector('[data-testid="gl-glass-add"]')`), 10000);
await clickIn(page, '[data-testid="gl-glass-add"]');
const hasNote = await until(() => app.eval(`(() => { const i = document.querySelector('[data-testid="note-input"]'); return !!i && getComputedStyle(i).opacity === '1'; })()`), 10000);
if (!(await app.eval(`document.activeElement?.dataset?.testid === 'note-input'`))) await clickIn(page, '[data-testid="note-input"]');
await settled();
kb = await app.eval<any>(KB);
check(hasNote && kb.visible && kb.pred && Math.abs(kb.height - 344.2) < 0.6 && kb.keys?.includes('Q'), `3 the note field: suggestions, 344.2 pt, capitals first (${kb.height?.toFixed(2)} pt, shifted ${kb.keys?.includes('Q')})`);
await shot(page, app, '3-note-keyboard');
for (const k of ['c:h', 'c:i']) await pressKey(page, app, k);
check((await app.eval<string>(`document.querySelector('[data-testid="note-input"]').value`)) === 'Hi', '3 typing: "Hi" (the auto-capital, then lower case)');
// Motion: the field let go and taken again; the frames of each slide (rAF in the frame), none long, and the keys move
// by an animation of transform only (the compositor's).
const frames = (act: string) => app.eval<any>(`new Promise((done) => { const t = []; let last = 0; const f = (now) => { if (last) t.push(now - last); last = now; if (t.length < 40) requestAnimationFrame(f); else done(t); }; requestAnimationFrame((n) => { last = n; ${act}; requestAnimationFrame(f); }); })`);
for (const [name, act] of [['down', `document.querySelector('[data-testid="note-input"]').blur()`], ['up', `document.querySelector('[data-testid="note-input"]').focus()`]] as const) {
  const anims = app.eval<any>(`new Promise((r) => setTimeout(() => r(document.querySelector('[data-site-keyboard] .kb').getAnimations().map((a) => Object.keys(a.effect.getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).join())), 140))`);
  const t: number[] = await frames(act);
  const props: string[] = await anims;
  const med = [...t].sort((a, b) => a - b)[t.length >> 1], long = t.filter((d) => d > med * 1.7).length;
  check(long === 0 && props.length === 1 && props[0] === 'transform', `3 the keys slide ${name}: ${t.length} frames, median ${med.toFixed(1)} ms, ${long} long (dropped${long ? ": " + t.map((d) => d.toFixed(0)).join(" ") : ""}), animated: ${props.join(' ') || 'nothing'}`);
  await settled();
}
await shot(page, app, '3-note-refocused');
// 3b. Reduce Motion: the same blur and focus fade the keys in place (opacity only), and they still go when let go.
await app.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
for (const [name, act, up] of [['out', `document.querySelector('[data-testid="note-input"]').blur()`, false], ['in', `document.querySelector('[data-testid="note-input"]').focus()`, true]] as const) {
  // Read a few frames into the first animation the act starts (a blur lets go of the keys 80 ms later).
  const mid = await app.eval<any>(`new Promise((r) => { const kb = document.querySelector('[data-site-keyboard] .kb'), t0 = performance.now(); ${act};
    const read = () => r({ props: kb.getAnimations().map((a) => Object.keys(a.effect.getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).join()), opacity: Number(getComputedStyle(kb).opacity) });
    const poll = () => kb.getAnimations().length ? setTimeout(read, 50) : performance.now() - t0 > 500 ? read() : requestAnimationFrame(poll); poll(); })`);
  const during = await app.eval<any>(KB);
  await Bun.sleep(400);
  const after = await app.eval<any>(KB);
  const opacity = await app.eval<number>(`Number(getComputedStyle(document.querySelector('[data-site-keyboard] .kb')).opacity)`);
  check(mid.props.length === 1 && mid.props[0] === 'opacity' && mid.opacity > 0.02 && mid.opacity < 0.98 && Math.abs(during.top + during.height - 912) < 0.6 && after.visible === up && opacity === (up ? 1 : 0),
    `3b reduced motion: the keys fade ${name} in place (animated: ${mid.props.join(' ') || 'nothing'}, opacity ${mid.opacity.toFixed(2)} 50 ms in, bottom ${(during.top + during.height).toFixed(2)} pt; then ${after.visible ? 'shown' : 'hidden'})`);
}
await app.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

// 4. The home's search.
await home(page);
kb = await app.eval<any>(KB);
check(!kb.visible, '4 closing the demo lets go of the field: the keys are down');
{
  const off = await frameOffset(page);
  const p = await app.eval<any>(rectIn('[data-testid="pager"]'));
  const x = off.x + p.x + p.w / 2, y = off.y + p.y + 120;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await mouse(page, 'mousePressed', x, y);
  for (let i = 1; i <= 16; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y + i * 12, button: 'left', buttons: 1 }); await Bun.sleep(16); }
  await mouse(page, 'mouseReleased', x, y + 192);
}
await until(async () => (await app.eval<any>(KB)).visible, 3000); await settled();
kb = await app.eval<any>(KB);
check(kb.visible && kb.dark && !kb.pred && Math.abs(kb.height - 318) < 0.6, `4 the search takes the keys: dark, no suggestions, ${kb.height?.toFixed(2)} pt`);
await shot(page, app, '4-search-keyboard');
for (const k of ['c:q', 'c:r']) await pressKey(page, app, k);
const rows = await app.eval<number>(`document.querySelector('[data-testid="search"]').shadowRoot.querySelectorAll('.row').length`);
check(rows > 0 && rows < 20, `4 "qr" filters the results (${rows} rows)`);
await app.eval(`document.querySelector('[data-testid="search"]').shadowRoot.querySelector('.cancel').click()`);
await Bun.sleep(150); await settled();
kb = await app.eval<any>(KB);
check(!kb.visible && kb.vk === 0, '4 Cancel: the keys slide down, env.keyboardHeight back to 0');
await shot(page, app, '4-search-dismissed');

// 5. Not framed.
const top = await newPage(cdp, 1440, { height: 1000 });
await top.goto(`${origin}/demos/app/demo/cherry-blossom-qrcode`);
await Bun.sleep(5000);
check(await top.eval(`!document.querySelector('[data-site-keyboard]') && !(navigator.virtualKeyboard && navigator.virtualKeyboard.boundingRect.height > 0)`), '5 full window (not framed): no keyboard is built');

await page.close(); await top.close();
kill();
console.log(fails.length ? `\n${fails.length} failure(s)` : '\nall passed');
process.exit(fails.length ? 1 : 0);
