#!/usr/bin/env bun
// Regression probe: the Audio Player demo's artwork is centred on the phone's screen, paused (scale 0.9) and playing
// (scale 1), framed (1440: the iPhone Air shell) and full screen (390).
//   bun tools/parity/audio-artwork-centre.ts <origin> [<app path>]     (app path default /demos/app; a dev server: /)
// The drawn face (testId audio-artwork-face, else the artwork's first child) was content-box: its padding of 24 made
// it art + 48 square from the box's top-left, so it hung 24 pt right of centre (×0.9 paused, ×0.91 in the frame).
// It measures the face and the artwork box against the screen (testId audio-player) and fails when either centre is
// more than 0.5 css px from the screen's, or the face is not as wide as the box. Exits 1 on a failure.
import { launch, newPage } from './cdp.ts';

const [origin = 'http://localhost:4310', app = '/demos/app'] = process.argv.slice(2);
const base = `${origin}${app.replace(/\/$/, '')}`;
const { cdp, kill } = await launch({ port: 9361 });
const measure = `(() => {
  const box = document.querySelector('[data-testid="audio-artwork"]');
  const screen = document.querySelector('[data-testid="audio-player"]');
  if (!box || !screen) return null;
  const face = box.querySelector('[data-testid="audio-artwork-face"]') ?? box.firstElementChild;
  const r = (e) => { const q = e.getBoundingClientRect(); return { left: q.left, width: q.width, cx: q.left + q.width / 2, cy: q.top + q.height / 2 }; };
  return { screen: r(screen), box: r(box), face: r(face), scale: getComputedStyle(box).scale };
})()`;
const rows: any[] = [];
let failed = false;
for (const width of [1440, 390]) {
  const page = await newPage(cdp, width);
  await page.goto(`${base}/demo/audio-player`);
  let m: any = null;
  for (let i = 0; i < 60 && !m; i++) { await Bun.sleep(250); m = await page.eval(measure); }
  if (!m) { console.log(`${width}: no audio player at ${base}/demo/audio-player`); failed = true; await page.close(); continue; }
  for (const state of ['paused', 'playing']) {
    if (state === 'playing') {
      await page.eval(`document.querySelector('[data-testid="audio-play"]').click()`);
      await Bun.sleep(2000); // the critically damped scale spring (k 200, m 1) settles well inside this
    } else await Bun.sleep(1000);
    m = await page.eval(measure);
    const faceOff = m.face.cx - m.screen.cx, boxOff = m.box.cx - m.screen.cx, sizeOff = m.face.width - m.box.width;
    const ok = Math.abs(faceOff) <= 0.5 && Math.abs(boxOff) <= 0.5 && Math.abs(sizeOff) <= 0.5;
    if (!ok) failed = true;
    rows.push({ width, state, scale: m.scale, screenCx: +m.screen.cx.toFixed(2), boxCx: +m.box.cx.toFixed(2), faceCx: +m.face.cx.toFixed(2),
      faceOff: +faceOff.toFixed(2), faceW: +m.face.width.toFixed(2), boxW: +m.box.width.toFixed(2), ok });
  }
  await page.close();
}
console.table(rows);
console.log(failed ? 'FAIL: the artwork is off centre' : 'PASS: the artwork is centred (≤ 0.5 px) in both states');
kill();
process.exit(failed ? 1 : 0);
