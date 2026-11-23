#!/usr/bin/env bun
// Header stillness across navigations: clicks the header's links in turn (desktop) or through the mobile menu, records
// a CDP screencast, and measures how many pixels of the header bar change between consecutive frames outside the
// nav links' own boxes (whose colour and underline transition on purpose). A header kept mounted across routes, as
// the reference's root layout keeps it, changes none.
//   bun tools/parity/nav.ts <origin> [--width 1440] [--path /,/demos,/] [--out dir]
import { launch, newPage } from './cdp.ts';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const origin = args[0];
const width = Number(opt('--width') ?? 1440);
const path = (opt('--path') ?? '/,/demos,/').split(',');
const out = opt('--out');
const mobile = width < 768, barH = mobile ? 73 : 87;

const { cdp, kill } = await launch({ port: 9347 });
const page = await newPage(cdp, width);
const frames: string[] = [];
page.on((e) => {
  if (e.method === 'Page.screencastFrame') { frames.push(e.params.data); page.send('Page.screencastFrameAck', { sessionId: e.params.sessionId }); }
});
// The /demos spiral draws behind the transparent bar on its own clock (randomly, on both sites): hidden here, so
// what is measured is the bar itself.
await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'canvas{visibility:hidden!important}'; document.head.appendChild(s); })` });
let loads = 0;
page.on((e) => { if (e.method === 'Page.loadEventFired') loads++; });
await page.goto(origin + path[0]);
await Bun.sleep(4000);
loads = 0;
// The nav links' boxes (excluded: their colour and underline are the transitions under test).
const exclude = await page.eval<number[][]>(`[...document.querySelectorAll('header nav a, header [aria-controls=mobile-menu]')].map((a) => { const r = a.getBoundingClientRect(); return [r.x - 2, r.y - 2, r.width + 4, r.height + 6]; }).filter((r) => r[2] > 4 && r[3] > 4)`);
await page.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: width, maxHeight: 900 });
for (const to of path.slice(1)) {
  if (mobile) {
    await page.eval(`document.querySelector('[aria-controls="mobile-menu"]').click()`);
    await Bun.sleep(500);
    await page.eval(`[...document.querySelectorAll('#mobile-menu a')].find((a) => new URL(a.href).pathname === ${JSON.stringify(to)}).click()`);
  } else {
    const p = await page.eval<number[]>(`(() => { const a = [...document.querySelectorAll('header a')].find((a) => a.getBoundingClientRect().width > 0 && new URL(a.href).pathname === ${JSON.stringify(to)}); const r = a.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: 1 });
  }
  await Bun.sleep(1500);
}
await page.send('Page.stopScreencast');
const r = await page.eval<any>(`(async () => {
  const frames = ${JSON.stringify(frames)}, ex = ${JSON.stringify(exclude)}, W = ${width}, H = ${barH};
  const load = (d) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + d; });
  const c = new OffscreenCanvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
  let prev = null, worst = 0, changed = 0; const boxes = [];
  for (const f of frames) {
    x.clearRect(0, 0, W, H); x.drawImage(await load(f), 0, 0); const d = x.getImageData(0, 0, W, H).data;
    if (prev) {
      let n = 0, b = [W, H, 0, 0];
      for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) {
        if (ex.some(([ax, ay, aw, ah]) => X >= ax && X < ax + aw && y >= ay && y < ay + ah)) continue;
        const i = (y * W + X) * 4;
        if (Math.max(Math.abs(d[i] - prev[i]), Math.abs(d[i + 1] - prev[i + 1]), Math.abs(d[i + 2] - prev[i + 2])) > 8) { n++; b = [Math.min(b[0], X), Math.min(b[1], y), Math.max(b[2], X), Math.max(b[3], y)]; }
      }
      if (n) { changed++; if (boxes.length < 12) boxes.push([frames.indexOf(f), n, ...b]); }
      worst = Math.max(worst, n);
    }
    prev = d;
  }
  return { frames: frames.length, framesWithHeaderChange: changed, worstPixels: worst, changes: boxes };
})()`);
if (out) frames.forEach((f, i) => Bun.write(`${out}/nav-${width}-${String(i).padStart(3, '0')}.png`, Buffer.from(f, 'base64')));
console.log(JSON.stringify({ origin, width, path, documentLoads: loads, ...r }));
kill();
process.exit(r.framesWithHeaderChange ? 1 : 0);
