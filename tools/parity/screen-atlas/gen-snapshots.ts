// The atlas's static frames, from the Mac app itself. It TAKES OVER the running Mac app's window
// for ~4 minutes (it opens demos-exact://snap/<slug> in it, one demo after another), so run it
// only when nobody is using the app, and say so: `--take-over-window` is required.
// Each demo shows alone in the snap route (app.contract: exactly as a tile mounts it, airEnv's
// 420×912 points, safe areas and pinned seed, at snapScale()); the app posts /snap-idle to the
// feedback server `idleMs()` after the mount (a live tile reveals at that moment, so going live
// is no jump); this waits on that, captures the window's own pixels (screencapture -l, never a
// screen region: other windows over it don't matter), crops the frame, and validates every
// frame (validate-snapshots.ts), capturing the rejects again. The server serves assets/atlas to
// the atlas at runtime (/snap/<slug>.jpg), so no build is needed.
//   bun gen-snapshots.ts --take-over-window [--only a,b] [--width 420]
import { mkdirSync, readFileSync, existsSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { DEMOS, demos } from "./lib";
import { validate } from "./validate-snapshots";

if (!process.argv.includes("--take-over-window")) {
  console.error("gen-snapshots drives the running Mac app's window for minutes: pass --take-over-window when nobody is using it.");
  process.exit(2);
}
const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const width = +arg("--width", "420");
const only = arg("--only", "").split(",").filter(Boolean);
const atlas = readFileSync(join(DEMOS, "home/atlas.contract"), "utf8");
const num = (name: string) => +(new RegExp(`fn ${name}\\(\\): number = ([\\d.]+)`).exec(atlas)?.[1] ?? NaN);
const SCALE = num("snapScale"), LEFT = num("snapLeft"), TOP = num("snapTop");
const SERVER = "http://127.0.0.1:5350";
const dir = join(DEMOS, "assets/atlas");
const tmp = "/tmp/atlas-snaps", staged = join(tmp, "out");
mkdirSync(staged, { recursive: true });

// The Demos window: its CoreGraphics id and size in points (the reader is compiled once).
const reader = join(tmp, "demos-window");
function demosWindow(): { id: number; w: number; h: number } {
  if (!existsSync(reader)) {
    const f = join(tmp, "demos-window.swift");
    writeFileSync(f, `import CoreGraphics
let l = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]
for w in l where (w["kCGWindowOwnerName"] as? String) == "Demos" && (w["kCGWindowLayer"] as? Int) == 0 && (w["kCGWindowIsOnscreen"] as? Bool) == true {
  let b = w["kCGWindowBounds"] as! [String: Any]; print(w["kCGWindowNumber"]!, b["Width"]!, b["Height"]!); break }
`);
    Bun.spawnSync(["swiftc", "-O", "-o", reader, f]);
  }
  const [id, w, h] = Bun.spawnSync([reader]).stdout.toString().trim().split(/\s+/).map(Number);
  if (!id) throw new Error("no Demos window: launch the Mac app (bun exact.mjs mac --run --url …)");
  return { id, w, h };
}

const open = (url: string) => Bun.spawnSync(["open", "-g", url]); // -g: not brought forward
async function capture(slug: string): Promise<boolean> {
  const win = demosWindow();
  if (win.h < TOP + 912 * SCALE + 4) throw new Error(`the window is ${win.h} pt tall; the frame needs ${TOP + 912 * SCALE + 4}`);
  const asked = Date.now();
  open(`demos-exact://snap/${slug}`);
  // The app's own "idle now" (its clock, idleMs after the mount), not a guessed delay.
  const r = await fetch(`${SERVER}/snap-wait?slug=${slug}&after=${asked}&timeout=10000`).catch(() => null);
  const png = join(tmp, `${slug}.png`);
  if (r?.ok) Bun.spawnSync(["screencapture", "-x", "-o", `-l${win.id}`, png]);
  open("demos-exact:///");
  if (!r?.ok || !existsSync(png)) return false;
  const meta = await sharp(png).metadata();
  const k = (meta.width ?? win.w) / win.w; // pixels per point
  await sharp(png)
    .extract({ left: Math.round(LEFT * k), top: Math.round(TOP * k), width: Math.round(420 * SCALE * k), height: Math.round(912 * SCALE * k) })
    .resize(width, Math.round((width * 912) / 420), { fit: "fill" }).jpeg({ quality: 82, mozjpeg: true })
    .toFile(join(staged, `${slug}.jpg`));
  rmSync(png);
  return true;
}

const slugs = demos().map((d) => d.slug).filter((s) => !only.length || only.includes(s));
const t0 = Date.now();
let pending = slugs;
for (let round = 0; round < 3 && pending.length; round++) {
  for (const [i, s] of pending.entries()) {
    if (!(await capture(s))) console.log(`  ${s}: no idle beacon (is the feedback server running, the app on the current plan?)`);
    if ((i + 1) % 20 === 0) console.log(`${i + 1}/${pending.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const bad = await validate(staged, pending);
  for (const [s, why] of bad) console.log(`  reject ${s}: ${why}`);
  pending = [...bad.keys()];
}
const good = slugs.filter((s) => !pending.includes(s) && existsSync(join(staged, `${s}.jpg`)));
for (const s of good) cpSync(join(staged, `${s}.jpg`), join(dir, `${s}.jpg`));
console.log(`${good.length}/${slugs.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${dir}${pending.length ? `; still rejected (old frame kept): ${pending.join(" ")}` : ""}`);
