// Rejects atlas frames that can't be a demo's idle: the wrong size or aspect, nearly uniform
// (blank), atlas chrome in it (a light page with a rounded tile edge and caption text: its
// outer margin light grey/white while the middle is not), or (near-)identical to another slug's.
//   bun validate-snapshots.ts [dir]      (default: exact/demos/assets/atlas; prints the rejects)
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { DEMOS } from "./lib";

type Sig = { mean: number[]; std: number; grid: Float64Array };
async function sig(file: string): Promise<{ w: number; h: number; s: Sig }> {
  const img = sharp(file);
  const { width = 0, height = 0 } = await img.metadata();
  const { data, info } = await img.removeAlpha().resize(64, 139, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, grid = new Float64Array(n);
  const mean = [0, 0, 0];
  for (let i = 0; i < n; i++) { for (let c = 0; c < 3; c++) mean[c] += data[i * 3 + c] / n; grid[i] = (data[i * 3] + data[i * 3 + 1] + data[i * 3 + 2]) / 3; }
  let v = 0; for (let i = 0; i < n; i++) v += (grid[i] - grid.reduce((a, b) => a + b, 0) / n) ** 2 / n;
  return { w: width, h: height, s: { mean, std: Math.sqrt(v), grid } };
}
// Chrome: the atlas's caption row ("Name / Unverified": dark text on the page's light grey)
// lies just under a tile; a frame holding it has a light, low-variance band with a dark
// thin line across it and a rounded tile edge. Proxy: any full-width row band that is the
// atlas page's grey (#f5f5f7 ± 6) on both edges while the frame's own edge columns differ.
async function chrome(file: string): Promise<boolean> {
  const { data, info } = await sharp(file).removeAlpha().resize(42, 91, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => [0, 1, 2].map((c) => data[(y * info.width + x) * 3 + c]);
  const page = (p: number[]) => Math.abs(p[0] - 246) < 8 && Math.abs(p[1] - 246) < 8 && Math.abs(p[2] - 248) < 8;
  // A tile edge inside the frame: page grey on the left margin while the next column inward is
  // a tile's content (not page grey), over a long vertical run.
  let run = 0, best = 0;
  for (let y = 0; y < info.height; y++) {
    const edge = page(px(0, y)) && !page(px(3, y)) || page(px(info.width - 1, y)) && !page(px(info.width - 4, y));
    run = edge ? run + 1 : 0; best = Math.max(best, run);
  }
  return best > info.height * 0.5;
}

export async function validate(dir: string, slugs?: string[]): Promise<Map<string, string>> {
  const files = (slugs ?? readdirSync(dir).filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4)))
    .filter((s) => existsSync(join(dir, `${s}.jpg`)));
  const bad = new Map<string, string>();
  for (const s of slugs ?? []) if (!existsSync(join(dir, `${s}.jpg`))) bad.set(s, "missing");
  const sigs = new Map<string, Sig>();
  for (const s of files) {
    const f = join(dir, `${s}.jpg`);
    const { w, h, s: g } = await sig(f);
    if (!w || Math.abs(h / w - 912 / 420) > 0.02) { bad.set(s, `aspect ${w}×${h}`); continue; }
    if (g.std < 0.8) { bad.set(s, `blank (σ ${g.std.toFixed(1)})`); continue; }
    if (await chrome(f)) { bad.set(s, "atlas chrome (a tile edge on the page grey)"); continue; }
    sigs.set(s, g);
  }
  // Against every frame in the folder, not only this batch: a crop of a neighbour matches it.
  const all = new Map(sigs);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".jpg"))) {
    const s = f.slice(0, -4);
    if (!all.has(s)) all.set(s, (await sig(join(dir, f))).s);
  }
  for (const [a, ga] of sigs) for (const [b, gb] of all) {
    if (a === b) continue;
    let d = 0; for (let i = 0; i < ga.grid.length; i++) d += Math.abs(ga.grid[i] - gb.grid[i]) / ga.grid.length;
    if (d < 0.4) { bad.set(a, `same as ${b} (Δ ${d.toFixed(2)})`); break; }
  }
  return bad;
}

if (import.meta.main) {
  const dir = process.argv[2] ?? join(DEMOS, "assets/atlas");
  const bad = await validate(dir);
  for (const [s, why] of bad) console.log(`${s}: ${why}`);
  console.log(`${bad.size} rejected of ${readdirSync(dir).filter((f) => f.endsWith(".jpg")).length}`);
}
