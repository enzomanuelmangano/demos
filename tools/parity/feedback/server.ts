// The atlas's feedback store: the Mac app's feedback mode (home/atlas.contract) posts
// a note per click on a tile; this keeps one JSON per demo in .data/<slug>.json, with a PNG crop
// around the point (.data/<slug>-<id>.png, from the tile's static frame) beside it.
// `list.ts` prints the open ones for whoever fixes them.
//   bun tools/parity/feedback/server.ts        (http://127.0.0.1:5350)
// Everything it writes lives in .data/ (a dot folder, so the Exact build and its dev server, which run
// from the repo root, never capture or watch it).
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { INBOX, lanAddresses, phone } from "./phone";

export const DATA = resolve(import.meta.dir, ".data");
const SNAPS = resolve(import.meta.dir, "../../../assets/atlas");
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

export function approved(): string[] {
  const state = new Map<string, boolean>();
  if (existsSync(INBOX)) for (const line of readFileSync(INBOX, "utf8").split("\n")) {
    let e: { kind?: string; slug?: string };
    try { e = JSON.parse(line); } catch { continue; }
    if (!safe(e.slug ?? "")) continue;
    if (e.kind === "approve") state.set(e.slug!, true);
    else if (e.kind === "note" || e.kind === "parity") state.set(e.slug!, false);
  }
  return [...state].filter(([, ok]) => ok).map(([slug]) => slug);
}

// When the owner last looked at each demo on the phone: seen.json (POST /seen, each open), and
// for the time before it any phone event on the demo (a note, approve, clip is sent from inside it).
const SEEN = resolve(DATA, "seen.json");
const seenAt = (): Record<string, string> => (existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, "utf8")) : {});
// A live fix is a "resolved" event (resolve.ts without --build); "⏳ next build" stays "open",
// since that change is not on the phone yet.
export function changed(): string[] {
  const seen = new Map(Object.entries(seenAt()));
  const fixed = new Map<string, string>();
  if (existsSync(INBOX)) for (const line of readFileSync(INBOX, "utf8").split("\n")) {
    let e: { kind?: string; slug?: string; source?: string; ts?: string; received?: string; at?: string };
    try { e = JSON.parse(line); } catch { continue; }
    if (!safe(e.slug ?? "")) continue;
    const t = String(e.received ?? e.ts ?? e.at ?? "");
    if (e.source === "phone" && t > (seen.get(e.slug!) ?? "")) seen.set(e.slug!, t);
    if (e.kind === "resolved" && t > (fixed.get(e.slug!) ?? "")) fixed.set(e.slug!, t);
  }
  return [...fixed].filter(([slug, t]) => t > (seen.get(slug) ?? "")).map(([slug]) => slug);
}

const idle = new Map<string, number>();
const waiters = new Map<string, (() => void)[]>();
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
    // The phone's home badges (app.contract approvedDemos): every slug "✅ Looks good" on the
    // phone, unless a later note or parity report on it reopened it. Read from inbox.jsonl.
    if (url.pathname === "/approved") return json({ slugs: approved() });
    // The phone's orange badges (app.contract changedDemos / demoSeen): a demo opened on the
    // phone is seen now; one is changed while a live fix landed after its last look.
    if (url.pathname === "/changed") return json({ slugs: changed() });
    if (url.pathname === "/seen" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (!safe(b.slug ?? "")) return json({ error: "slug" }, 400);
      writeFileSync(SEEN, JSON.stringify({ ...seenAt(), [b.slug]: new Date().toISOString() }, null, 2) + "\n");
      return json({ ok: true });
    }
    // The snap route's idle beacon (app.contract snapIdle) and gen-snapshots.ts's wait on it.
    if (url.pathname === "/snap-idle" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (safe(b.slug ?? "")) { idle.set(b.slug, Date.now()); waiters.get(b.slug)?.forEach((w) => w()); waiters.delete(b.slug); }
      return json({ ok: true });
    }
    if (url.pathname === "/snap-wait") {
      const slug = url.searchParams.get("slug") ?? "", after = +(url.searchParams.get("after") ?? 0);
      if ((idle.get(slug) ?? 0) > after) return json({ ok: true });
      return await new Promise<Response>((done) => {
        const t = setTimeout(() => done(json({ ok: false }, 408)), +(url.searchParams.get("timeout") ?? 8000));
        waiters.set(slug, (waiters.get(slug) ?? []).concat([() => { clearTimeout(t); done(json({ ok: true })); }]));
      });
    }
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
