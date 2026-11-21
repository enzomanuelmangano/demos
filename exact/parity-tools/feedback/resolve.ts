// Marks a note handled, so the phone's feedback sheet (and the atlas) shows it as fixed.
//
//   bun exact/parity-tools/feedback/resolve.ts <note-id> [fix summary]          live now → "fixed"
//   bun exact/parity-tools/feedback/resolve.ts <note-id> --build [fix summary]  fix waits for the native build
//
// A fix that is live on the phone (hot reload, or an installed build) resolves the note. A fix
// that waits for the next native build keeps it open and tags the comment "⏳ next build", so
// the owner sees it is handled but not on the phone yet; run again without --build once installed.
// The summary is appended to the note after " — ✓ ", the user's own words stay first.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dir, "data");
const args = process.argv.slice(2);
const pending = args.includes("--build");
const [id, ...rest] = args.filter((a) => a !== "--build");
if (!id) { console.error("usage: resolve.ts <note-id> [--build] [fix summary]"); process.exit(1); }
const summary = rest.join(" ").trim();

const found = readdirSync(DATA).filter((f) => f.endsWith(".json")).flatMap((f) => {
  try {
    const ns = JSON.parse(readFileSync(resolve(DATA, f), "utf8"));
    return Array.isArray(ns) ? ns.filter((n) => n.id === id) : [];
  } catch { return []; }
})[0];
if (!found) { console.error(`no note ${id}`); process.exit(1); }

const base = String(found.comment).split(" — ✓ ")[0].replace(/ ⏳ next build$/, "");
const comment = (summary ? `${base} — ✓ ${summary}` : base) + (pending ? " ⏳ next build" : "");
const res = await fetch("http://127.0.0.1:5350/edit", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ slug: found.slug, id, comment, status: pending ? "open" : "resolved" }),
});
console.log(res.ok ? `${found.slug} ${id}: ${pending ? "handled, next build" : "fixed"}` : `failed ${res.status}`);
