// Writes .out/index.html: viewer.html with the demo list, captures present, scores and web notes inlined.
//   bun build-index.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEMOS, HERE, OUT, demos } from "./lib";

export function buildIndex() {
  mkdirSync(join(OUT, "icons"), { recursive: true });
  const list = demos();
  const have: Record<string, string[]> = {};
  for (const d of list) {
    const dir = join(OUT, d.slug);
    have[d.slug] = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)) : [];
    const icon = join(DEMOS, d.icon);
    if (d.icon && existsSync(icon) && !existsSync(join(OUT, "icons", d.slug + ".png"))) copyFileSync(icon, join(OUT, "icons", d.slug + ".png"));
  }
  const read = (f: string) => (existsSync(join(OUT, f)) ? JSON.parse(readFileSync(join(OUT, f), "utf8")) : {});
  const data = { demos: list, have, scores: read("scores.json"), web: read("web.json"), generated: new Date().toISOString().slice(0, 16).replace("T", " ") };
  const html = readFileSync(join(HERE, "viewer.html"), "utf8").replace("/*ATLAS_DATA*/{}", () => JSON.stringify(data).replace(/</g, "\\u003c"));
  writeFileSync(join(OUT, "index.html"), html);
  return join(OUT, "index.html");
}
if (import.meta.main) console.log(buildIndex());
