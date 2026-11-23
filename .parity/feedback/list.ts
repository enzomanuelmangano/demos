// Every open note (the atlas's right-click feedback, the phone's), as markdown grouped by demo,
// with each note's crop. `--all` includes resolved ones; `--since <ISO time | 10m | 2h>` only
// the notes left after it (for a dispatcher that polls; inbox.jsonl is the line-per-event feed).
//   bun .parity/feedback/list.ts [--all] [--since 15m]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const DATA = resolve(import.meta.dir, "data");
const every = process.argv.includes("--all");
const si = process.argv.indexOf("--since");
const sinceArg = si > 0 ? process.argv[si + 1] ?? "" : "";
const rel = /^(\d+)([smhd])$/.exec(sinceArg);
const since = !sinceArg ? 0 : rel ? Date.now() - +rel[1] * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[rel[2] as "s"] : Date.parse(sinceArg);
type Note = { id: string; slug: string; n: number; x: number; y: number; element: string;
  frame: { x: number; y: number; w: number; h: number } | null; comment: string; status: string; at: string; crop: string };
const files = existsSync(DATA) ? readdirSync(DATA).filter((f) => f.endsWith(".json")).sort() : [];
let count = 0;
for (const f of files) {
  const ns: Note[] = JSON.parse(readFileSync(join(DATA, f), "utf8"))
    .filter((n: Note) => (every || n.status === "open") && (!since || Date.parse(n.at) >= since));
  if (!ns.length) continue;
  console.log(`## ${f.slice(0, -5)}`);
  for (const n of ns) {
    const at = `(${Math.round(n.x * 420)}, ${Math.round(n.y * 912)}) of 420×912`;
    const el = n.element ? ` · element \`${n.element}\`${n.frame ? ` [${[n.frame.x, n.frame.y, n.frame.w, n.frame.h].map(Math.round).join(", ")}]` : ""}` : "";
    console.log(`- #${n.n}${n.status === "open" ? "" : ` (${n.status})`} ${n.comment.replace(/\s+/g, " ")} — ${at}${el} · ${n.at.slice(0, 16).replace("T", " ")}${n.crop ? ` · crop ${n.crop}` : ""} · id ${n.id}`);
    count++;
  }
  console.log("");
}
if (!count) console.log(every ? "No feedback." : "No open feedback.");
