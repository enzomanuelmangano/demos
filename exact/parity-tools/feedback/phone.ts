// The phone's side of the feedback store: the Demos app on an iPhone (modules/apple/Feedback.swift:
// shake, or a two-finger long-press, in any open demo) posts one command per tap to POST /phone.
//   kind: note | screenshot | clip | approve | parity
// Each lands as one line of inbox.jsonl (`source: "phone"`), its media beside it in data/phone/
// (<slug>-<id>.jpg, .mp4), and a `note` also as a Note in data/<slug>.json, so list.ts and the
// atlas see it. The phone queues and retries, so a repeated id is answered and not stored twice.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DATA = resolve(import.meta.dir, "data");
const MEDIA = join(DATA, "phone");
export const INBOX = resolve(import.meta.dir, "inbox.jsonl");
const KINDS = new Set(["note", "screenshot", "clip", "approve", "parity"]);
const MAX_IMAGE = 2 << 20, MAX_CLIP = 12 << 20;
const safe = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9-]+$/.test(s);

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

/** POST /phone. Body: { id, kind, slug, name, text, point: {x, y} | null (0-1 of the screen),
 *  at, device, build, image?: base64 JPEG, clip?: base64 MP4 }. */
export async function phone(req: Request): Promise<Response> {
  const b = await req.json().catch(() => null);
  if (!b || !safe(b.slug) || !safe(b.id) || !KINDS.has(b.kind)) return json({ error: "slug, id or kind" }, 400);
  mkdirSync(MEDIA, { recursive: true });
  const seen = join(MEDIA, `${b.id}.json`);
  if (existsSync(seen)) return json(JSON.parse(readFileSync(seen, "utf8")));
  const media = (field: "image" | "clip", ext: string, max: number) => {
    if (typeof b[field] !== "string" || !b[field]) return "";
    const bytes = Buffer.from(b[field], "base64");
    if (bytes.length > max) return "";
    const out = join(MEDIA, `${b.slug}-${b.id}.${ext}`);
    writeFileSync(out, bytes);
    return out;
  };
  const image = media("image", "jpg", MAX_IMAGE), clip = media("clip", "mp4", MAX_CLIP);
  const point = b.point && Number.isFinite(+b.point.x) && Number.isFinite(+b.point.y)
    ? { x: Math.max(0, Math.min(1, +b.point.x)), y: Math.max(0, Math.min(1, +b.point.y)) } : null;
  const entry = {
    source: "phone", kind: b.kind, id: b.id, slug: b.slug, name: String(b.name ?? ""), text: String(b.text ?? ""),
    point, image, clip, at: String(b.at ?? new Date().toISOString()), received: new Date().toISOString(),
    device: b.device ?? null, build: b.build ?? null,
  };
  if (b.kind === "note") {
    const file = join(DATA, `${b.slug}.json`);
    const ns = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
    const n = Math.max(0, ...ns.map((v: { n: number }) => v.n)) + 1;
    ns.push({ id: b.id, slug: b.slug, n, x: point?.x ?? 0.5, y: point?.y ?? 0.5, element: "", frame: null,
      comment: entry.text, status: "open", at: entry.at, crop: image, source: "phone" });
    writeFileSync(file, JSON.stringify(ns, null, 2) + "\n");
  }
  appendFileSync(INBOX, JSON.stringify(entry) + "\n");
  writeFileSync(seen, JSON.stringify(entry));
  console.log(`phone ${entry.kind} ${entry.slug}${entry.text ? `: ${entry.text}` : ""}${image ? ` ${image}` : ""}${clip ? ` ${clip}` : ""}`);
  return json(entry);
}

/** The machine's LAN addresses, for the URL the server prints. */
export function lanAddresses(): string[] {
  const { networkInterfaces } = require("node:os") as typeof import("node:os");
  return Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i!.address);
}
