// Time from the tap to the mobile menu's first visible frame (opacity over 0.05), n cold page loads, optionally at 4x CPU:
//   bun tools/parity/menu-time.ts <origin> <path> [n] [4x]
import { launch, newPage } from './cdp.ts';
const [origin, path, n, throttle] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 5), process.argv[5]];
const { cdp, kill } = await launch({ port: 9358 });
const res: number[] = [];
for (let k = 0; k < n; k++) {
  const page = await newPage(cdp, 390);
  if (throttle) await page.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(origin + path); await Bun.sleep(1500);
  const p = await page.eval(`(() => { const r = document.querySelector('[aria-controls=mobile-menu]').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`);
  await page.eval(`window.__t = null; (function f(){ const o = +getComputedStyle(document.getElementById('mobile-menu')).opacity; if (o > 0.05 && window.__t0) { window.__t = performance.now() - window.__t0; return; } requestAnimationFrame(f); })(); addEventListener('pointerdown', () => { window.__t0 = performance.now(); }, { capture: true, once: true });`);
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1] }] }).catch(() => {});
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: 1 });
  await Bun.sleep(3000);
  res.push(Math.round(await page.eval('window.__t ?? -1')));
  await page.close();
}
res.sort((a, b) => a - b);
console.log(origin + path, throttle ? '4x CPU' : '', JSON.stringify(res), 'median', res[Math.floor(res.length / 2)]);
kill();
