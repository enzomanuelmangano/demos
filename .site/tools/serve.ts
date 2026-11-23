#!/usr/bin/env bun
// A local stand-in for the host: serves a Build Output API v3 tree (tools/compose.ts) by its config.json routes, the
// subset compose writes (redirects, header routes with `continue`, rewrites, `handle: filesystem`, status). For the
// parity and isolation checks; never a deploy.
//   bun tools/serve.ts [.vercel/output] [--port 4310]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { brotliCompressSync } from 'node:zlib';

const out = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : join(import.meta.dir, '../.vercel/output'));
const portAt = process.argv.indexOf('--port');
const port = Number(portAt < 0 ? process.env.PORT ?? 4310 : process.argv[portAt + 1]);
const { routes } = JSON.parse(readFileSync(join(out, 'config.json'), 'utf8')) as { routes: any[] };
const root = join(out, 'static');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.wgsl': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };
const COMPRESS = new Set(['.html', '.js', '.mjs', '.css', '.wasm', '.json', '.wgsl', '.otf', '.ttf', '.svg', '.xml', '.txt', '.plan']);
const brCache = new Map<string, Uint8Array>();
const isFile = (p: string) => p.startsWith(root) && existsSync(p) && statSync(p).isFile();

function file(path: string, status: number, headers: Record<string, string>, req: Request) {
  const p = join(root, decodeURIComponent(path));
  const h = new Headers({ 'content-type': TYPES[extname(p)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate', ...headers });
  if (COMPRESS.has(extname(p)) && (req.headers.get('accept-encoding') ?? '').includes('br')) {
    const key = `${p}:${statSync(p).mtimeMs}`; // a recomposed tree is served fresh without a restart
    let b = brCache.get(key);
    if (!b) brCache.set(key, (b = brotliCompressSync(readFileSync(p))));
    h.set('content-encoding', 'br');
    h.set('vary', 'Accept-Encoding');
    return new Response(new Blob([b as Uint8Array<ArrayBuffer>]), { status, headers: h });
  }
  return new Response(Bun.file(p), { status, headers: h });
}

Bun.serve({
  port, hostname: '127.0.0.1', idleTimeout: 0,
  fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    const headers: Record<string, string> = {};
    for (const r of routes) {
      if (r.handle === 'filesystem') {
        const p = join(root, decodeURIComponent(path));
        if (isFile(p)) return file(path, 200, headers, req);
        if (isFile(join(p, 'index.html')) && path.endsWith('/')) return file(join(path, 'index.html'), 200, headers, req);
        continue;
      }
      const m = new RegExp(r.src).exec(path);
      if (!m) continue;
      const sub = (s: string) => s.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '');
      if (r.headers) for (const [k, v] of Object.entries(r.headers as Record<string, string>)) if (k !== 'Location') headers[k] = v;
      if (r.headers?.Location && r.status >= 300 && r.status < 400) return new Response(null, { status: r.status, headers: { Location: sub(r.headers.Location) + url.search } });
      if (r.continue) continue;
      if (r.dest) {
        const dest = sub(r.dest);
        if (/^https?:/.test(dest)) return fetch(dest + url.search, { method: req.method, headers: req.headers, body: req.body });
        path = dest;
        if (isFile(join(root, path))) return file(path, r.status ?? 200, headers, req);
      }
      if (r.status) return new Response('not found', { status: r.status });
    }
    return new Response('not found', { status: 404 });
  },
});
console.log(`serve: ${out} at http://127.0.0.1:${port}/`);
