// Summaries of the runs as markdown tables (tools/web-perf.md):
//   bun tools/web-perf/report.ts load <load.jsonl>
//   bun tools/web-perf/report.ts runtime <runtime.jsonl> [--top n]
import { readFileSync } from "node:fs";

const [kind, file] = process.argv.slice(2);
const topN = Number(process.argv[process.argv.indexOf("--top") + 1] || 15);
const rows = readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const mb = (b: number) => (b / 1e6).toFixed(2);
const s = (ms: number | null | undefined) => (ms == null ? "-" : (ms / 1000).toFixed(2));

if (kind === "load") {
  console.log("| build | network | CPU | screen | bytes (MB, wire) | requests | FCP s | launcher drawn s | launcher TTI s | GPU wasm fetch start-end s | wasm compile+inst. ms | GPU ready (TTI) s | long tasks (n / total / max ms) | JS heap MB | wasm memory MB |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const g = r.gpuInstantiate, gpuWasm = r.big?.find((b: any) => /gpu_bg/.test(b.url));
    const compile = r.wasmTrace?.["wasm.FinishStreaming"]?.ms ?? null;
    console.log(`| ${r.label} | ${r.net} | ${r.cpu}x | ${r.mobile ? "390x844@3" : "1440x900"} | ${mb(r.bytes.total)} | ${r.bytes.requests} | ${s(r.fcp)} | ${s(r.launcherIcons)} | ${s(r.ttiLauncher)} | ${gpuWasm ? `${s(gpuWasm.start)}-${s(gpuWasm.end)}` : g ? `${s(g.start)}-?` : "-"} | ${g?.error ? "failed: " + g.error.slice(0, 40) : g ? `${g.ms} (stream)${compile != null ? `, finish ${compile.toFixed(0)}` : ""}` : "-"} | ${g?.error ? "never" : s(r.ttiGpu)} | ${r.longtasks.n} / ${r.longtasks.totalMs} / ${r.longtasks.maxMs} | ${mb(r.memory.jsHeapUsed)} | ${mb(r.memory.wasm.reduce((a: number, w: any) => a + (w.bytes ?? 0), 0))} |`);
  }
  const r0 = rows[0];
  console.log("\nBytes by kind (first row):");
  for (const [k, v] of Object.entries<any>(r0.bytes.byKind).sort((a, b) => b[1].bytes - a[1].bytes)) console.log(`- ${k}: ${v.n} requests, ${mb(v.bytes)} MB on the wire, ${mb(v.decoded)} MB decoded, last done at ${s(v.lastEnd)} s`);
} else {
  const ok = rows.filter((r) => r.run);
  const fail = rows.filter((r) => !r.run);
  const line = (r: any) => {
    const g = r.run.gpuMs, o = r.open, c = r.close;
    return `| ${r.slug} | ${r.run.p50} / ${r.run.p95} / ${r.run.max}${r.run.paced60 ? " (60)" : ""} | ${r.run.over60} / ${r.run.over120} | ${r.run.longtasks} (${r.run.longtaskMax}) | ${g ? `${g.p50} / ${g.p95} / ${g.max}` : "-"} | ${o.p95} / ${o.max} (${o.missed60}) | ${c.p95} / ${c.max} (${c.missed60}) | ${r.run.res.mutations} | ${mb(r.run.res.writeBufferBytes)} | ${o.res.textures + r.run.res.textures} / ${o.res.pipelines + r.run.res.pipelines} | ${(r.heap.growth / 1e6).toFixed(2)} | ${r.loaf.top.map((t: any) => `${t[0].replace(/^(\S+) /, "")}: ${t[1]}`).slice(0, 2).join("; ")} |`;
  };
  const head = "| demo | run frame ms p50 / p95 / max | run frames > 60 / 120 Hz budget | run long tasks (max ms) | run GPU ms/submit p50 / p95 / max | open p95 / max (missed 60 Hz) | close p95 / max (missed) | run DOM mutations | run writeBuffer MB | textures / pipelines created (open+run) | heap growth MB | top long-frame scripts (ms) |\n|---|---|---|---|---|---|---|---|---|---|---|---|";
  const score = (r: any) => r.run.p95 * 4 + r.run.max + r.open.max / 4 + r.run.longtaskMax * 2 + (r.run.gpuMs?.p95 ?? 0) * 10;
  console.log(`${ok.length} demos measured, ${fail.length} failed${fail.length ? ": " + fail.map((r) => `${r.slug} (${r.error})`).join(", ") : ""}\n`);
  console.log(`Worst ${topN} by run cost (p95 x4 + max + open max / 4 + long task max x2 + GPU p95 x10):\n`);
  console.log(head);
  for (const r of [...ok].sort((a, b) => score(b) - score(a)).slice(0, topN)) console.log(line(r));
  const all = (f: (r: any) => number) => ok.map(f).sort((a, b) => a - b);
  const med = (xs: number[]) => xs[Math.floor(xs.length / 2)];
  console.log(`\nAcross all: run p95 median ${med(all((r) => r.run.p95))} ms; open max median ${med(all((r) => r.open.max))} ms, worst ${Math.max(...all((r) => r.open.max))} ms; close max median ${med(all((r) => r.close.max))} ms; demos with a run long task: ${ok.filter((r) => r.run.longtasks).length}; with a run frame > 50 ms: ${ok.filter((r) => r.run.max > 50).length}; open with a frame > 100 ms: ${ok.filter((r) => r.open.max > 100).length}; heap growth > 1 MB: ${ok.filter((r) => r.heap.growth > 1e6).length}`);
  const wasmMax = Math.max(...ok.map((r) => (r.wasmMemory ?? []).reduce((a: number, w: any) => a + w.bytes, 0)));
  console.log(`wasm memory at the end: ${mb(wasmMax)} MB; heap after the last demo ${mb(ok[ok.length - 1].heap.after)} MB (first ${mb(ok[0].heap.before)} MB)`);
  console.log(`\nAll demos (launcher order):\n\n${head}`);
  for (const r of ok) console.log(line(r));
}
