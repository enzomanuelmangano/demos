// Interaction traces (tools/web-perf.md, "Open / close / scroll"): the launcher's pager, a demo's open and close
// flight, and scrolling in a demo, each traced with real-GPU Chrome (no vsync, no frame-rate limit) and broken down.
//   bun tools/web-perf/trace.ts <base url> [--mobile] [--cpu n] [--nobackdrop] [--out file.json] [--keep trace.json]
// Per scenario: rAF intervals (p50/p95/max), the renderer main thread's work by kind (script by file, style recalc,
// layout, pre-paint, paint, commit, hit tests, GC), layouts forced by script, the compositor thread's and the GPU
// process's busy time, presented frames, style/layout invalidation reasons with the script that caused them, and DOM
// mutation records per frame (each Contract commit writes the DOM).
import { readFileSync, writeFileSync } from "node:fs";
import { launch, newPage, quantile } from "./cdp.ts";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = args[0].replace(/\/$/, ""), mobile = args.includes("--mobile"), cpu = Number(flag("cpu", "1"));
const noBackdrop = args.includes("--nobackdrop"), out = flag("out"), keep = flag("keep");
const only = flag("only")?.split(",");
const probe = readFileSync(new URL("./probe.js", import.meta.url), "utf8");

const { cdp, kill } = await launch({ port: 9450 + Math.floor(Math.random() * 40) });
const page = await newPage(cdp, mobile ? { width: 390, height: 844, mobile: true, dpr: 3 } : { width: 1440, height: 900 });
await page.send("Page.addScriptToEvaluateOnNewDocument", { source: probe });
if (noBackdrop) await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '*, *::before, *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }'; document.head.appendChild(s); });` });
await page.send("Page.navigate", { url: `${base}/` });
for (let i = 0; i < 240; i++) {
  await Bun.sleep(500);
  if (await page.eval(`!!(window.__perf && __perf.marks.launcherIcons && __perf.wasm.some(w => /gpu_bg/.test(w.url ?? '') && w.end))`).catch(() => false)) break;
}
await Bun.sleep(3000);
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
// A trackpad's scroll: wheel events every 8 ms (a 120 Hz trackpad), deltas easing out like a fling.
async function wheel(x: number, y: number, dx: number, dy: number, ms: number) {
  const n = Math.round(ms / 8);
  for (let i = 0; i < n; i++) { const k = 2 * (1 - i / n); await mouse("mouseWheel", x, y, { deltaX: (dx / n) * k, deltaY: (dy / n) * k }); await Bun.sleep(8); }
}
async function iconAt(slug: string) {
  for (let i = 0; i < 12; i++) {
    const at = await page.eval(`(() => { const i = document.querySelector('img[src*="app-icons/${slug}.png"]'); if (!i) return null; const b = i.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2; const h = document.elementFromPoint(x, y); return h && (h === i || h.contains(i) || i.contains(h) || h.parentElement?.contains(i)) && x > ${screen.x} && x < ${screen.x + screen.w} ? [x, y] : null; })()`);
    if (at) return at as number[];
    const dir = await page.eval(`(() => { const b = document.querySelector('img[src*="app-icons/${slug}.png"]')?.getBoundingClientRect(); return !b || b.x > ${screen.x} ? 'ArrowRight' : 'ArrowLeft'; })()`);
    for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key: dir, code: dir, windowsVirtualKeyCode: dir === "ArrowRight" ? 39 : 37 });
    await Bun.sleep(800);
  }
  throw new Error(`icon ${slug} not reachable`);
}
const home = async () => { if ((await page.eval(`location.pathname`)) !== "/") { await page.eval(`history.back()`); await Bun.sleep(1600); } };

type Scenario = { name: string; run: () => Promise<void> };
const scenarios: Scenario[] = [
  { name: "pager: 4 mouse drags (left, left, right, right)", run: async () => {
    for (const [a, b] of [[0.8, 0.2], [0.8, 0.2], [0.2, 0.8], [0.2, 0.8]]) { await drag(...S(a, 0.45), ...S(b, 0.45), 260); await Bun.sleep(550); } } },
  { name: "pager: trackpad swipes (wheel deltaX)", run: async () => {
    for (const d of [600, -600]) { await wheel(...S(0.5, 0.45), d, 0, 300); await Bun.sleep(900); } } },
  { name: "open chessboard (tap its icon)", run: async () => { await tap(...(await iconAt("chessboard")) as [number, number]); await Bun.sleep(1500); } },
  { name: "close chessboard (swipe down)", run: async () => { await drag(...S(0.5, 0.12), ...S(0.5, 0.6), 300); await Bun.sleep(1500); } },
  { name: "open chessboard again (warm)", run: async () => { await tap(...(await iconAt("chessboard")) as [number, number]); await Bun.sleep(1500); } },
  { name: "close chessboard again (history.back)", run: async () => { await page.eval(`history.back()`); await Bun.sleep(1500); } },
  { name: "open sudoku (Contract + GPU)", run: async () => { await tap(...(await iconAt("sudoku")) as [number, number]); await Bun.sleep(1500); } },
  { name: "close sudoku (history.back)", run: async () => { await page.eval(`history.back()`); await Bun.sleep(1500); } },
  { name: "open stacked-list", run: async () => { await tap(...(await iconAt("stacked-list")) as [number, number]); await Bun.sleep(1500); } },
  { name: "scroll stacked-list (wheel down then up)", run: async () => { await wheel(...S(0.5, 0.6), 0, 1500, 900); await Bun.sleep(300); await wheel(...S(0.5, 0.6), 0, -1500, 900); await Bun.sleep(300); } },
  { name: "scroll stacked-list (mouse drag up)", run: async () => { await drag(...S(0.5, 0.8), ...S(0.5, 0.3), 500); await Bun.sleep(800); } },
  { name: "close stacked-list (history.back)", run: async () => { await page.eval(`history.back()`); await Bun.sleep(1500); } },
  { name: "open blurred-scroll", run: async () => { await tap(...(await iconAt("blurred-scroll")) as [number, number]); await Bun.sleep(1500); } },
  { name: "scroll blurred-scroll (wheel down then up)", run: async () => { await wheel(...S(0.5, 0.6), 0, 1500, 900); await Bun.sleep(300); await wheel(...S(0.5, 0.6), 0, -1500, 900); await Bun.sleep(300); } },
  { name: "close blurred-scroll (history.back)", run: async () => { await page.eval(`history.back()`); await Bun.sleep(1500); } },
];

// --light: without invalidation tracking and JS stacks (they are heavy enough to slow a scroll's busy frames).
const CATS = ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame",
  ...(args.includes("--light") ? [] : ["disabled-by-default-devtools.timeline.stack", "disabled-by-default-devtools.timeline.invalidationTracking"]), "blink.user_timing", "gpu", "disabled-by-default-gpu.service", "viz", "cc", "v8", "v8.wasm"].join(",");

const results: any[] = [];
for (const sc of scenarios) {
  if (only && !only.some((o) => sc.name.includes(o))) continue;
  if (sc.name.startsWith("open") || sc.name.startsWith("pager")) await home();
  await page.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: { recordMode: "recordAsMuchAsPossible", includedCategories: CATS.split(",") } });
  await Bun.sleep(300);
  await page.eval(`(() => { const P = __perf; P.frames = []; P.loaf = []; P.mutations = 0; P.styleMutations = 0; P.recording = true; performance.mark('sc-start'); })()`);
  const t0 = await page.eval<number>(`performance.now()`);
  let error: string | undefined;
  try { await sc.run(); } catch (e) { error = String((e as Error).message); }
  const t1 = await page.eval<number>(`performance.now()`);
  const P = await page.eval(`(() => { const P = __perf; P.recording = false; performance.mark('sc-end'); return { frames: P.frames, loaf: P.loaf, mutations: P.mutations, styleMutations: P.styleMutations, path: location.pathname }; })()`);
  await Bun.sleep(200);
  const done = cdp.waitFor((e) => e.method === "Tracing.tracingComplete" && e.sessionId === page.sessionId, 120000);
  await page.send("Tracing.end");
  const { stream } = (await done).params;
  const chunks: string[] = [];
  for (;;) { const r = await page.send("IO.read", { handle: stream, size: 1 << 23 }); chunks.push(r.base64Encoded ? Buffer.from(r.data, "base64").toString() : r.data); if (r.eof) break; }
  await page.send("IO.close", { handle: stream });
  const text = chunks.join("");
  if (keep) writeFileSync(keep.replace(/\.json$/, `-${results.length}.json`), text);
  const events: any[] = (JSON.parse(text).traceEvents ?? JSON.parse(text));
  results.push({ name: sc.name, error, path: P.path, ...analyse(events, P, t1 - t0) });
  console.log(JSON.stringify(results[results.length - 1]));
}
if (out) writeFileSync(out, JSON.stringify(results, null, 1));
kill();
process.exit(0);

function analyse(events: any[], P: any, wallMs: number) {
  const start = events.find((e) => e.name === "sc-start")?.ts, end = events.find((e) => e.name === "sc-end")?.ts;
  const inWin = (e: any) => e.ts >= start && e.ts <= end;
  // Threads by name.
  const tname = new Map<string, string>(), pname = new Map<number, string>();
  for (const e of events) if (e.ph === "M" && e.name === "thread_name") tname.set(`${e.pid}:${e.tid}`, e.args.name); else if (e.ph === "M" && e.name === "process_name") pname.set(e.pid, e.args.name);
  const rendererPid = events.find((e) => e.name === "sc-start")?.pid;
  const thread = (n: string, proc?: (p: string) => boolean) => [...tname.entries()].filter(([k, v]) => v === n && (!proc || proc(pname.get(Number(k.split(":")[0])) ?? ""))).map(([k]) => k);
  const mainKey = `${rendererPid}:${events.find((e) => e.name === "sc-start")?.tid}`;
  const compKeys = thread("Compositor").filter((k) => k.startsWith(`${rendererPid}:`));
  const gpuKeys = [...thread("CrGpuMain"), ...thread("VizCompositorThread")];
  const busy = (keys: string[]) => {
    // Top-level busy time: union of X events' spans per thread.
    let total = 0;
    for (const k of keys) {
      const spans = events.filter((e) => e.ph === "X" && `${e.pid}:${e.tid}` === k && inWin(e) && e.dur).map((e) => [e.ts, e.ts + e.dur]).sort((a, b) => a[0] - b[0]);
      let cur = -1;
      for (const [s, f] of spans) { if (f <= cur) continue; total += f - Math.max(s, cur); cur = f; }
    }
    return +(total / 1000).toFixed(1);
  };
  const main = events.filter((e) => `${e.pid}:${e.tid}` === mainKey && inWin(e) && (e.ph === "X" || e.ph === "B"));
  const by: Record<string, { n: number; ms: number }> = {};
  const add = (k: string, d: number) => { const b = (by[k] ??= { n: 0, ms: 0 }); b.n++; b.ms += d / 1000; };
  const fnCalls = main.filter((e) => e.name === "FunctionCall" || e.name === "EvaluateScript" || e.name === "TimerFire" || e.name === "FireAnimationFrame" || e.name === "EventDispatch");
  let forced = 0, forcedMs = 0;
  for (const e of main) {
    if (e.ph !== "X") continue;
    if (e.name === "FunctionCall") add(`script ${(e.args?.data?.url ?? "").replace(/^.*\//, "") || "?"}${e.args?.data?.functionName ? ":" + e.args.data.functionName : ""}`, e.dur);
    else if (["UpdateLayoutTree", "Layout", "PrePaint", "Paint", "Layerize", "Commit", "HitTest", "MinorGC", "MajorGC", "ParseHTML", "UpdateLayer", "Animation", "ScrollLayer", "IntersectionObserverController::computeIntersections", "ResizeObserverController::broadcastObservations", "Decode Image"].includes(e.name)) add(e.name, e.dur);
    if (e.name === "Layout" || e.name === "UpdateLayoutTree") {
      const inScript = fnCalls.some((f) => f.ph === "X" && f.ts <= e.ts && f.ts + f.dur >= e.ts + e.dur);
      if (inScript) { forced++; forcedMs += e.dur / 1000; }
    }
  }
  for (const k in by) by[k].ms = +by[k].ms.toFixed(1);
  const top = Object.entries(by).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12);
  // Invalidations: reason -> count, and the script frame that caused them.
  const inv: Record<string, number> = {};
  for (const e of events) {
    if (!inWin(e) || !/InvalidationTracking/.test(e.name)) continue;
    const d = e.args?.data ?? {};
    const st = d.stackTrace?.[0];
    const k = `${e.name.replace("InvalidationTracking", "")}: ${d.reason ?? d.changedAttribute ?? d.changedPseudo ?? d.changedClass ?? d.changedId ?? d.invalidationList?.[0]?.classes?.join?.(".") ?? "?"}${st ? ` @ ${st.url.replace(/^.*\//, "")}:${st.functionName || "?"}` : ""}`;
    inv[k] = (inv[k] ?? 0) + 1;
  }
  const layoutObjects = main.filter((e) => e.name === "Layout" && e.ph === "X").map((e) => e.args?.beginData?.dirtyObjects ?? 0);
  const styleElems = events.filter((e) => inWin(e) && e.name === "UpdateLayoutTree" && e.ph === "X").map((e) => e.args?.elementCount ?? 0);
  // Presented frames (viz) and their intervals.
  const swaps = events.filter((e) => inWin(e) && (e.name === "Display::DrawAndSwap" || e.name === "DisplayScheduler::DrawAndSwap")).map((e) => e.ts).sort((a, b) => a - b);
  const sd: number[] = []; for (let i = 1; i < swaps.length; i++) sd.push((swaps[i] - swaps[i - 1]) / 1000);
  const dropped = events.filter((e) => inWin(e) && e.name === "DroppedFrame").length;
  const pipe = events.filter((e) => inWin(e) && e.name === "PipelineReporter" && e.ph === "b");
  const states: Record<string, number> = {};
  for (const e of pipe) { const s = e.args?.chrome_frame_reporter?.state ?? "?"; states[s] = (states[s] ?? 0) + 1; }
  const f: number[] = []; for (let i = 1; i < P.frames.length; i++) f.push(P.frames[i] - P.frames[i - 1]);
  const r = (x: number) => +x.toFixed(2);
  const gpuTop: Record<string, number> = {};
  for (const e of events) if (e.ph === "X" && inWin(e) && gpuKeys.includes(`${e.pid}:${e.tid}`) && e.dur > 0) gpuTop[e.name] = (gpuTop[e.name] ?? 0) + e.dur / 1000;
  return {
    wallMs: r(wallMs), traceMs: r((end - start) / 1000),
    raf: { frames: f.length, p50: r(quantile(f, 0.5)), p95: r(quantile(f, 0.95)), max: r(Math.max(0, ...f)), over16_7: f.filter((x) => x > 18.3).length, over8_3: f.filter((x) => x > 9.2).length },
    presented: { frames: swaps.length, p50: r(quantile(sd, 0.5)), p95: r(quantile(sd, 0.95)), max: r(Math.max(0, ...sd)), droppedFrameEvents: dropped, pipelineStates: states },
    busyMs: { main: busy([mainKey]), compositor: busy(compKeys), gpuProcess: busy(gpuKeys) },
    mainByKind: Object.fromEntries(top), forcedLayouts: { n: forced, ms: r(forcedMs) },
    layouts: { n: layoutObjects.length, maxDirtyObjects: Math.max(0, ...layoutObjects) }, styleRecalcs: { n: styleElems.length, maxElements: Math.max(0, ...styleElems), totalElements: styleElems.reduce((a, b) => a + b, 0) },
    domMutations: { records: P.mutations, styleAttr: P.styleMutations, perRafFrame: r(P.mutations / Math.max(1, f.length)) },
    invalidations: Object.entries(inv).sort((a, b) => b[1] - a[1]).slice(0, 8),
    gpuProcessTop: Object.entries(gpuTop).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, r(v)]),
    longFrames: P.loaf.map((l: any) => ({ dur: r(l.dur), render: r(l.render), style: r(l.style), scripts: l.scripts.slice(0, 3).map((s: any) => `${s.inv} ${s.src}${s.fn ? ":" + s.fn : ""} ${r(s.dur)}${s.forced ? ` (forced layout ${r(s.forced)})` : ""}`) })),
  };
}
