// Serves the atlas and the Exact web build from one origin, so the atlas's live frames load /demo/<slug>.
//   bun exact/parity-tools/screen-atlas/serve.ts [--port 5310]
//   /atlas/…  → out/ (index.html, captures)    anything else → the web build (out/web, else target/web-dist),
//   with the app's index.html for client routes such as /demo/<slug>.
import { existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { DEMOS, OUT, WEB } from "./lib";
import { buildIndex } from "./build-index";

const arg = process.argv.indexOf("--port");
const port = Number(arg > 0 ? process.argv[arg + 1] : process.env.PORT ?? 5310);
const web = existsSync(join(WEB, "index.html")) ? WEB : join(DEMOS, "target/web-dist");
buildIndex();

const file = (root: string, p: string) => {
  const f = join(root, normalize(decodeURIComponent(p)).replace(/^(\.\.[/\\])+/, ""));
  return f.startsWith(root) && existsSync(f) && statSync(f).isFile() ? f : null;
};
const server = Bun.serve({
  port,
  fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/" || pathname === "/atlas") return Response.redirect("/atlas/", 302);
    if (pathname.startsWith("/atlas/")) {
      const f = file(OUT, pathname.slice(7) || "index.html");
      return f ? new Response(Bun.file(f), { headers: { "cache-control": "no-cache" } }) : new Response("not found", { status: 404 });
    }
    const f = file(web, pathname.slice(1));
    if (f) return new Response(Bun.file(f));
    if (/\.[a-z0-9]+$/i.test(pathname)) return new Response("not found", { status: 404 });
    return new Response(Bun.file(join(web, "index.html")), { headers: { "content-type": "text/html; charset=utf-8" } });
  },
});
console.log(`atlas: http://localhost:${server.port}/atlas/   (web build: ${web})`);
