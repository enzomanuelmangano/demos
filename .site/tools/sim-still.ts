#!/usr/bin/env bun
// The still of the Demos app's launcher that /demos shows until the live frame loads (docs/decisions.md D12): the
// app's framed iPhone Air at scale 1, its stage made transparent, the frame plus the 24 px the app keeps around it
// (492 x 984 CSS px), at 2x, as WebP with alpha. Re-run after the launcher changes (an icon, the wallpaper):
//   bun tools/sim-still.ts [origin, default http://127.0.0.1:4310]   (the composed output must be served there)
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { launch, newPage } from './parity/cdp.ts';

const origin = process.argv[2] ?? 'http://127.0.0.1:4310';
const out = join(import.meta.dir, '../assets/images/demos/sim-still.webp');
const { cdp, kill } = await launch({ port: 9362 });
const page = await newPage(cdp, 1200);
await page.send('Emulation.setDeviceMetricsOverride', { width: 600, height: 1032, deviceScaleFactor: 2, mobile: false });
await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
await page.goto(`${origin}/demos/app/`);
await Bun.sleep(6000);
const rect = await page.eval<{ x: number; y: number; w: number; h: number }>(`(() => {
  const stage = document.querySelector('[data-testid="web-stage"]') ?? document.querySelector('[testid="web-stage"]');
  if (!stage) throw new Error('no web-stage');
  for (let n = stage; n; n = n.parentElement) { n.style.setProperty('background', 'transparent', 'important'); }
  document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent';
  const phone = stage.firstElementChild.getBoundingClientRect();
  return { x: phone.x - 24, y: phone.y - 24, w: phone.width + 48, h: phone.height + 48 };
})()`);
if (Math.round(rect.w) !== 492 || Math.round(rect.h) !== 984) throw new Error(`frame not at scale 1: ${JSON.stringify(rect)}`);
await Bun.sleep(300);
const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: 492, height: 984, scale: 1 } });
const png = '/tmp/sim-still.png';
await Bun.write(png, Buffer.from(shot.data, 'base64'));
kill();
const r = spawnSync('cwebp', ['-quiet', '-q', '80', '-alpha_q', '90', '-m', '6', png, '-o', out], { stdio: 'inherit' });
if (r.status) process.exit(r.status);
console.log(`${out}: ${Bun.file(out).size} B`);
process.exit(0);
