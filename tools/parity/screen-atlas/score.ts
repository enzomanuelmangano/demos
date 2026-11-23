// RN iOS vs Exact iOS: per-pixel difference (max over RGB, 0-255) → out/<slug>/diff.png (420 px wide
// heatmap: Exact in grey, differences in red) and out/scores.json ({ slug: { mean, p99, over16 } }).
//   bun score.ts [slug…]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { OUT, demos } from "./lib";

export async function score(slug: string) {
  const a = join(OUT, slug, "rn-ios.png"), b = join(OUT, slug, "exact-ios.png");
  if (!existsSync(a) || !existsSync(b)) return null;
  const meta = await sharp(b).metadata();
  const [x, y] = await Promise.all([a, b].map((f) => sharp(f).removeAlpha().resize(meta.width, meta.height, { fit: "fill" }).raw().toBuffer()));
  const n = meta.width! * meta.height!;
  const d = new Uint8Array(n), hist = new Uint32Array(256), heat = Buffer.alloc(n * 3);
  let sum = 0, over = 0;
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    const v = Math.max(Math.abs(x[j] - y[j]), Math.abs(x[j + 1] - y[j + 1]), Math.abs(x[j + 2] - y[j + 2]));
    d[i] = v; hist[v]++; sum += v; if (v > 16) over++;
    const g = ((y[j] + y[j + 1] + y[j + 2]) / 3) * 0.35, r = Math.min(255, v * 3);
    heat[j] = Math.max(g, r); heat[j + 1] = g * (1 - r / 255); heat[j + 2] = g * (1 - r / 255);
  }
  let p99 = 0;
  for (let acc = 0, k = 0; k < 256; k++) { acc += hist[k]; if (acc >= n * 0.99) { p99 = k; break; } }
  await sharp(heat, { raw: { width: meta.width!, height: meta.height!, channels: 3 } }).resize(420).png().toFile(join(OUT, slug, "diff.png"));
  return { mean: +(sum / n).toFixed(2), p99, over16: +((over / n) * 100).toFixed(2) };
}

if (import.meta.main) {
  const only = process.argv.slice(2);
  const file = join(OUT, "scores.json");
  const scores: Record<string, any> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  for (const d of demos()) {
    if (only.length && !only.includes(d.slug)) continue;
    const s = await score(d.slug);
    if (s) scores[d.slug] = s;
  }
  writeFileSync(file, JSON.stringify(scores, null, 1));
  const worst = Object.entries(scores).sort((a: any, b: any) => b[1].mean - a[1].mean).slice(0, 10);
  console.log("worst (mean / p99 / % px over 16):");
  for (const [k, v] of worst as any) console.log(`  ${k.padEnd(30)} ${v.mean.toFixed(2).padStart(6)} ${String(v.p99).padStart(4)} ${v.over16.toFixed(1).padStart(5)}%`);
}
