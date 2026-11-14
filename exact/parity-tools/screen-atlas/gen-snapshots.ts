// The atlas route's static frames: each demo's last Exact web capture (out/<slug>/exact-web.png,
// from capture-web.ts) as a small JPEG in exact/demos/assets/atlas/<slug>.jpg (gitignored; a
// native build bundles it). A tile shows it until the pointer makes the tile live.
//   bun gen-snapshots.ts [--width 360]
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { DEMOS, OUT, demos } from "./lib";

const i = process.argv.indexOf("--width");
const width = i > 0 ? +process.argv[i + 1] : 360;
const dir = join(DEMOS, "assets/atlas");
mkdirSync(dir, { recursive: true });
let n = 0, bytes = 0;
for (const d of demos()) {
  const src = join(OUT, d.slug, "exact-web.png");
  if (!existsSync(src)) continue;
  const info = await sharp(src).resize(width).jpeg({ quality: 72, mozjpeg: true }).toFile(join(dir, `${d.slug}.jpg`));
  n++; bytes += info.size;
}
console.log(`${n} snapshots, ${(bytes / 1024 / 1024).toFixed(1)} MB → ${dir}`);
