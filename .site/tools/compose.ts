#!/usr/bin/env bun
// The deployable output: the site's dist at / and the Demos app's own build at /demos/app/ (shown inside the site's
// /demos page, docs/decisions.md D10), side by side, as a Vercel
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
import { patchDemos } from './demos-web/patches.ts';
import { NOT_PORTED_REDIRECTS } from './seo/site.ts';

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

// /demos is the site's page; everything under /demos/ is the Demos app's mount (/demos/app/) or a redirect into it.
const MOUNT = BASE.replace(/\/$/, '');
if (existsSync(join(siteDist, MOUNT.slice(1)))) throw new Error(`compose: the site build has ${MOUNT}/, the Demos app's mount`);
if (existsSync(join(siteDist, 'demos')) && readdirSync(join(siteDist, 'demos')).some((n) => n !== 'index.html')) throw new Error('compose: the site build has paths under /demos/');
for (const r of siteRoutes.routes) if (r.pattern.startsWith('/demos/')) throw new Error(`compose: site route ${r.name} (${r.pattern}) is under /demos/, the Demos app's`);

// The app's demo slugs, from the launcher list of the same tree the demos build came from.
const demosRev = (() => { try { return readJson(join(demosDist, '..', 'demos-web.json')).rev; } catch { return 'HEAD'; } })();
const appSlugs = new Set([...spawnSync('git', ['show', `${demosRev}:demos.contract`], { cwd: site, encoding: 'utf8' }).stdout.matchAll(/Demo\(slug="([^"]+)"/g)].map((m) => m[1]));
if (appSlugs.size < 100) throw new Error(`compose: ${appSlugs.size} demo slugs read from demos.contract at ${demosRev}`);
for (const [from, to] of Object.entries(ALIASES)) if (!appSlugs.has(to)) throw new Error(`compose: alias ${from} → ${to}, which the app does not have`);
const reserved = ['demo', 'open', 'atlas', 'snap', 'assets', 'modules', 'shaders'];
for (const s of LEGACY_DEMO_POSTS) if (reserved.includes(s) || (s as string) === 'app') throw new Error(`compose: legacy post ${s} collides with a demos app path`);

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
copy(demosDist, join(staticDir, MOUNT.slice(1)), ['robots.txt']);
if (existsSync(join(demosDist, '.well-known'))) throw new Error('compose: the demos build has .well-known/: merge it at the origin root');
// Exact web-host fixes the pinned Exact lacks (tools/demos-web/patches.ts, decisions.md D18).
const patched = patchDemos(join(staticDir, MOUNT.slice(1)));
for (const { file, why } of patched) console.log(`compose: patched ${file}: ${why}`);

// The /demos/app/ head: /demos's title, description and share card (a CI-only overlay of the built HTML, never of the
// tracked demos sources). The page is one shell for every demos route.
const head = demosHead(origin);
// The framed-app bridge (tools/demos-web/bridge.js: messages, history in place, the transparent stage in the sandboxed
// frame): the site's, written into the artifact's HTML here, never into the Demos app's sources (isolation.md §6).
const bridge = readFileSync(join(site, 'tools/demos-web/bridge.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//, '').trim();
if (bridge.includes('</script')) throw new Error('compose: the bridge cannot be inlined');
const bridgeScript = `<script>${bridge}</script>`;
for (const page of ['index.html', 'shell.html']) {
  const p = join(staticDir, MOUNT.slice(1), page);
  const html = readFileSync(p, 'utf8');
  if (!html.includes('<title>Demos</title>')) throw new Error(`compose: demos ${page} has no <title>Demos</title>`);
  writeFileSync(p, html.replace('<title>Demos</title>', head + bridgeScript));
}

// ---------------------------------------------------------------- routes
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternRe = (base: string, pattern: string) => '^' + esc(base.replace(/\/$/, '')) + (pattern === '/' ? '/' : pattern.split('/').map((seg: string) => (seg.startsWith(':') ? '[^/]+' : esc(seg))).join('/')) + '$';
const immutable = { 'cache-control': 'public, max-age=31536000, immutable' };

const routes: Route[] = [];
// Redirects first (Next.js's: a trailing slash drops with 308; Exact's: the mount's root gains one).
routes.push({ src: `^${esc(MOUNT)}$`, status: 308, headers: { Location: BASE } });
// A legacy demo post opens that demo in the app, full window (D5, D10); a demo the app lacks, the /demos page.
for (const slug of LEGACY_DEMO_POSTS) {
  const to = ALIASES[slug] ?? (appSlugs.has(slug) ? slug : null);
  // A demo the app has: 308 (permanent, the same demo). One it lacks: 307 to the launcher (not a permanent equivalent).
  routes.push({ src: `^/demos/${esc(slug)}/?$`, status: to ? 308 : 307, headers: { Location: to ? `${BASE}demo/${to}` : '/demos' } });
}
// Signed-out /profile and /manage-subscription sent a visitor to /demos (client-side, in the reference); at the edge now.
// With the accounts' API behind /api/* (LEGACY_API_ORIGIN), /profile and /manage-subscription (a subscription's status
// and its cancel only, docs/stubs.md) are the site's pages (components/account), which send a signed-out reader there.
if (!process.env.LEGACY_API_ORIGIN) routes.push({ src: '^/(?:profile|manage-subscription)/?$', status: 307, headers: { Location: '/demos' } });
// The content not ported (Demos-tied articles and their two series, docs/decisions.md D13): permanent redirects.
for (const [from, to] of Object.entries(NOT_PORTED_REDIRECTS)) routes.push({ src: `^${esc(from)}/?$`, status: 308, headers: { Location: to } });
routes.push({ src: `^/((?!${esc(MOUNT.slice(1))}/).+)/$`, status: 308, headers: { Location: '/$1' } });
// The articles' images keep their live URL (og:image, JSON-LD and external caches name it): /content-assets/… is the content pipeline's assets/content/….
routes.push({ src: '^/content-assets/(.*)$', dest: '/assets/content/$1' });
if (process.env.LEGACY_API_ORIGIN) routes.push({ src: '^/api/(.*)$', dest: `${process.env.LEGACY_API_ORIGIN.replace(/\/$/, '')}/api/$1` });
// /demos frames the app sandboxed (no allow-same-origin: an opaque origin, so Chrome runs it in a renderer process of
// its own, off the page's main thread; decisions.md D12): its scripts, wasm and fonts are then CORS fetches. Public,
// static and credential-free, so any origin may read them.
routes.push({ src: `^${esc(BASE)}.*$`, headers: { 'Access-Control-Allow-Origin': '*' }, continue: true });
// Content-named files may be cached for good (routes.json `files`).
for (const [base, r] of [['/', siteRoutes], [BASE, demosRoutes]] as const) {
  // A patched file's content no longer matches the hash in its name (tools/demos-web/patches.ts): it is revalidated
  // like any unnamed file, never cached for good, so a fix to the patch reaches every reader.
  const names = Object.values(r.files as Record<string, string>).filter((n) => n !== 'app.plan' && !(base === BASE && patched.some((p) => p.file === n)));
  if (names.length) routes.push({ src: `^${esc(base)}(?:${names.map(esc).join('|')})$`, headers: immutable, continue: true });
}
// The site's fonts: their URLs carry a content hash (?v=, tools/head.ts), so they may be cached for good.
routes.push({ src: '^/assets/fonts/.*$', headers: immutable, continue: true });
// A build's generation prefix (/.exact/gen/<id>/…) names the files of that build.
routes.push({ src: `^${esc(MOUNT)}/\\.exact/gen/[0-9a-f]+/(.*)$`, dest: `${BASE}$1` });
routes.push({ src: '^/\\.exact/gen/[0-9a-f]+/(.*)$', dest: '/$1' });
routes.push({ handle: 'filesystem' });
// Demos: every route is render=client: its shell; any other path inside the mount: the shell with 404.
for (const r of demosRoutes.routes) if (!r.notfound) routes.push({ src: patternRe(BASE, r.pattern), dest: `${BASE}shell.html` });
routes.push({ src: `^${esc(MOUNT)}/.*$`, dest: `${BASE}shell.html`, status: 404 });
// Site: a page built ahead is its file; a render=client route its shell.
const builtPages: string[] = [];
const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n.startsWith('.')) continue; if (statSync(p).isDirectory()) walk(p); else if (n === 'index.html') builtPages.push('/' + relative(siteDist, d)); } };
walk(siteDist);
for (const page of builtPages.sort()) if (page !== '/') routes.push({ src: `^${esc(page)}$`, dest: `${page}/index.html` });
for (const r of siteRoutes.routes) if (!r.notfound && r.render === 'client') routes.push({ src: patternRe('/', r.pattern), dest: '/shell.html' });
routes.push({ src: '^/.*$', dest: existsSync(join(siteDist, '404.html')) ? '/404.html' : '/shell.html', status: 404 });

writeFileSync(join(out, 'config.json'), JSON.stringify({ version: 3, routes }, null, 2) + '\n');
console.log(`compose: ${out}: site ${builtPages.length} pages, demos at ${BASE} (${demosDist}), ${routes.length} routes`);
