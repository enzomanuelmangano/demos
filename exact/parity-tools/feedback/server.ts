// The atlas's feedback store: the Mac app's feedback mode (exact/demos/home/atlas.contract) posts
// a note per click on a tile; this keeps one JSON per demo in data/<slug>.json, with a PNG crop
// around the point (data/<slug>-<id>.png, from the tile's static frame) beside it.
// `list.ts` prints the open ones for whoever fixes them.
//   bun exact/parity-tools/feedback/server.ts        (http://127.0.0.1:5350)
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { INBOX, lanAddresses, phone } from "./phone";

export const DATA = resolve(import.meta.dir, "data");
const SNAPS = resolve(import.meta.dir, "../../demos/assets/atlas");
const PORT = +(process.env.FEEDBACK_PORT ?? 5350);
// The demo's frame: an iPhone Air in points (home/atlas.contract airW/airH).
const W = 420, H = 912, CROP = 220;

export type Note = {
  id: string; slug: string; n: number;
  x: number; y: number;                         // 0-1 of the 420×912 frame
  element: string;                              // the nearest `id` under the point, "" if none
  frame: { x: number; y: number; w: number; h: number } | null; // its frame in points, in the demo
  comment: string; status: "open" | "resolved"; at: string; crop: string;
  source?: "desktop" | "phone";
};
// One line of inbox.jsonl per desktop event, in the shared schema (phone.ts writes the phone's):
// a new note, and each status change (resolved, open, deleted).
const inbox = (kind: string, n: Note) => appendFileSync(INBOX, JSON.stringify({ source: "desktop", kind, id: n.id, slug: n.slug,
  text: n.comment, x: n.x, y: n.y, elementId: n.element, frame: n.frame, crop: n.crop, status: n.status, ts: new Date().toISOString() }) + "\n");

mkdirSync(DATA, { recursive: true });
const file = (slug: string) => join(DATA, `${slug}.json`);
export const read = (slug: string): Note[] => (existsSync(file(slug)) ? JSON.parse(readFileSync(file(slug), "utf8")) : []);
const write = (slug: string, ns: Note[]) => writeFileSync(file(slug), JSON.stringify(ns, null, 2) + "\n");
export const all = (): Note[] =>
  readdirSync(DATA).filter((f) => f.endsWith(".json")).flatMap((f) => read(f.slice(0, -5)));
const safe = (s: string) => /^[a-z0-9-]+$/.test(s);

async function crop(slug: string, id: string, x: number, y: number): Promise<string> {
  const src = join(SNAPS, `${slug}.jpg`);
  if (!existsSync(src)) return "";
  const img = sharp(src);
  const { width = W, height = H } = await img.metadata();
  const s = Math.min(CROP, width, height), px = x * width, py = y * height;
  const left = Math.round(Math.max(0, Math.min(width - s, px - s / 2)));
  const top = Math.round(Math.max(0, Math.min(height - s, py - s / 2)));
  const ring = Buffer.from(`<svg width="${s}" height="${s}"><circle cx="${px - left}" cy="${py - top}" r="9" fill="none" stroke="#ff3b30" stroke-width="3"/></svg>`);
  const out = join(DATA, `${slug}-${id}.png`);
  await img.extract({ left, top, width: s, height: s }).composite([{ input: ring }]).png().toFile(out);
  return out;
}

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

Bun.serve({
  hostname: "0.0.0.0", // the LAN too: the phone posts here (phone.ts)
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" } });
    if (url.pathname === "/notes") return json({ notes: safe(url.searchParams.get("slug") ?? "") ? read(url.searchParams.get("slug")!) : all() });
    if (url.pathname === "/phone" && req.method === "POST") return phone(req);
    // The atlas's static frames at runtime (gen-snapshots.ts writes them): a regenerated frame
    // shows on the next atlas open, with no native build.
    const snap = /^\/snap\/([a-z0-9-]+)\.jpg$/.exec(url.pathname);
    if (snap) {
      const f = join(SNAPS, `${snap[1]}.jpg`);
      return existsSync(f) ? new Response(Bun.file(f), { headers: { "cache-control": "no-cache" } }) : json({ error: "no frame" }, 404);
    }
    if (req.method !== "POST") return json({ error: "not found" }, 404);
    const b = await req.json();
    if (!safe(b.slug ?? "")) return json({ error: "slug" }, 400);
    const ns = read(b.slug);
    if (url.pathname === "/add") {
      const id = Date.now().toString(36);
      const n = Math.max(0, ...ns.map((v) => v.n)) + 1;
      const x = Math.max(0, Math.min(1, +b.x)), y = Math.max(0, Math.min(1, +b.y));
      const frame = b.element ? { x: +b.ex, y: +b.ey, w: +b.ew, h: +b.eh } : null;
      const note: Note = { id, slug: b.slug, n, x, y, element: b.element ?? "", frame, comment: String(b.comment ?? ""),
        status: "open", at: new Date().toISOString(), crop: await crop(b.slug, id, x, y), source: "desktop" };
      write(b.slug, ns.concat([note]));
      inbox("note", note);
      return json(note);
    }
    if (url.pathname === "/edit") {
      const i = ns.findIndex((v) => v.id === b.id);
      if (i < 0) return json({ error: "id" }, 404);
      const note = ns[i];
      if (b.status === "deleted") {
        if (note.crop) rmSync(note.crop, { force: true });
        write(b.slug, ns.filter((v) => v.id !== b.id));
        inbox("deleted", note);
        return json(note);
      }
      if (typeof b.comment === "string" && b.comment !== "") note.comment = b.comment;
      if (b.status === "open" || b.status === "resolved") note.status = b.status;
      write(b.slug, ns);
      inbox(b.status === "open" || b.status === "resolved" ? b.status : "edited", note);
      return json(note);
    }
    return json({ error: "not found" }, 404);
  },
});
console.log(`feedback: http://127.0.0.1:${PORT} → ${DATA}`);
for (const ip of lanAddresses()) console.log(`  phone: http://${ip}:${PORT}  (POST /phone → inbox.jsonl)`);
