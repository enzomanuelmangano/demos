// A static host for a web build (bun exact.mjs web-build --out <dir>) as a CDN serves it, for the load runs:
//   bun tools/web-perf/serve.ts <dir> <port> [--gzip]
// Brotli (or gzip with --gzip) for text and wasm, no idle timeout (`exact serve` and the dev server close a
// connection a throttled client drains slowly: a 25 MB wasm at 1 MB/s is cut after ~8 s), the build's
// /.exact/gen/<id>/ prefix mapped to the directory, and shell.html for the routes' navigations.
import { brotliCompressSync, gzipSync, constants } from "node:zlib";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const [dir, portArg] = process.argv.slice(2);
const useGzip = process.argv.includes("--gzip");
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".wgsl": "text/plain", ".png": "image/png", ".jpg": "image/jpeg", ".otf": "font/otf", ".ttf": "font/ttf", ".m4a": "audio/mp4", ".bin": "application/octet-stream", ".plan": "application/octet-stream" };
const compressible = new Set([".html", ".js", ".mjs", ".css", ".wasm", ".json", ".wgsl", ".plan", ".otf", ".ttf"]);
const cache = new Map<string, Uint8Array>();
const encoded = (path: string, enc: string) => {
  const key = `${enc}:${path}`;
  let b = cache.get(key);
  if (!b) {
    const raw = readFileSync(path);
    b = enc === "br" ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }) : gzipSync(raw, { level: 9 });
    cache.set(key, b);
  }
  return b;
};
Bun.serve({
  port: Number(portArg ?? 5391), hostname: "127.0.0.1", idleTimeout: 0,
  fetch(req: Request) {
    let path = decodeURIComponent(new URL(req.url).pathname).replace(/^\/\.exact\/gen\/[0-9a-f]+\//, "/");
    let file = join(dir, path);
    if (path.endsWith("/") || !existsSync(file) || statSync(file).isDirectory()) {
      if ((req.headers.get("accept") ?? "").includes("text/html")) file = join(dir, "shell.html");
      else return new Response("not found", { status: 404 });
    }
    const ext = extname(file), headers: Record<string, string> = { "content-type": types[ext] ?? "application/octet-stream", "cache-control": "no-cache", vary: "Accept-Encoding" };
    const accept = req.headers.get("accept-encoding") ?? "";
    const enc = compressible.has(ext) ? (!useGzip && accept.includes("br") ? "br" : accept.includes("gzip") ? "gzip" : null) : null;
    if (enc) { headers["content-encoding"] = enc; return new Response(encoded(file, enc), { headers }); }
    return new Response(Bun.file(file), { headers });
  },
});
console.log(`serving ${dir} on http://127.0.0.1:${portArg ?? 5391}/`);
