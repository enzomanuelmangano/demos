#!/usr/bin/env bun
// Regression check for the Composable Text demo on the web (tools/demos-web/patches.ts, decisions.md D18): toggling
// "Using Max" → "Use Max" leaves i, n and g; each leaving letter must stay where it was (distinct places, in order),
// not collapse onto the first one's. Every frame, as drawn: the pill stays one piece while its size springs (the
// stand-in the host springs lines up with the end caps: no step, no seam), and no staying letter jumps as a toggle
// lands. In the desktop frame at two scales (900 px high, and 666 px as /demos frames it) and on a phone; fast
// toggles too (letters leaving while they still enter, a spring turned around).
//   bun tools/parity/composable-text.ts <origin>      (exit 1 on a collapse, a broken pill or a jump)
import { launch, newPage } from './cdp.ts';

const origin = (process.argv[2] ?? 'http://127.0.0.1:4318').replace(/\/$/, '');
const { cdp, kill } = await launch({ port: 9590 });
const fails: string[] = [];
// Read after layout and before paint (a ResizeObserver's turn), once a frame: the painted fill's pieces against the
// label's box, and each staying letter's centre.
const SAMPLE = `(() => { const l = document.querySelector('[data-testid=label]'), ids = new WeakMap(); let n = 0, k = 0, t = 0;
  const m = window.__m = { frames: 0, step: 0, seam: 0, jump: 0 };
  const probe = document.body.appendChild(document.createElement('div')); probe.style.cssText = 'position:fixed;left:-9px;top:0;width:1px;height:1px';
  let last = null, before = null;
  new ResizeObserver(() => {
    const box = l.getBoundingClientRect(), pieces = [];
    for (const e of l.querySelectorAll('div:not([data-exact-text])')) {
      if (getComputedStyle(e).backgroundColor !== 'rgb(24, 24, 24)') continue;
      let { left, right, top, bottom } = e.getBoundingClientRect(); const p = e.parentElement;
      if (getComputedStyle(p).overflowX === 'hidden') { const c = p.getBoundingClientRect(); left = Math.max(left, c.left); right = Math.min(right, c.right); }
      if (right > left) pieces.push({ left, right, top, bottom });
    }
    pieces.sort((a, b) => a.left - b.left);
    let end = pieces[0]?.right;
    for (const p of pieces) { m.step = Math.max(m.step, Math.abs(p.top - box.top), Math.abs(p.bottom - box.bottom)); m.seam = Math.max(m.seam, p.left - end); end = Math.max(end, p.right); }
    const at = new Map();
    for (const e of l.children) if (e.hasAttribute('data-exact-text') && !e.hasAttribute('data-exiting')) {
      if (!ids.has(e)) ids.set(e, ++n); const r = e.getBoundingClientRect(); at.set(ids.get(e), r.x + r.width / 2); }
    const now = { t, at, key: [...at.keys()].join() };
    // At the frame the letters change, each one that stays goes on as it was going.
    if (last && before && now.key !== last.key) for (const [id, x] of at) if (last.at.has(id) && before.at.has(id))
      m.jump = Math.max(m.jump, Math.abs(x - last.at.get(id) - (last.at.get(id) - before.at.get(id)) * (now.t - last.t) / (last.t - before.t)));
    before = last; last = now; m.frames++; m.pieces = Math.max(m.pieces || 0, pieces.length);
  }).observe(probe);
  const tick = (at) => { t = at; probe.style.width = (k++ % 2 ? 1 : 2) + 'px'; requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`;
for (const [width, height] of [[1440, 900], [900, 666], [390, 844]]) {
  const page = await newPage(cdp, width, { height });
  await page.goto(`${origin}/demos/app/demo/composable-text`);
  for (let i = 0; i < 600 && !(await page.eval(`!!document.querySelector('[data-testid=label]')`)); i++) await Bun.sleep(100);
  await Bun.sleep(800);
  // Every ghost's left as it is set, per leave: [char, left][]
  await page.eval(`(() => { const l = document.querySelector('[data-testid=label]'); window.__ghosts = [];
    new MutationObserver(() => { const g = [...l.children].filter((c) => c.hasAttribute('data-exiting') && c.textContent.length === 1 && c.style.position === 'absolute');
      if (g.length) window.__ghosts.push(g.map((c) => [c.textContent, parseFloat(c.style.left)])); }).observe(l, { subtree: true, attributes: true, attributeFilter: ['style'] }); })()`);
  const r = await page.eval<{ x: number; y: number }>(`(() => { const r = document.querySelector('[data-testid=toggle]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const tap = async () => {
    if (width < 800) { await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [r] }); await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    else for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...r, button: 'left', clickCount: 1 });
  };
  await page.eval(SAMPLE);
  await Bun.sleep(100);
  // From rest, each way: a letter's jump is read here, where nothing else is moving.
  for (let i = 0; i < 4; i++) { await tap(); await Bun.sleep(1200); }
  const rest = await page.eval<number>('window.__m.jump');
  for (const gap of [150, 150, 150, 300, 80, 1200]) { await tap(); await Bun.sleep(gap); }
  const m = await page.eval<{ frames: number; pieces: number; step: number; seam: number }>('window.__m');
  const at = `${width}x${height}`;
  if (m.frames < 100 || m.pieces < 3) fails.push(`${at}: the sampler saw ${m.frames} frames, ${m.pieces} fill pieces`);
  if (m.step > 0.5) fails.push(`${at}: the pill's pieces step ${m.step.toFixed(2)} px off its box`);
  if (m.seam > 0.5) fails.push(`${at}: a ${m.seam.toFixed(2)} px seam opens in the pill`);
  if (rest > 0.8) fails.push(`${at}: a letter jumps ${rest.toFixed(2)} px as a toggle lands`);
  console.log(`${at}: ${m.frames} frames, pill step ${m.step.toFixed(2)} px, seam ${m.seam.toFixed(2)} px, letter jump from rest ${rest.toFixed(2)} px`);
  const ghosts = await page.eval<[string, number][][]>('window.__ghosts');
  const ing = ghosts.filter((g) => g.map((c) => c[0]).join('').includes('ing'));
  if (!ing.length) fails.push(`${width}: no leaving "ing" seen`);
  for (const g of ing) {
    const xs = g.filter((c) => 'ing'.includes(c[0])).map((c) => c[1]);
    if (!xs.every((x, i) => i === 0 || x > xs[i - 1] + 2)) fails.push(`${width}: leaving letters collapse: ${JSON.stringify(g)}`);
  }
  console.log(`${at}: ${ing.length} leaves of "ing" checked`);
  await page.close();
}
kill();
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log('composable-text: leaving letters keep their places, the pill stays whole, no letter jumps');
process.exit(0);
