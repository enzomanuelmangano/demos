#!/usr/bin/env bun
// The deployable output: the site's dist at / and the Demos app's own build at /demos/, side by side, as a Vercel
// Build Output API v3 tree (.vercel/output/{config.json,static/}). Nothing is built here; the two dist trees are only
// placed and routed (docs/architecture.md §6, §10).
//
//   bun tools/compose.ts [--site dist] [--demos <demos dist>] [--out .vercel/output]
//
// --demos defaults to the cached artifact for HEAD's key (tools/demos-web/build.ts). SITE_ORIGIN (default
// https://reactiive.io) is the canonical origin written into the /demos/ head; links stay relative, so a preview links
// to itself. LEGACY_API_ORIGIN, when set, proxies /api/* to the old Next deployment (stub: unset, see docs/stubs.md).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BASE, keyAt } from './demos-web/build.ts';
import { ALIASES, LEGACY_DEMO_POSTS } from './demos-web/legacy-posts.ts';
import { demosHead } from './demos-web/head.ts';

type Route = { src?: string; dest?: string; status?: number; headers?: Record<string, string>; handle?: string; continue?: boolean };

const site = resolve(import.meta.dir, '..');
const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(name); return resolve(site, i < 0 ? fallback : process.argv[i + 1]); };
const siteDist = arg('--site', 'dist');
const out = arg('--out', '.vercel/output');
const origin = (process.env.SITE_ORIGIN ?? 'https://reactiive.io').replace(/\/$/, '');
const demosDist = (() => {
  const i = process.argv.indexOf('--demos');
  if (i >= 0) return resolve(process.argv[i + 1]);
  const { key } = keyAt('HEAD');
  return join(resolve(process.env.DEMOS_WEB_CACHE ?? join(site, '.out/demos-web')), key, 'dist');
})();
for (const [what, dir] of [['site', siteDist], ['demos', demosDist]]) if (!existsSync(join(dir, 'routes.json'))) throw new Error(`compose: no ${what} build at ${dir}`);

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const siteRoutes = readJson(join(siteDist, 'routes.json'));
const demosRoutes = readJson(join(demosDist, 'routes.json'));
if ((siteRoutes.base ?? '/') !== '/') throw new Error('compose: the site builds at /');
if (demosRoutes.base !== BASE) throw new Error(`compose: the demos build's base is ${demosRoutes.base}, not ${BASE}`);

// Paths the site build owns must stay out of /demos/: the mount is the demos app's alone.
const siteTop = readdirSync(siteDist);
if (siteTop.includes('demos')) throw new Error('compose: the site build has a demos/ path, which is the Demos app\'s mount');
for (const r of siteRoutes.routes) if (r.pattern === '/demos' || r.pattern.startsWith('/demos/')) throw new Error(`compose: site route ${r.name} (${r.pattern}) is inside the /demos mount`);

