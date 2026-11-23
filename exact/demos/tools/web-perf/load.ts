// Cold-load measurement of the web build (tools/web-perf.md, LOAD).
//   bun tools/web-perf/load.ts <url> <label> [--net cable|4g|fast3g] [--cpu 4] [--mobile] [--runs n] [--out file.json]
// Each run: a fresh browser context (empty cache), network + CPU emulation, the probe (probe.js), navigation to <url>,
// then until the launcher's first page is drawn, the GPU module is instantiated and 3 s pass without a long task
// (or --timeout seconds). Prints one JSON line per run and appends it to --out.
import { appendFileSync, readFileSync } from "node:fs";
import { launch, newPage, NETWORK } from "./cdp.ts";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = args[0], label = args[1];
const net = (flag("net", "cable") as keyof typeof NETWORK), cpu = Number(flag("cpu", "1")), mobile = args.includes("--mobile");
const runs = Number(flag("runs", "1")), out = flag("out"), timeout = Number(flag("timeout", "600")) * 1000;
const probe = readFileSync(new URL("./probe.js", import.meta.url), "utf8");

const kind = (u: string, type: string, mime: string) => {
  if (/\.wasm(\?|$)/.test(u)) return "wasm";
  if (/\.wgsl(\?|$)/.test(u)) return "shader";
  if (/\.(otf|ttf|woff2?)(\?|$)/.test(u)) return "font";
  if (/\.(m4a|mp3|wav|aac)(\?|$)/.test(u)) return "audio";
  if (/art-pack\.bin/.test(u)) return "art-pack";
  if (/\.(png|jpe?g|webp|gif|svg)(\?|$)/.test(u) || type === "Image") return "image";
  if (/\.m?js(\?|$)/.test(u) || type === "Script") return "js";
  if (/\.css(\?|$)/.test(u)) return "css";
  if (type === "Document") return "html";
  return "other";
};

