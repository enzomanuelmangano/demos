#!/usr/bin/env bun
// Regression check for the Composable Text demo on the web (tools/demos-web/patches.ts, decisions.md D18): toggling
// "Using Max" → "Use Max" leaves i, n and g; each leaving letter must stay where it was (distinct places, in order),
// not collapse onto the first one's. Fast toggles too (letters leaving while they still enter).
//   bun tools/parity/composable-text.ts <origin>      (exit 1 on a collapse)
import { launch, newPage } from './cdp.ts';

const origin = (process.argv[2] ?? 'http://127.0.0.1:4318').replace(/\/$/, '');
const { cdp, kill } = await launch({ port: 9590 });
const fails: string[] = [];
for (const width of [1440, 390]) {
  const page = await newPage(cdp, width);
  await page.goto(`${origin}/demos/app/demo/composable-text`);
  for (let i = 0; i < 100 && !(await page.eval(`!!document.querySelector('[data-testid=toggle]')`)); i++) await Bun.sleep(100);
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
  for (const gap of [1200, 1200, 150, 150, 150, 1200]) { await tap(); await Bun.sleep(gap); }
  const ghosts = await page.eval<[string, number][][]>('window.__ghosts');
  const ing = ghosts.filter((g) => g.map((c) => c[0]).join('').includes('ing'));
  if (!ing.length) fails.push(`${width}: no leaving "ing" seen`);
  for (const g of ing) {
    const xs = g.filter((c) => 'ing'.includes(c[0])).map((c) => c[1]);
    if (!xs.every((x, i) => i === 0 || x > xs[i - 1] + 2)) fails.push(`${width}: leaving letters collapse: ${JSON.stringify(g)}`);
  }
  console.log(`${width}: ${ing.length} leaves of "ing" checked`);
  await page.close();
}
kill();
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log('composable-text: leaving letters keep their places');
process.exit(0);