// The app's demo slugs, from the launcher list of the same tree the demos build came from.
const demosRev = (() => { try { return readJson(join(demosDist, '..', 'demos-web.json')).rev; } catch { return 'HEAD'; } })();
const appSlugs = new Set([...spawnSync('git', ['show', `${demosRev}:demos.contract`], { cwd: site, encoding: 'utf8' }).stdout.matchAll(/Demo\(slug="([^"]+)"/g)].map((m) => m[1]));
if (appSlugs.size < 100) throw new Error(`compose: ${appSlugs.size} demo slugs read from demos.contract at ${demosRev}`);
for (const [from, to] of Object.entries(ALIASES)) if (!appSlugs.has(to)) throw new Error(`compose: alias ${from} → ${to}, which the app does not have`);
const reserved = ['demo', 'open', 'atlas', 'snap', 'assets', 'modules', 'shaders'];
for (const s of LEGACY_DEMO_POSTS) if (reserved.includes(s)) throw new Error(`compose: legacy post ${s} collides with a demos app path`);

// ---------------------------------------------------------------- files
rmSync(out, { recursive: true, force: true });
const staticDir = join(out, 'static');
mkdirSync(staticDir, { recursive: true });
const skip = (rel: string) => rel === '.gen' || rel.startsWith('.gen/');
const copy = (from: string, to: string, drop: string[] = []) => cpSync(from, to, {
  recursive: true,
  filter: (p) => { const rel = relative(from, p); return !skip(rel) && !drop.includes(rel); },
});
copy(siteDist, staticDir);
// public/: files the reference serves at fixed root URLs (share images, icons, favicon, LICENSE).
const pub = join(site, 'public');
if (existsSync(pub)) for (const n of readdirSync(pub)) {
  if (existsSync(join(staticDir, n))) throw new Error(`compose: public/${n} collides with the site build's ${n}`);
  cpSync(join(pub, n), join(staticDir, n), { recursive: true });
}
// The demos' robots.txt names only its mount; the origin's robots.txt is the site's (Exact: serve discovery files at
// the root and merge them; the site's `Allow: /` already covers /demos/). The demos build has no .well-known/.
copy(demosDist, join(staticDir, 'demos'), ['robots.txt']);
if (existsSync(join(demosDist, '.well-known'))) throw new Error('compose: the demos build has .well-known/: merge it at the origin root');

// The /demos/ head: today's title, description and share card (a CI-only overlay of the built HTML, never of the
// tracked demos sources). The page is one shell for every demos route.
const head = demosHead(origin);
for (const page of ['index.html', 'shell.html']) {
  const p = join(staticDir, 'demos', page);
  const html = readFileSync(p, 'utf8');
  if (!html.includes('<title>Demos</title>')) throw new Error(`compose: demos ${page} has no <title>Demos</title>`);
  writeFileSync(p, html.replace('<title>Demos</title>', head));
}

// ---------------------------------------------------------------- routes
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternRe = (base: string, pattern: string) => '^' + esc(base.replace(/\/$/, '')) + (pattern === '/' ? '/' : pattern.split('/').map((seg: string) => (seg.startsWith(':') ? '[^/]+' : esc(seg))).join('/')) + '$';
const immutable = { 'cache-control': 'public, max-age=31536000, immutable' };

const routes: Route[] = [];
// Redirects first (Next.js's: a trailing slash drops with 308; Exact's: the mount's root gains one).
routes.push({ src: '^/demos$', status: 308, headers: { Location: '/demos/' } });
for (const slug of LEGACY_DEMO_POSTS) {
  const to = ALIASES[slug] ?? (appSlugs.has(slug) ? slug : null);
  routes.push({ src: `^/demos/${esc(slug)}/?$`, status: 308, headers: { Location: to ? `/demos/demo/${to}` : '/demos/' } });
}
// Signed-out /profile and /manage-subscription sent a visitor to /demos (client-side, in the reference); at the edge now.
routes.push({ src: '^/(?:profile|manage-subscription)/?$', status: 307, headers: { Location: '/demos/' } });
routes.push({ src: '^/((?!demos/).+)/$', status: 308, headers: { Location: '/$1' } });
if (process.env.LEGACY_API_ORIGIN) routes.push({ src: '^/api/(.*)$', dest: `${process.env.LEGACY_API_ORIGIN.replace(/\/$/, '')}/api/$1` });
// Content-named files may be cached for good (routes.json `files`).
for (const [base, r] of [['/', siteRoutes], [BASE, demosRoutes]] as const) {
  const names = Object.values(r.files as Record<string, string>).filter((n) => n !== 'app.plan');
  if (names.length) routes.push({ src: `^${esc(base)}(?:${names.map(esc).join('|')})$`, headers: immutable, continue: true });
}
// A build's generation prefix (/.exact/gen/<id>/…) names the files of that build.
routes.push({ src: '^/demos/\\.exact/gen/[0-9a-f]+/(.*)$', dest: '/demos/$1' });
routes.push({ src: '^/\\.exact/gen/[0-9a-f]+/(.*)$', dest: '/$1' });
routes.push({ handle: 'filesystem' });
// Demos: every route is render=client: its shell; any other path inside the mount: the shell with 404.
for (const r of demosRoutes.routes) if (!r.notfound) routes.push({ src: patternRe(BASE, r.pattern), dest: '/demos/shell.html' });
routes.push({ src: '^/demos/.*$', dest: '/demos/shell.html', status: 404 });
// Site: a page built ahead is its file; a render=client route its shell.
const builtPages: string[] = [];
const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n.startsWith('.')) continue; if (statSync(p).isDirectory()) walk(p); else if (n === 'index.html') builtPages.push('/' + relative(siteDist, d)); } };
walk(siteDist);
for (const page of builtPages.sort()) if (page !== '/') routes.push({ src: `^${esc(page)}$`, dest: `${page}/index.html` });
for (const r of siteRoutes.routes) if (!r.notfound && r.render === 'client') routes.push({ src: patternRe('/', r.pattern), dest: '/shell.html' });
routes.push({ src: '^/.*$', dest: existsSync(join(siteDist, '404.html')) ? '/404.html' : '/shell.html', status: 404 });

writeFileSync(join(out, 'config.json'), JSON.stringify({ version: 3, routes }, null, 2) + '\n');
console.log(`compose: ${out}: site ${builtPages.length} pages, demos at ${BASE} (${demosDist}), ${routes.length} routes`);