const { cdp, kill } = await launch({ port: 9340 + Math.floor(Math.random() * 50) });
for (let run = 0; run < runs; run++) {
  const page = await newPage(cdp, mobile ? { width: 390, height: 844, mobile: true, dpr: 3 } : { width: 1440, height: 900 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: probe });
  // The GPU module is ready (wasm instantiated and every shader registered) when the glue sets data-gpu-ms.
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `new MutationObserver((l, o) => { for (const m of l) if (m.attributeName === 'data-gpu-ms') { (window.__perf ??= {}).gpuShadersReady = performance.now(); o.disconnect(); } }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-gpu-ms'] });` });
  await page.send("Network.emulateNetworkConditions", NETWORK[net]);
  if (cpu > 1) await page.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const req = new Map<string, any>();
  let navStart = 0;
  page.on((e) => {
    const p = e.params;
    if (e.method === "Network.requestWillBeSent") req.set(p.requestId, { url: p.request.url, start: p.timestamp, type: p.type });
    else if (e.method === "Network.responseReceived") { const r = req.get(p.requestId); if (r) { r.mime = p.response.mimeType; r.status = p.response.status; r.type = p.type; r.enc = p.response.headers["content-encoding"] ?? p.response.headers["Content-Encoding"]; } }
    else if (e.method === "Network.loadingFinished") { const r = req.get(p.requestId); if (r) { r.bytes = p.encodedDataLength; r.end = p.timestamp; } }
    else if (e.method === "Network.dataReceived") { const r = req.get(p.requestId); if (r) r.decoded = (r.decoded ?? 0) + p.dataLength; }
    else if (e.method === "Network.loadingFailed") { const r = req.get(p.requestId); if (r) { r.failed = p.errorText; r.end = p.timestamp; } }
  });
  await page.send("Tracing.start", { categories: "devtools.timeline,v8,v8.wasm,disabled-by-default-v8.compile,blink.user_timing,loading", transferMode: "ReturnAsStream" });
  const t0 = Date.now();
  await page.send("Page.navigate", { url });
  // Wait: launcher drawn + GPU module instantiated + 3 s without a long task.
  let state: any = {};
  for (;;) {
    await Bun.sleep(500);
    state = await page.eval(`(() => { const P = window.__perf; if (!P) return {}; const lt = P.longtasks; const last = lt.length ? lt[lt.length-1][0] + lt[lt.length-1][1] : 0;
      const g = P.wasm.find(w => /gpu_bg/.test(w.url ?? '')); return { now: performance.now(), last, icons: P.marks.launcherIcons, gpu: g?.end, ready: P.gpuShadersReady }; })()`).catch(() => ({}));
    if (state.icons && state.gpu && state.ready && state.now - Math.max(state.last, state.gpu, state.ready) > 3000) break;
    if (Date.now() - t0 > timeout) { state.timedOut = true; break; }
  }
  const perf = await page.eval(`(() => { const P = window.__perf; return { gpuShadersReady: P.gpuShadersReady, marks: P.marks, paints: P.paints, longtasks: P.longtasks, wasm: P.wasm.map(w => ({ name: w.name, url: w.url, start: w.start, end: w.end, error: w.error, memory: w.memory?.buffer?.byteLength ?? 0 })), gpu: P.gpu, nav: performance.getEntriesByType('navigation')[0]?.toJSON?.(), dom: document.getElementsByTagName('*').length }; })()`);
  const heap = await page.send("Runtime.getHeapUsage");
  // The trace: wasm compile spans and main-thread time by top-level event.
  const done = page.cdp.waitFor((e) => e.method === "Tracing.tracingComplete" && e.sessionId === page.sessionId, 120000);
  await page.send("Tracing.end");
  const { stream } = (await done).params;
  let text = "";
  for (;;) { const r = await page.send("IO.read", { handle: stream, size: 1 << 22 }); text += r.base64Encoded ? Buffer.from(r.data, "base64").toString() : r.data; if (r.eof) break; }
  await page.send("IO.close", { handle: stream });
  const trace = JSON.parse(text);
  const events: any[] = trace.traceEvents ?? trace;
  const navTs = events.find((e) => e.name === "navigationStart" && e.args?.data?.isLoadingMainFrame)?.ts ?? events.find((e) => e.name === "TracingStartedInBrowser")?.ts;
  const wasmEvents: Record<string, { n: number; ms: number; first: number; last: number }> = {};
  for (const e of events) {
    if (!/wasm/i.test(e.name) || e.ph !== "X") continue;
    const w = (wasmEvents[e.name] ??= { n: 0, ms: 0, first: Infinity, last: 0 });
    w.n++; w.ms += (e.dur ?? 0) / 1000; w.first = Math.min(w.first, (e.ts - navTs) / 1000); w.last = Math.max(w.last, (e.ts + (e.dur ?? 0) - navTs) / 1000);
  }
  for (const w of Object.values(wasmEvents)) { w.ms = +w.ms.toFixed(1); w.first = +w.first.toFixed(0); w.last = +w.last.toFixed(0); }
  // Main thread of the page's renderer: the thread that ran the most RunTask time.
  const byThread = new Map<string, number>();
  for (const e of events) if (e.ph === "X" && e.name === "RunTask") byThread.set(`${e.pid}:${e.tid}`, (byThread.get(`${e.pid}:${e.tid}`) ?? 0) + e.dur);
  const main = [...byThread.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const top: Record<string, number> = {};
  for (const e of events) {
    if (e.ph !== "X" || `${e.pid}:${e.tid}` !== main) continue;
    if (["FunctionCall", "EvaluateScript", "v8.compile", "v8.compileModule", "ParseHTML", "UpdateLayoutTree", "Layout", "Paint", "PrePaint", "Layerize", "MinorGC", "MajorGC", "V8.GC_SCAVENGER", "ResourceReceivedData", "Decode Image", "ImageDecodeTask", "v8.produceModuleCache", "CompileScript", "TimerFire", "FireAnimationFrame", "ParseAuthorStyleSheet", "HitTest", "v8.wasm.compiledModule", "wasm.CompileLazy"].includes(e.name))
      top[e.name] = (top[e.name] ?? 0) + e.dur / 1000;
  }
  for (const k of Object.keys(top)) top[k] = +top[k].toFixed(0);
  const t = (ts?: number) => (ts && navTs ? +((ts * 1e6 - navTs) / 1000).toFixed(0) : null);
  const resources = [...req.values()].filter((r) => r.url.startsWith("http"));
  const byKind: Record<string, { n: number; bytes: number; decoded: number; lastEnd: number }> = {};
  for (const r of resources) {
    const k = kind(r.url, r.type, r.mime ?? "");
    const b = (byKind[k] ??= { n: 0, bytes: 0, decoded: 0, lastEnd: 0 });
    b.n++; b.bytes += r.bytes ?? 0; b.decoded += r.decoded ?? 0; b.lastEnd = Math.max(b.lastEnd, t(r.end) ?? 0);
  }
  const big = resources.filter((r) => (r.bytes ?? 0) > 200e3).map((r) => ({ url: r.url.replace(/^.*\/(?=[^/]+$)/, ""), bytes: r.bytes, enc: r.enc, start: t(r.start), end: t(r.end) }));
  const lt = perf.longtasks as [number, number][];
  const gpuWasm = perf.wasm.find((w: any) => /gpu_bg/.test(w.url ?? ""));
  const quietAfter = (from: number) => { // TTI: end of the last long task before a 3 s quiet window, at or after `from`
    let tti = from;
    for (const [s, d] of lt) { if (s + d < tti) continue; if (s - tti >= 3000) break; tti = Math.max(tti, s + d); }
    return +tti.toFixed(0);
  };
  const result = {
    label, net, cpu, mobile, run, url, timedOut: !!state.timedOut,
    fcp: perf.paints.find((p: any) => p[0] === "first-contentful-paint")?.[1] | 0,
    launcherDom: perf.marks.launcherDom | 0, launcherIcons: perf.marks.launcherIcons | 0,
    ttiLauncher: quietAfter(perf.marks.launcherIcons ?? 0),
    gpuFetchStart: big.find((b) => /gpu_bg/.test(b.url))?.start, gpuFetchEnd: big.find((b) => /gpu_bg/.test(b.url))?.end,
    gpuInstantiate: gpuWasm ? { start: +gpuWasm.start.toFixed(0), end: +gpuWasm.end.toFixed(0), ms: +(gpuWasm.end - gpuWasm.start).toFixed(0), how: gpuWasm.name, error: gpuWasm.error } : null,
    gpuShadersReady: perf.gpuShadersReady == null ? null : +perf.gpuShadersReady.toFixed(0),
    ttiGpu: gpuWasm ? quietAfter(Math.max(perf.marks.launcherIcons ?? 0, gpuWasm.end)) : null,
    longtasks: { n: lt.length, totalMs: +lt.reduce((a, [, d]) => a + d, 0).toFixed(0), maxMs: +Math.max(0, ...lt.map(([, d]) => d)).toFixed(0), list: lt.map(([s, d]) => [s | 0, d | 0]) },
    bytes: { total: resources.reduce((a, r) => a + (r.bytes ?? 0), 0), requests: resources.length, byKind },
    big, wasmTrace: wasmEvents, mainThreadMs: top,
    memory: { jsHeapUsed: heap.usedSize, jsHeapTotal: heap.totalSize, wasm: perf.wasm.map((w: any) => ({ url: (w.url ?? w.name).replace(/^.*\//, ""), bytes: w.memory })), gpu: perf.gpu, domNodes: perf.dom },
  };
  console.log(JSON.stringify(result));
  if (out) appendFileSync(out, JSON.stringify(result) + "\n");
  await page.close();
}
kill();
process.exit(0);
