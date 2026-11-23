#!/usr/bin/env bun
// One origin for both sites, to simulate the cutover (docs/storage.md): localStorage, sessionStorage, IndexedDB and
// cookies are per origin, so the old (Next) and the new (Exact) site must answer on the SAME origin, as reactiive.io
// will. Every request to http://localhost:<port> goes to the old site or to the new one, by a switch:
//
//   bun tools/local-env/switch.ts [--port 4317] [--old http://127.0.0.1:3017] [--new http://127.0.0.1:4319] [--mode old]
//   curl -X POST 'http://localhost:4317/__switch?to=new'    (the "deploy"; ?to=old is the rollback)
//   curl 'http://localhost:4317/__switch'                   (the current side)
//   curl 'http://localhost:4317/__switch/forwarded'         (every /api/purchase/* and /api/refund/* request that reached
//                                                            a site through this origin; POST ?reset clears the list)
//
// The old site is the reference's production build (tools/local-env/api.ts --prod --site-port 4317), its pages and its
// /api/* alike. The new site is the composed Exact site (tools/serve.ts), whose own /api/* proxy points at the same old
// deployment (LEGACY_API_ORIGIN), as production's rewrite. Answers pass through unfollowed (redirects, Set-Cookie),
// bodies re-encoded (fetch decodes them). Loopback only. `/__switch` is answered here and never forwarded.
const arg = (n: string, d: string) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const port = Number(arg('--port', '4317'));
const sides: Record<string, string> = { old: arg('--old', 'http://127.0.0.1:3017'), new: arg('--new', 'http://127.0.0.1:4319') };
let mode = arg('--mode', 'old');
// The money endpoints that reached a site through this origin: the tests prove none ever did.
let forwarded: { side: string; method: string; path: string }[] = [];
if (!sides[mode]) throw new Error(`switch: --mode is old or new`);

const HOP = ['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length', 'host'];
async function forward(base: string, req: Request, url: URL) {
  const headers = new Headers(req.headers);
  for (const h of HOP) headers.delete(h);
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', 'http');
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
  const r = await fetch(base + url.pathname + url.search, { method: req.method, headers, body, redirect: 'manual' });
  const out = new Headers(r.headers);
  for (const h of HOP) out.delete(h);
  out.set('x-switch-side', mode);
  return new Response(r.status === 204 || r.status === 304 || req.method === 'HEAD' ? null : await r.arrayBuffer(), { status: r.status, statusText: r.statusText, headers: out });
}

Bun.serve({
  port, hostname: '127.0.0.1', idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/__switch/forwarded') {
      if (req.method === 'POST' && url.searchParams.has('reset')) forwarded = [];
      return Response.json(forwarded);
    }
    if (/^\/api\/(purchase|refund)\//.test(url.pathname)) forwarded.push({ side: mode, method: req.method, path: url.pathname });
    if (url.pathname === '/__switch') {
      const to = url.searchParams.get('to');
      if (req.method === 'POST' && to) {
        if (!sides[to]) return new Response('to=old|new\n', { status: 400 });
        mode = to;
        console.log(`switch: now ${mode} (${sides[mode]})`);
      }
      return Response.json({ mode, target: sides[mode] });
    }
    try { return await forward(sides[mode], req, url); }
    catch (e) { return new Response(`switch: ${mode} side unreachable: ${e}\n`, { status: 502 }); }
  },
});
console.log(`switch: http://localhost:${port}/ -> ${mode} (old ${sides.old}, new ${sides.new}); POST /__switch?to=old|new`);
