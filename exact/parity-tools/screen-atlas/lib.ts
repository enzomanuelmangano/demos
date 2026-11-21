// Shared paths and the demo list for the screen atlas.
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const HERE = import.meta.dir;
export const DEMOS = resolve(HERE, "../../demos");
export const OUT = process.env.ATLAS_OUT ?? join(HERE, "out");
export const WEB = join(OUT, "web"); // a snapshot of target/web-dist, so other agents' builds don't move it mid-run
export const KINDS = ["rn-ios", "exact-ios", "exact-web"] as const;

export type Status = "done" | "open" | "claimed" | "unverified";
export type Demo = { slug: string; name: string; icon: string; order: number; status: Status; note: string };

export function demos(): Demo[] {
  const ported = readFileSync(join(DEMOS, "tools/ported.txt"), "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  const contract = readFileSync(join(DEMOS, "demos.contract"), "utf8");
  const info = new Map<string, { name: string; icon: string; order: number }>();
  let i = 0;
  for (const m of contract.matchAll(/Demo\(slug="([^"]+)", name="([^"]*)",[^)]*?icon="([^"]*)"/g))
    info.set(m[1], { name: m[2], icon: m[3], order: i++ });
  const queue = new Map<string, string>();
  for (const line of readFileSync(join(DEMOS, "tools/parity-queue.txt"), "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [slug, ...rest] = line.split(" ");
    queue.set(slug, rest.join(" "));
  }
  return ported.map((slug) => {
    const q = queue.get(slug) ?? "";
    const status: Status = /\bdone:/.test(q) ? "done" : /\bopen:/.test(q) ? "open" : /\bclaimed:/.test(q) ? "claimed" : "unverified";
    const d = info.get(slug);
    return { slug, name: d?.name ?? slug, icon: d?.icon ?? "", order: d?.order ?? 999, status, note: q };
  });
}

export const has = (slug: string, kind: string) => existsSync(join(OUT, slug, `${kind}.png`));
