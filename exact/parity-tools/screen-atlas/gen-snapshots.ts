// The atlas's static frames, from the running Mac app itself (no build): each demo opened by
// `demos-exact://snap/<slug>` (app.contract's snap route: the demo exactly as a tile mounts it,
// airEnv's 420×912 points, safe areas and seed, at snapScale()), captured `idleMs()` after it
// mounts (home/atlas.contract: a live tile reveals at that moment, so going live is no jump),
// cropped from the window into exact/demos/assets/atlas/<slug>.jpg. The feedback server serves
// that folder to the atlas (/snap/<slug>.jpg), so a new frame shows on the atlas's next open.
// The Mac app must be running (bun exact.mjs mac --run --url …) with its window unobscured.
//   bun gen-snapshots.ts [--only a,b] [--width 420] [--lag 120]
import { mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { DEMOS, demos } from "./lib";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const width = +arg("--width", "420");
const only = arg("--only", "").split(",").filter(Boolean);
const atlas = readFileSync(join(DEMOS, "home/atlas.contract"), "utf8");
const num = (name: string) => +(new RegExp(`fn ${name}\\(\\): number = ([\\d.]+)`).exec(atlas)?.[1] ?? NaN);
const IDLE = num("idleMs"), SCALE = num("snapScale"), LEFT = num("snapLeft"), TOP = num("snapTop");
// The link's way in (open, the route push, the first layout) before the demo's clock starts.
const LAG = +arg("--lag", "120");
const dir = join(DEMOS, "assets/atlas");
const tmp = "/tmp/atlas-snaps";
mkdirSync(dir, { recursive: true });
mkdirSync(tmp, { recursive: true });

// The Demos window's frame on screen, in points (CoreGraphics' window list).
function windowFrame(): { x: number; y: number; w: number; h: number } {
  const f = join(tmp, "frame.swift");
  writeFileSync(f, `import CoreGraphics
let l = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
for w in l where (w["kCGWindowOwnerName"] as? String) == "Demos" && (w["kCGWindowLayer"] as? Int) == 0 {
  let b = w["kCGWindowBounds"] as! [String: Any]; print(b["X"]!, b["Y"]!, b["Width"]!, b["Height"]!); break }
`);
  const out = Bun.spawnSync(["swift", f]).stdout.toString().trim().split(/\s+/).map(Number);
  if (out.length < 4 || out.some(isNaN)) throw new Error("no Demos window on screen: launch the Mac app (bun exact.mjs mac --run --url …)");
  return { x: out[0], y: out[1], w: out[2], h: out[3] };
}

const open = (url: string) => Bun.spawnSync(["open", url]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const slugs = demos().map((d) => d.slug).filter((s) => !only.length || only.includes(s));
let n = 0, bytes = 0;
const failed: string[] = [];
open("demos-exact:///");
await sleep(800);
const win = windowFrame();
const t0 = Date.now();
for (const s of slugs) {
  open(`demos-exact://snap/${s}`);
  await sleep(LAG + IDLE);
  const png = join(tmp, `${s}.png`);
  Bun.spawnSync(["screencapture", "-x", `-R${win.x + LEFT},${win.y + TOP},${420 * SCALE},${912 * SCALE}`, png]);
  open("demos-exact:///");
  if (!existsSync(png)) { failed.push(s); continue; }
  const info = await sharp(png).resize(width, Math.round((width * 912) / 420), { fit: "fill" })
    .jpeg({ quality: 82, mozjpeg: true }).toFile(join(dir, `${s}.jpg`));
  rmSync(png);
  n++; bytes += info.size;
  await sleep(250);
  if (n % 20 === 0) console.log(`${n}/${slugs.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`${n} snapshots, ${(bytes / 1024 / 1024).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${dir}${failed.length ? `; failed: ${failed.join(" ")}` : ""}`);
