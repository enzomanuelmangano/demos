// Per-demo runtime measurement of the web build (tools/web-perf.md, RUNTIME).
//   bun tools/web-perf/runtime.ts <base url> <label> [--mobile] [--cpu 4] [--only a,b] [--from slug] [--out file.jsonl]
// One page (warm cache after the first load), the launcher's order (demos.contract, ported only). Per demo:
//   open   tap its icon on the launcher (paging with the arrow keys), 1.2 s of frames: the open flight
//   run    3 s scripted interaction: a horizontal drag through the centre, a scroll-like drag up, three taps
//   close  history.back(), 1.2 s of frames: the close flight
// rAF is uncapped (no vsync, no frame-rate limit), so a frame interval is what the frame cost the page.
// Per segment: frame intervals p50/p95/max, frames over the 60 / 120 Hz budgets and the vsyncs they would miss,
// long tasks and long animation frames (script attribution), DOM mutation records, GPU pass time per submit
// (timestamp queries), GPU resources created; per demo: JS heap after GC before and after, wasm memory.
import { appendFileSync, readFileSync } from "node:fs";
import { launch, newPage, quantile, type Page } from "./cdp.ts";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = args[0].replace(/\/$/, ""), label = args[1];
const mobile = args.includes("--mobile"), cpu = Number(flag("cpu", "1")), out = flag("out");
const only = flag("only")?.split(","), from = flag("from"), deep = args.includes("--deep");
const probe = readFileSync(new URL("./probe.js", import.meta.url), "utf8");
const contract = readFileSync(new URL("../../demos.contract", import.meta.url), "utf8");
let slugs = [...contract.matchAll(/slug="([^"]+)"[^\n]*ported=true/g)].map((m) => m[1]);
if (only) slugs = slugs.filter((s) => only.includes(s));
if (from) slugs = slugs.slice(Math.max(0, slugs.indexOf(from)));

const { cdp, kill, stderr } = await launch({ port: 9300 + Math.floor(Math.random() * 40) });
let page: Page = await newPage(cdp, mobile ? { width: 390, height: 844, mobile: true, dpr: 3 } : { width: 1440, height: 900 });
await page.send("Page.addScriptToEvaluateOnNewDocument", { source: probe });
await page.send("HeapProfiler.enable");
const errors: string[] = [];
page.on((e) => {
  if (e.method === "Runtime.exceptionThrown") errors.push(String(e.params.exceptionDetails?.exception?.description ?? e.params.exceptionDetails?.text).slice(0, 200));
});

