#!/usr/bin/env bun
// The framed phone's status bar through a demo's open and close (decisions.md D18): its ink changes with the card,
// not at the route's change, by opacity only (the compositor's), in step with the flight.
//   bun tools/parity/sim-statusbar.ts <origin> [--slug notion-qrcode] [--mode app|site] [--out f.json]   (exit 1 on a snap)
// Per animation frame: the card's width over the screen's, the bar's ink as the time's luminance as shown (each copy's
// colour times its opacity), and the frame's interval. Fails when the ink jumps more than a third of the way between
// two frames while the card moves, or when the ink has turned before the card covers half the screen's width.
import { launch, newPage, type Page } from './cdp.ts';

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const origin = (args[0] ?? 'http://127.0.0.1:4318').replace(/\/$/, '');
const slug = opt('--slug', 'notion-qrcode')!;
const mode = opt('--mode', 'app')!;
const out = opt('--out');
const { cdp, kill } = await launch({ port: 9604, headed: args.includes('--headed') });
const page = await newPage(cdp, 1440, { height: 900, scale: 2 });
await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('reactiive.demos.hint', '1') } catch {}` });
await page.goto(`${origin}${mode === 'site' ? '/demos' : '/demos/app/'}`);

// The app's document: the page (app) or its out-of-process frame (site); input goes through the page.
let app: { eval: <T = any>(e: string) => Promise<T> } = { eval: (e) => page.eval(e) };
let off = { x: 0, y: 0 };
if (mode === 'site') {
  for (let i = 0; i < 300 && !(await page.eval(`!!document.querySelector('iframe[data-motion~=live]')`)); i++) await Bun.sleep(100);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const t = targetInfos.filter((t: any) => t.type === 'iframe' && t.url.includes('/demos/app/')).pop();
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  app = { eval: async (e) => (await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId)).result.value };
  off = await page.eval(`(() => { const r = [...document.querySelectorAll('iframe[data-motion~=live]')].find((f) => f.checkVisibility()).getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
}
for (let i = 0; i < 300 && !(await app.eval(`!!document.querySelector('[data-testid=icon-${slug}]')`)); i++) await Bun.sleep(100);
await Bun.sleep(2500);
await app.eval(`(() => {
  const lum = (c) => { const m = c.match(/[\\d.]+/g).map(Number); return (m[0] * 299 + m[1] * 587 + m[2] * 114) / 1000; };
  const s = window.__sb = { log: [], on: true, last: 0 };
  const step = (t) => {
    if (!s.on) return;
    const devices = [...document.querySelectorAll('[data-testid=web-device]')];
    const device = devices.at(-1);
    // The time's copies, read once per device (a full walk each frame would cost the frames it measures).
    if (device && !s.cache?.has(device)) (s.cache ??= new WeakMap()).set(device, [...device.querySelectorAll('*')].filter((e) => e.textContent === '9:41' && e.children.length === 0));
    const times = device ? s.cache.get(device) : [];
    let ink = 0, weight = 0;
    for (const e of times) { let o = 1; for (let n = e; n && n !== device; n = n.parentElement) o *= +getComputedStyle(n).opacity; ink += o * lum(getComputedStyle(e).color); weight += o; }
    const card = device?.querySelector('[data-testid=web-card]'), screen = device?.querySelector('[data-testid=web-screen]');
    const cw = card && screen ? card.getBoundingClientRect().width / screen.getBoundingClientRect().width : 0;
    s.log.push({ t, dt: s.last ? t - s.last : 0, ink: weight ? ink / Math.max(1, weight) : NaN, cover: cw, path: location.pathname });
    s.last = t;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
})()`);
const tap = async (testId: string) => {
  const r = await app.eval<any>(`(() => { const e = [...document.querySelectorAll('[data-testid=${testId}]')].filter((e) => e.checkVisibility()).at(-1).getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) { await page.send('Input.dispatchMouseEvent', { type, x: r.x + off.x, y: r.y + off.y, button: 'left', clickCount: 1 }); await Bun.sleep(40); }
};
await tap(`icon-${slug}`);
await Bun.sleep(1600);
await app.eval(`window.__sb.log.push({ mark: 'close' })`);
await tap('close');
await Bun.sleep(1800);
const log = await app.eval<any[]>('(window.__sb.on = false, window.__sb.log)');
kill();

// Two phases, split at the close's mark; the frames where the card is between icon and screen (or just changed).
const i = log.findIndex((l) => l.mark);
const phases = { open: log.slice(1, i), close: log.slice(i + 1) };
const vs = [...log.filter((l) => !l.mark && l.dt > 0).map((l) => l.dt)].sort((a, b) => a - b)[Math.floor(log.length / 4)] || 16.7;
const fails: string[] = [];
const report: any = { slug, mode, vsync: +vs.toFixed(2) };
for (const [name, ph] of Object.entries(phases)) {
  let maxJump = 0, early = 0, dropped = 0, frames = 0;
  for (let k = 1; k < ph.length; k++) {
    const a = ph[k - 1], b = ph[k];
    const moving = Math.abs(b.cover - a.cover) > 0.002 || (b.cover > 0.02 && b.cover < 0.98);
    if (!moving) continue;
    frames++;
    dropped += Math.max(0, Math.round(b.dt / vs) - 1);
    if (Number.isFinite(a.ink) && Number.isFinite(b.ink)) maxJump = Math.max(maxJump, Math.abs(b.ink - a.ink));
    // The ink of a light demo (dark) before its card covers half the screen: turned too soon.
    if (b.cover < 0.5 && Number.isFinite(b.ink) && b.ink < 128) early++;
  }
  report[name] = { frames, dropped, maxInkJump: Math.round(maxJump), inkTurnedEarly: early };
  if (maxJump > 85) fails.push(`${name}: the bar's ink jumped ${Math.round(maxJump)} of 255 between two frames`);
  if (early) fails.push(`${name}: the bar showed the demo's ink in ${early} frame(s) before the card covered half the screen`);
}
console.log(JSON.stringify(report));
if (out) await Bun.write(out, JSON.stringify({ report, log }, null, 1));
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log('sim-statusbar: the bar changes with the card');
process.exit(0);
