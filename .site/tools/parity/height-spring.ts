#!/usr/bin/env bun
// Regression check for `height -exact-spring(...)` transitions on the web (tools/demos-web/patches.ts, decisions.md D18):
// the JS target's motion engine heard a node's height only for a height drag's owner, so every other spring height
// landed at once. Miles Bar Chart: a fling on the week strip pages to the next week; each of the seven bars must then
// pass through intermediate heights over several frames (not jump), and settle on its new height. Clerk Toast's
// backdrop strip (`height` spring with a delay, drawn on iOS only) must spring the same way when a toast shows.
//   bun tools/parity/height-spring.ts <origin>      (exit 1 on a snap)
import { launch, newPage, type Page } from './cdp.ts';

const origin = (process.argv[2] ?? 'http://127.0.0.1:4318').replace(/\/$/, '');
const { cdp, kill } = await launch({ port: 9591 });
const fails: string[] = [];

/** Per-frame heights of the `ids` for `ms` from now, in window.__hs: [t, ...heights][], the used height in CSS px
 * (the desktop frame scales the phone, so the drawn box height would not compare with the written one). */
const sample = (page: Page, ids: string[], ms: number) => page.eval(`(() => { const els = ${JSON.stringify(ids)}.map((id) => document.querySelector('[data-testid="' + id + '"]'));
  window.__hs = []; const t0 = performance.now();
  const tick = () => { window.__hs.push([performance.now() - t0, ...els.map((e) => parseFloat(getComputedStyle(e).height))]); if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick); };
  requestAnimationFrame(tick); })()`);
const until = async (page: Page, js: string, ms = 60000) => { for (let t = 0; t < ms; t += 100) { if (await page.eval(js)) return true; await Bun.sleep(100); } return false; };

/** Each column of `rows` (after t): did it move, how many distinct in-between frames, did it settle on `ends`. */
function judge(name: string, rows: number[][], ends: number[]) {
  ends.forEach((end, i) => {
    const hs = rows.map((r) => r[i + 1]), start = hs[0];
    if (Math.abs(end - start) < 2) return; // this one barely changes: nothing to prove
    const between = new Set(hs.filter((h) => Math.abs(h - start) > 0.5 && Math.abs(h - end) > 0.5).map((h) => h.toFixed(1))).size;
    const last = hs[hs.length - 1];
    console.log(`${name}[${i}]: ${start.toFixed(1)} → ${end.toFixed(1)}, ${between} in-between frames, last ${last.toFixed(1)}`);
    if (between < 5) fails.push(`${name}[${i}]: ${start.toFixed(1)} → ${end.toFixed(1)} jumps (${between} in-between frames): ${hs.map((h) => h.toFixed(1)).join(' ')}`);
    if (Math.abs(last - end) > 0.5) fails.push(`${name}[${i}]: settles at ${last.toFixed(1)}, not ${end.toFixed(1)}`);
  });
}

// Miles Bar Chart, at a phone and a desktop width (touch and mouse flings on the strip).
for (const width of [390, 1440]) {
  const page = await newPage(cdp, width);
  await page.goto(`${origin}/demos/app/demo/miles-bar-chart`);
  if (!(await until(page, `!!document.querySelector('[data-testid=miles-weeks] canvas') && !!document.querySelector('[data-testid=bar-6]')`))) { fails.push(`${width}: miles-bar-chart never mounted`); await page.close(); continue; }
  const bars = [...Array(7).keys()].map((d) => `bar-${d}`);
  const strip = await page.eval<{ x: number; y: number }>(`(() => { const r = document.querySelector('[data-testid=miles-chart]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.bottom + 30 }; })()`);
  const fling = async () => {
    const at = (i: number) => ({ x: strip.x + 120 - i * 25, y: strip.y });
    if (width < 800) {
      await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(0)] });
      for (let i = 1; i <= 10; i++) { await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(i)] }); await Bun.sleep(16); }
      await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at(0), button: 'left', clickCount: 1 });
      for (let i = 1; i <= 10; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at(i), button: 'left', buttons: 1 }); await Bun.sleep(16); }
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at(10), button: 'left', clickCount: 1 });
    }
  };
  const label = () => page.eval<string>(`document.querySelector('[data-testid=miles-weeks]').getAttribute('aria-label')`);
  // The surface takes input once its first frame is up: fling until the week changes (the `week` message arrived).
  let changed = false;
  for (let tries = 0; tries < 8 && !changed; tries++) {
    await Bun.sleep(1500); // settled: every bar at rest
    const before = await label();
    await sample(page, bars, 2500);
    await fling();
    changed = await until(page, `document.querySelector('[data-testid=miles-weeks]').getAttribute('aria-label') !== ${JSON.stringify(before)}`, 1500);
    if (!changed) continue;
    await Bun.sleep(2600);
    // Targets: the inline heights the commit wrote (30 + 120 × value).
    const ends = await page.eval<number[]>(`${JSON.stringify(bars)}.map((id) => parseFloat(document.querySelector('[data-testid="' + id + '"]').style.height))`);
    const rows = await page.eval<number[][]>('window.__hs');
    // From the frame the first bar left its rest height.
    const moved = rows.findIndex((r, k) => k > 0 && r.some((h, i) => i > 0 && Math.abs(h - rows[0][i]) > 0.25));
    if (moved < 0) { fails.push(`${width}: no bar changed height after the week changed`); break; }
    judge(`${width} bar`, rows.slice(moved - 1), ends);
  }
  if (!changed) fails.push(`${width}: the week never changed (no \`week\` message from the strip)`);
  await page.close();
}

// Clerk Toast: the backdrop strip springs from 0 to the stack's height when the first toast shows.
{
  const page = await newPage(cdp, 390);
  await page.goto(`${origin}/demos/app/demo/clerk-toast`);
  if (!(await until(page, `!!document.querySelector('[data-testid=clerk-show]') && !!document.querySelector('[data-testid=clerk-backdrop]')`))) fails.push('clerk-toast never mounted');
  else {
    await Bun.sleep(2500);
    const r = await page.eval<{ x: number; y: number }>(`(() => { const r = document.querySelector('[data-testid=clerk-show]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await sample(page, ['clerk-backdrop'], 2500);
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [r] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await Bun.sleep(2600);
    const end = await page.eval<number>(`parseFloat(document.querySelector('[data-testid=clerk-backdrop]').style.height)`);
    const rows = await page.eval<number[][]>('window.__hs');
    const moved = rows.findIndex((row) => Math.abs(row[1] - rows[0][1]) > 0.25);
    if (moved < 0) fails.push('clerk-toast: the backdrop never changed height');
    else judge('clerk backdrop', rows.slice(moved - 1), [end]);
  }
  await page.close();
}

kill();
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log('height-spring: every spring height passes through its in-between heights and settles');
process.exit(0);