async function home() {
  await page.send("Page.navigate", { url: `${base}/` });
  for (let i = 0; i < 240; i++) {
    await Bun.sleep(500);
    const s = await page.eval(`(() => { const P = window.__perf; return !!(P && P.marks.launcherIcons && P.wasm.some(w => /gpu_bg/.test(w.url ?? '') && w.end)); })()`).catch(() => false);
    if (s) break;
  }
  await Bun.sleep(2000);
  if (cpu > 1) await page.send("Emulation.setCPUThrottlingRate", { rate: cpu });
}
await home();
const screen = await page.eval<{ x: number; y: number; w: number; h: number }>(`(() => { const r = document.querySelector('img[src*="home-wallpaper"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);

async function tap(x: number, y: number) {
  if (mobile) {
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await Bun.sleep(40);
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await Bun.sleep(40);
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
}
async function drag(x0: number, y0: number, x1: number, y1: number, ms: number) {
  const steps = Math.max(2, Math.round(ms / 16));
  if (mobile) await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
  else { await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0, y: y0 }); await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y: y0, button: "left", clickCount: 1 }); }
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (mobile) await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    else await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    await Bun.sleep(16);
  }
  if (mobile) await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  else await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x1, y: y1, button: "left", clickCount: 1 });
}
const S = (fx: number, fy: number) => [screen.x + screen.w * fx, screen.y + screen.h * fy] as const;

function stats(frames: number[], t0: number, t1: number) {
  const f = frames.filter((t) => t >= t0 && t <= t1), d: number[] = [];
  for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]);
  // A frame is late at a budget when it took more than 1.1 budgets (a 16.9 ms frame on a 60 Hz-paced segment is not a drop).
  const over = (b: number) => d.filter((x) => x > b * 1.1).length, missed = (b: number) => d.reduce((a, x) => a + Math.max(0, Math.ceil(x / (b * 1.1)) - 1), 0);
  const r = (x: number) => +x.toFixed(2);
  return { frames: d.length, p50: r(quantile(d, 0.5)), p95: r(quantile(d, 0.95)), p99: r(quantile(d, 0.99)), max: r(Math.max(0, ...d)),
    over60: over(1000 / 60), over120: over(1000 / 120), missed60: missed(1000 / 60), missed120: missed(1000 / 120), fps: r(d.length / ((t1 - t0) / 1000)),
    // Chrome paces rAF at 60 Hz while a compositor animation runs, even uncapped: then p50 sits at ~16.7 ms.
    paced60: quantile(d, 0.5) > 15.5 && quantile(d, 0.5) < 18 };
}
const heapAfterGc = async () => { await page.send("HeapProfiler.collectGarbage"); return (await page.send("Runtime.getHeapUsage")).usedSize as number; };

for (const slug of slugs) {
  const result: any = { label, mobile, cpu, slug };
  try {
    if ((await page.eval(`location.pathname`)) !== "/") { await page.eval(`history.back()`); await Bun.sleep(1500); }
    if ((await page.eval(`location.pathname`)) !== "/") { await home(); }
    // Page the launcher until the icon is hittable.
    let at: number[] | null = null;
    for (let i = 0; i < 12 && !at; i++) {
      at = await page.eval(`(() => { const i = document.querySelector('img[src*="app-icons/${slug}.png"]'); if (!i) return null; const b = i.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
        const hit = document.elementFromPoint(x, y); return hit && (hit === i || hit.contains(i) || i.contains(hit) || hit.closest('*') && hit.parentElement?.contains(i)) && x > ${screen.x} && x < ${screen.x + screen.w} ? [x, y] : null; })()`);
      if (!at) {
        const dir = await page.eval(`(() => { const i = document.querySelector('img[src*="app-icons/${slug}.png"]'); const b = i?.getBoundingClientRect(); return !b ? 'ArrowRight' : b.x + b.width / 2 < ${screen.x} ? 'ArrowLeft' : 'ArrowRight'; })()`);
        for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key: dir, code: dir, windowsVirtualKeyCode: dir === "ArrowRight" ? 39 : 37 });
        await Bun.sleep(700);
      }
    }
    if (!at) throw new Error("icon not reachable");
    const heap0 = await heapAfterGc();
    await page.eval(`(() => { const P = __perf; P.frames = []; P.gpuPass = []; P.loaf = []; P.longtasks = []; P.mutations = 0; P.styleMutations = 0; for (const k in P.gpu) P.gpu[k] = 0; P.recording = true; })()`);
    if (deep) {
      await page.eval(`(() => { __perf.stacks = {}; __perf.stackOn = true; __perf.canvasSizes = new Set(); const f = () => { if (!__perf.stackOn) return; for (const c of document.querySelectorAll('canvas')) __perf.canvasSizes.add(c.width + 'x' + c.height); requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
      await page.send("Profiler.enable"); await page.send("Profiler.setSamplingInterval", { interval: 250 }); await page.send("Profiler.start");
    }
    const tOpen = await page.eval<number>(`performance.now()`);
    await tap(at[0], at[1]);
    await Bun.sleep(1200);
    const g0 = await page.eval(`({ ...__perf.gpu, mutations: __perf.mutations, styleMutations: __perf.styleMutations })`);
    const tRun = await page.eval<number>(`performance.now()`);
    result.path = await page.eval(`location.pathname`);
    // 3 s: a horizontal drag through the centre, a drag up (scroll), three taps.
    await drag(...S(0.2, 0.55), ...S(0.8, 0.55), 450);
    await drag(...S(0.8, 0.5), ...S(0.25, 0.5), 450);
    await drag(...S(0.5, 0.8), ...S(0.5, 0.35), 700);
    await Bun.sleep(300);
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.7], [0.7, 0.4]]) { await tap(...S(fx, fy)); await Bun.sleep(300); }
    const tRunEnd = tRun + 3000;
    { const now = await page.eval<number>(`performance.now()`); if (now < tRunEnd) await Bun.sleep(tRunEnd - now); }
    const g1 = await page.eval(`({ ...__perf.gpu, mutations: __perf.mutations, styleMutations: __perf.styleMutations })`);
    const wasmMem = await page.eval(`__perf.wasmMemory()`);
    if (deep) {
      const { profile } = await page.send("Profiler.stop");
      const self = new Map<string, number>(), byId = new Map<number, any>();
      for (const n of profile.nodes) byId.set(n.id, n);
      const dt = new Map<number, number>();
      profile.samples.forEach((id: number, i: number) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
      let total = 0;
      for (const [id, us] of dt) { const n = byId.get(id); const name = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.replace(/^.*\//, "")}`.replace(/::h[0-9a-f]{16}/, ""); self.set(name, (self.get(name) ?? 0) + us); total += us; }
      result.profile = { totalMs: +(total / 1000).toFixed(0), top: [...self.entries()].filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k.slice(0, 160), +(v / 1000).toFixed(1)]) };
      result.stacks = await page.eval(`(() => { __perf.stackOn = false; return Object.entries(__perf.stacks).sort((a, b) => b[1] - a[1]).slice(0, 20); })()`);
      result.canvasSizes = await page.eval(`[...__perf.canvasSizes].length`);
    }
    const tClose = await page.eval<number>(`performance.now()`);
    await page.eval(`history.back()`);
    await Bun.sleep(1200);
    const tEnd = await page.eval<number>(`performance.now()`);
    const P = await page.eval(`(() => { const P = __perf; P.recording = false; return { frames: P.frames, gpuPass: P.gpuPass, loaf: P.loaf, longtasks: P.longtasks, gpu: { ...P.gpu, mutations: P.mutations, styleMutations: P.styleMutations } }; })()`);
    const heap1 = await heapAfterGc();
    const seg = (a: number, b: number) => {
      const gp = (P.gpuPass as [number, number, number][]).filter(([t]) => t >= a && t <= b).map(([, ms]) => ms);
      const lt = (P.longtasks as [number, number][]).filter(([t]) => t >= a && t <= b);
      return { ...stats(P.frames, a, b), gpuMs: gp.length ? { submits: gp.length, p50: +quantile(gp, 0.5).toFixed(3), p95: +quantile(gp, 0.95).toFixed(3), max: +Math.max(...gp).toFixed(3) } : null,
        longtasks: lt.length, longtaskMs: +lt.reduce((x, [, d]) => x + d, 0).toFixed(0), longtaskMax: +Math.max(0, ...lt.map(([, d]) => d)).toFixed(0) };
    };
    const diff = (x: any, y: any) => Object.fromEntries(Object.keys(y).map((k) => [k, +(y[k] - (x?.[k] ?? 0)).toFixed(1)]));
    result.open = { ...seg(tOpen, tRun), res: diff({}, g0) };
    result.run = { ...seg(tRun, tRunEnd), res: diff(g0, g1) };
    result.close = { ...seg(tClose, tEnd), res: diff(g1, P.gpu) };
    // Long animation frames: the top scripts by time.
    const scripts = new Map<string, number>();
    let render = 0, style = 0;
    for (const l of P.loaf) { render += l.render; style += l.style; for (const s of l.scripts) { const k = `${s.inv} ${s.src}${s.fn ? ":" + s.fn : ""}`; scripts.set(k, (scripts.get(k) ?? 0) + s.dur); } }
    result.loaf = { n: P.loaf.length, ms: +P.loaf.reduce((a: number, l: any) => a + l.dur, 0).toFixed(0), renderMs: +render.toFixed(0), styleLayoutMs: +style.toFixed(0),
      top: [...scripts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => [k.slice(0, 120), +v.toFixed(0)]) };
    result.heap = { before: heap0, after: heap1, growth: heap1 - heap0 };
    result.wasmMemory = wasmMem;
    result.errors = errors.splice(0);
  } catch (e) {
    result.error = String((e as Error).message ?? e);
    result.errors = errors.splice(0);
  }
  console.log(JSON.stringify({ slug, open: result.open && [result.open.p50, result.open.p95, result.open.max, result.open.over60], run: result.run && [result.run.p50, result.run.p95, result.run.max, result.run.over60, result.run.gpuMs?.p95], error: result.error }));
  if (out) appendFileSync(out, JSON.stringify(result) + "\n");
}
kill();
process.exit(0);
