// Open / close flights, repeated, with a light trace (presented frames only, so a run parses in a second):
//   bun tools/web-perf/flight.ts <base url> [--demos chessboard,sudoku] [--runs 3] [--close swipe|back|both]
//     [--mobile --cpu 4] [--set "<js run in the page before each flight>"]
// Per flight: the GPU process's presented frames (Display::DrawAndSwap) over the flight's 1.5 s, the gaps between
// them (p95, max), the page's rAF max, and the page's WebGPU submits. `--set` is for A/B toggles of a fix.
import { readFileSync } from "node:fs";
import { launch, newPage, quantile } from "./cdp.ts";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = args[0].replace(/\/$/, ""), mobile = args.includes("--mobile"), cpu = Number(flag("cpu", "1"));
const demos = (flag("demos", "chessboard") ?? "").split(","), runs = Number(flag("runs", "3")), closeBy = flag("close", "both");
const set = flag("set");
const probe = readFileSync(new URL("./probe.js", import.meta.url), "utf8");

const { cdp, kill } = await launch({ port: 9500 + Math.floor(Math.random() * 40) });
const page = await newPage(cdp, mobile ? { width: 390, height: 844, mobile: true, dpr: 3 } : { width: 1440, height: 900 });
await page.send("Page.addScriptToEvaluateOnNewDocument", { source: probe });
await page.send("Page.navigate", { url: `${base}/` });
for (let i = 0; i < 240; i++) {
  await Bun.sleep(500);
  if (await page.eval(`!!(window.__perf && __perf.marks.launcherIcons && __perf.wasm.some(w => /gpu_bg/.test(w.url ?? '') && w.end))`).catch(() => false)) break;
}
await Bun.sleep(2500);
if (cpu > 1) await page.send("Emulation.setCPUThrottlingRate", { rate: cpu });
const screen = await page.eval<{ x: number; y: number; w: number; h: number }>(`(() => { const r = document.querySelector('img[src*="home-wallpaper"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
const S = (fx: number, fy: number) => [screen.x + screen.w * fx, screen.y + screen.h * fy] as const;
const mouse = (type: string, x: number, y: number, extra: any = {}) => page.send("Input.dispatchMouseEvent", { type, x, y, ...extra });
async function tap(x: number, y: number) {
  if (mobile) { await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }); await Bun.sleep(40); await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); return; }
  await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, { button: "left", clickCount: 1 }); await Bun.sleep(40); await mouse("mouseReleased", x, y, { button: "left", clickCount: 1 });
}
async function drag(x0: number, y0: number, x1: number, y1: number, ms: number) {
  const steps = Math.max(2, Math.round(ms / 8));
  if (mobile) await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
  else { await mouse("mouseMoved", x0, y0); await mouse("mousePressed", x0, y0, { button: "left", clickCount: 1 }); }
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (mobile) await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    else await mouse("mouseMoved", x, y, { button: "left", buttons: 1 });
    await Bun.sleep(8);
  }
  if (mobile) await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  else await mouse("mouseReleased", x1, y1, { button: "left", clickCount: 1 });
}
async function iconAt(slug: string) {
  for (let i = 0; i < 12; i++) {
    const at = await page.eval(`(() => { const i = document.querySelector('img[src*="app-icons/${slug}.png"]'); if (!i) return null; const b = i.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2; const h = document.elementFromPoint(x, y); return h && (h === i || h.contains(i) || i.contains(h) || h.parentElement?.contains(i)) && x > ${screen.x} && x < ${screen.x + screen.w} ? [x, y] : null; })()`);
    if (at) return at as [number, number];
    const dir = await page.eval(`(() => { const b = document.querySelector('img[src*="app-icons/${slug}.png"]')?.getBoundingClientRect(); return !b || b.x > ${screen.x} ? 'ArrowRight' : 'ArrowLeft'; })()`);
    for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key: dir, code: dir, windowsVirtualKeyCode: dir === "ArrowRight" ? 39 : 37 });
    await Bun.sleep(800);
  }
  throw new Error(`icon ${slug} not reachable`);
}

async function traced(run: () => Promise<void>) {
  await page.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: { recordMode: "recordAsMuchAsPossible", includedCategories: ["viz", "blink.user_timing"] } });
  await Bun.sleep(200);
  await page.eval(`(() => { __perf.frames = []; __perf.gpu.submits = 0; __perf.recording = true; __perf.frozen = 0; new MutationObserver((l) => { for (const r of l) if (r.attributeName === 'data-web-frozen' && r.target.hasAttribute('data-web-frozen')) __perf.frozen++; }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-web-frozen'] }); performance.mark('fl-start'); })()`);
  await run();
  const P = await page.eval(`(() => { __perf.recording = false; performance.mark('fl-end'); return { frames: __perf.frames, submits: __perf.gpu.submits, path: location.pathname, frozen: __perf.frozen ?? 0 }; })()`);
  await Bun.sleep(150);
  const done = cdp.waitFor((e) => e.method === "Tracing.tracingComplete" && e.sessionId === page.sessionId, 60000);
  await page.send("Tracing.end");
  const { stream } = (await done).params;
  const chunks: string[] = [];
  for (;;) { const r = await page.send("IO.read", { handle: stream, size: 1 << 23 }); chunks.push(r.base64Encoded ? Buffer.from(r.data, "base64").toString() : r.data); if (r.eof) break; }
  await page.send("IO.close", { handle: stream });
  const parsed = JSON.parse(chunks.join("")), events: any[] = parsed.traceEvents ?? parsed;
  const t0 = events.find((e) => e.name === "fl-start")?.ts, t1 = events.find((e) => e.name === "fl-end")?.ts;
  const swaps = events.filter((e) => e.name === "Display::DrawAndSwap" && e.ts >= t0 && e.ts <= t1).map((e) => e.ts).sort((a, b) => a - b);
  const gaps: number[] = []; for (let i = 1; i < swaps.length; i++) gaps.push((swaps[i] - swaps[i - 1]) / 1000);
  const f: number[] = []; for (let i = 1; i < P.frames.length; i++) f.push(P.frames[i] - P.frames[i - 1]);
  const r = (x: number) => Math.round(x * 10) / 10;
  return { presented: swaps.length, gapP95: r(quantile(gaps, 0.95)), gapMax: r(Math.max(0, ...gaps)), gaps50: gaps.filter((g) => g > 50).length, at: swaps.slice(1).map((t, i) => [Math.round((swaps[i] - t0) / 1000), Math.round(gaps[i])]).filter(([, g]) => g > 50).map(([a, g]) => `${a}+${g}`).join(" "), frozen: P.frozen, rafMax: r(Math.max(0, ...f)), submits: P.submits, path: P.path };
}

const home = async () => { if ((await page.eval(`location.pathname`)) !== "/") { await page.eval(`history.back()`); await Bun.sleep(1800); } };
const rows: any[] = [];
for (const slug of demos) for (let k = 0; k < runs; k++) for (const how of closeBy === "both" ? ["swipe", "back"] : [closeBy]) {
  await home();
  if (set) await page.eval(set);
  const at = await iconAt(slug);
  const open = await traced(async () => { await tap(...at); await Bun.sleep(1500); });
  await Bun.sleep(1200);
  if (set) await page.eval(set);
  const close = await traced(async () => {
    if (how === "swipe") await drag(...S(0.5, 0.12), ...S(0.5, 0.6), 300); else await page.eval(`history.back()`);
    await Bun.sleep(1500);
  });
  const row = { slug, run: k, how, open, close };
  rows.push(row);
  console.log(JSON.stringify(row));
}
kill();
process.exit(0);
