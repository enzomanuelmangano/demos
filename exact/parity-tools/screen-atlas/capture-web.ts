// Exact on the web: every demo at iPhone Air size (420×912, DPR 3) in headless Chrome, N pages at once.
//   bun capture-web.ts [--rebuild] [--jobs 6] [--settle 1500] [slug…]
// Serves the snapshot in out/web itself (port 5311), so it needs no other server. --rebuild runs
// `bun exact.mjs web-build` first and re-snapshots target/web-dist into out/web.
// Writes out/<slug>/exact-web.png and out/web.json ({ slug: { blank, why, errors } }).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { launch } from "./cdp";
import { DEMOS, OUT, WEB, demos } from "./lib";

const argv = process.argv.slice(2);
const opt = (k: string, d: number) => { const i = argv.indexOf(k); if (i < 0) return d; const v = +argv[i + 1]; argv.splice(i, 2); return v; };
const jobs = opt("--jobs", 6), settle = opt("--settle", +(process.env.SETTLE ?? 1500));
const rebuild = argv.includes("--rebuild");
const slugs = argv.filter((a) => !a.startsWith("--"));

if (rebuild || !existsSync(join(WEB, "index.html"))) {
  if (rebuild) {
    const r = Bun.spawnSync(["bun", "exact.mjs", "web-build"], { cwd: DEMOS, stdout: "inherit", stderr: "inherit" });
    if (r.exitCode) throw new Error("web-build failed");
  }
  rmSync(WEB, { recursive: true, force: true });
  cpSync(join(DEMOS, "target/web-dist"), WEB, { recursive: true });
}
const server = Bun.serve({
  port: 5311,
  fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname).replace(/\.\.+/g, "");
    const f = Bun.file(join(WEB, p));
    return p !== "/" && existsSync(join(WEB, p)) && !p.endsWith("/") ? new Response(f) : new Response(Bun.file(join(WEB, "index.html")), { headers: { "content-type": "text/html" } });
  },
});

const list = demos().filter((d) => !slugs.length || slugs.includes(d.slug));
const notesFile = join(OUT, "web.json");
const notes: Record<string, any> = existsSync(notesFile) ? JSON.parse(readFileSync(notesFile, "utf8")) : {};
const browser = await launch();
const queue = [...list];

async function stats(png: Buffer) {
  const s = await sharp(png).resize(105, 228).removeAlpha().stats();
  return Math.max(...s.channels.map((c) => c.stdev));
}
async function one(slug: string) {
  const page = await browser.page(420, 912, 3);
  try {
    await page.goto(`http://127.0.0.1:${server.port}/demo/${slug}`);
    // Settled: the page loaded, then `settle` ms, then two captures 300 ms apart (animated demos never settle; take the last).
    for (let i = 0; i < 50 && (await page.eval("document.readyState")) !== "complete"; i++) await Bun.sleep(100);
    await Bun.sleep(settle);
    let png = await page.shot();
    for (let i = 0; i < 3; i++) { await Bun.sleep(300); const b = await page.shot(); if (b.equals(png)) break; png = b; }
    mkdirSync(join(OUT, slug), { recursive: true });
    await Bun.write(join(OUT, slug, "exact-web.png"), png);
    const gpu = await page.eval(`(async()=>{ if(!navigator.gpu) return 'no navigator.gpu'; const a = await navigator.gpu.requestAdapter(); return a ? '' : 'no WebGPU adapter'; })()`);
    const canvases = await page.eval(`document.querySelectorAll('canvas').length`);
    const sd = await stats(png);
    const errors = page.logs.filter((l) => !l.startsWith("warning")).slice(0, 5);
    const blank = sd < 2;
    notes[slug] = { blank, why: blank ? (gpu || (canvases ? "canvas drew nothing" : errors[0] ?? "uniform screen")) : "", canvases, errors };
    console.log(`${slug.padEnd(32)} ${blank ? "BLANK " + notes[slug].why : "ok"}${errors.length ? `  (${errors.length} errors)` : ""}`);
  } catch (e) {
    notes[slug] = { blank: true, why: String(e), errors: [] };
    console.log(`${slug.padEnd(32)} FAILED ${e}`);
  } finally { await page.close(); }
}
await Promise.all(Array.from({ length: jobs }, async () => { for (let d; (d = queue.shift()); ) await one(d.slug); }));
writeFileSync(notesFile, JSON.stringify(notes, null, 1));
browser.close(); server.stop(true);
console.log(`web: ${list.length} demos, ${Object.values(notes).filter((n: any) => n.blank).length} blank → ${notesFile}`);
process.exit(0);
