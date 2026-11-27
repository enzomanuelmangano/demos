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
import { basename, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BASE, keyAt } from './demos-web/build.ts';
import { ALIASES, DEMO_POSTS, LEGACY_DEMO_POSTS, NOT_IN_APP } from './demos-web/legacy-posts.ts';
import { demosHead } from './demos-web/head.ts';
import { patchDemos } from './demos-web/patches.ts';
import { optimizeDemos } from './demos-web/optimize.ts';
import { EXACT_PLACEHOLDER_ICON, ICON_TAGS, renderTags } from './seo/metadata.ts';

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

// /demos is the site's page, and so is each demo post (/demos/<slug>, D25: the article, the phone beside it);
// everything else under /demos/ is the Demos app's mount (/demos/app/), a share image, a redirect, or a 404.
const MOUNT = BASE.replace(/\/$/, '');
const postSlugs = new Set<string>(LEGACY_DEMO_POSTS);
if (existsSync(join(siteDist, MOUNT.slice(1)))) throw new Error(`compose: the site build has ${MOUNT}/, the Demos app's mount`);
if (existsSync(join(siteDist, 'demos'))) for (const n of readdirSync(join(siteDist, 'demos'))) if (n !== 'index.html' && !postSlugs.has(n)) throw new Error(`compose: the site build has /demos/${n}, which is not a demo post`);
for (const s of postSlugs) if (!existsSync(join(siteDist, 'demos', s, 'index.html'))) throw new Error(`compose: the site build lacks the demo post /demos/${s}`);
for (const r of siteRoutes.routes) if (r.pattern.startsWith('/demos/') && !(r.name === 'demoPost' && r.pattern === '/demos/:demo' && r.render === 'build')) throw new Error(`compose: site route ${r.name} (${r.pattern}) is under /demos/, the Demos app's`);

// The app's demo slugs, from the launcher list of the same tree the demos build came from. demos.contract is a key
// input (tools/demos-web/build.ts isInput), so an artifact keyed by HEAD's inputs was built from HEAD's demos.contract:
// read it at HEAD (a CI clone is shallow; the commit the cached artifact was built at, main's, is not in it). Any other
// artifact (--demos): at its recorded commit when this clone has it; else at HEAD only when the demos.contract blob it
// recorded is HEAD's, and the compose fails if it is not.
const gitIn = (...a: string[]) => spawnSync('git', a, { cwd: site, encoding: 'utf8' });
const demosRev = (() => {
  let record: { key?: string; rev?: string; contract?: string };
  try { record = readJson(join(demosDist, '..', 'demos-web.json')); } catch { return 'HEAD'; }
  if (record.key === keyAt('HEAD').key) return 'HEAD';
  if (record.rev && gitIn('cat-file', '-e', `${record.rev}^{commit}`).status === 0) return record.rev;
  const head = gitIn('rev-parse', 'HEAD:demos.contract').stdout.trim();
  if (record.contract && record.contract === head) return 'HEAD';
  throw new Error(`compose: the demos build was made at ${record.rev}, which this clone lacks, and its demos.contract (${record.contract ?? 'not recorded'}) is not HEAD's (${head}): fetch ${record.rev} or rebuild the artifact`);
})();
const appSlugs = new Set([...gitIn('show', `${demosRev}:demos.contract`).stdout.matchAll(/Demo\(slug="([^"]+)"/g)].map((m) => m[1]));
if (appSlugs.size < 100) throw new Error(`compose: ${appSlugs.size} demo slugs read from demos.contract at ${demosRev}`);
for (const [from, to] of Object.entries(ALIASES)) if (!appSlugs.has(to)) throw new Error(`compose: alias ${from} → ${to}, which the app does not have`);
// Each post's demo is the app's (its icon is what the phone opens), and each post kept out really lacks one.
for (const { slug, app } of DEMO_POSTS) if (!appSlugs.has(app)) throw new Error(`compose: demo post ${slug} opens ${app}, which the app does not have (move it to NOT_IN_APP)`);
for (const slug of NOT_IN_APP) if (appSlugs.has(slug) || ALIASES[slug]) throw new Error(`compose: ${slug} is in NOT_IN_APP but the app has it: make it a demo post`);
// The page's driver (web/sim-goto.js) maps a post to its app slug by the same aliases.
const goto = readFileSync(join(site, 'web/sim-goto.js'), 'utf8');
for (const [from, to] of Object.entries(ALIASES)) if (!goto.includes(`'${from}': '${to}'`)) throw new Error(`compose: web/sim-goto.js lacks the alias '${from}': '${to}'`);
const reserved = ['demo', 'open', 'atlas', 'snap', 'assets', 'modules', 'shaders', 'og-image'];
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
// The articles' images at live's URLs (og:image, JSON-LD, image search and external caches name them): live serves every
// file of a page's images/ at /content-assets/<kind>/<slug>/images/…, so the originals are placed there. The pages load
// the content pipeline's optimised variants (/assets/content/…).
const content = join(site, '.content');
if (existsSync(join(staticDir, 'content-assets'))) throw new Error("compose: the site build already has a content-assets/, which collides with live's image URLs");
for (const kind of ['articles', 'docs', 'demos']) for (const slug of readdirSync(join(content, kind))) {
  const images = join(content, kind, slug, 'images');
  if (existsSync(images)) cpSync(images, join(staticDir, 'content-assets', kind, slug, 'images'), { recursive: true, filter: (p) => !basename(p).startsWith('.') });
}
// The demos' robots.txt names only its mount; the origin's robots.txt is the site's (Exact: serve discovery files at
// the root and merge them; the site's `Allow: /` already covers /demos/). The demos build has no .well-known/.
copy(demosDist, join(staticDir, MOUNT.slice(1)), ['robots.txt']);
if (existsSync(join(demosDist, '.well-known'))) throw new Error('compose: the demos build has .well-known/: merge it at the origin root');
// Exact web-host fixes the pinned Exact lacks (tools/demos-web/patches.ts, decisions.md D18).
const patched = patchDemos(join(staticDir, MOUNT.slice(1)));
for (const { file, why } of patched) console.log(`compose: patched ${file}: ${why}`);
// Lighter assets (tools/demos-web/optimize.ts); the files it rewrote are revalidated like the patched ones.
patched.push(...(await optimizeDemos(join(staticDir, MOUNT.slice(1)))));

// The /demos/app/ head: /demos's title, description and share card (a CI-only overlay of the built HTML, never of the
// tracked demos sources). The page is one shell for every demos route.
const head = demosHead(origin);
// The framed-app bridge (tools/demos-web/bridge.js: messages, history in place, the transparent stage in the sandboxed
// frame): the site's, written into the artifact's HTML here, never into the Demos app's sources (isolation.md §6).
const bridge = readFileSync(join(site, 'tools/demos-web/bridge.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//, '').trim();
if (bridge.includes('</script')) throw new Error('compose: the bridge cannot be inlined');
// The framed desktop phone's iOS keyboard (tools/demos-web/keyboard.js): the same kind of site code, inlined after the
// bridge; it runs only in a frame with a fine pointer and builds its nodes on the first focus in the drawn phone.
const keyboard = readFileSync(join(site, 'tools/demos-web/keyboard.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//, '').trim();
if (keyboard.includes('</script')) throw new Error('compose: the keyboard cannot be inlined');
// A mouse drags the framed app's scroll views as a finger does (tools/demos-web/mouse-scroll.js: 1:1, the rubber band,
// UIScrollView's deceleration and paging, no tap from a drag): the same kind of site code, inlined after the keyboard.
const mouseScroll = readFileSync(join(site, 'tools/demos-web/mouse-scroll.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//, '').trim();
if (mouseScroll.includes('</script')) throw new Error('compose: the mouse scroll cannot be inlined');
// The app's demos that have an article: the framed app's menus offer "Read article" for these alone (D25).
const articles = `window.__reactiiveArticles=${JSON.stringify(DEMO_POSTS.map((d) => d.app))};`;
const bridgeScript = `<script>${articles}${bridge}</script><script>${keyboard}</script><script>${mouseScroll}</script>`;
for (const page of ['index.html', 'shell.html']) {
  const p = join(staticDir, MOUNT.slice(1), page);
  const html = readFileSync(p, 'utf8');
  if (!html.includes('<title>Demos</title>')) throw new Error(`compose: demos ${page} has no <title>Demos</title>`);
  // The site's icon, not Exact's placeholder (a reader who opens /demos/app/ itself sees the tab's icon).
  writeFileSync(p, html.replace('<title>Demos</title>', () => head + bridgeScript).replace(EXACT_PLACEHOLDER_ICON, () => renderTags(ICON_TAGS)));
}

if (existsSync(join(staticDir, 'signed-out.html'))) throw new Error('compose: signed-out.html collides with the site build');
writeFileSync(join(staticDir, 'signed-out.html'), '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta http-equiv="refresh" content="0;url=/demos"><title>Reactiive</title><body style="background:#0c0c0e"><a href="/demos">Demos</a>\n');

// ---------------------------------------------------------------- routes
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternRe = (base: string, pattern: string) => '^' + esc(base.replace(/\/$/, '')) + (pattern === '/' ? '/' : pattern.split('/').map((seg: string) => (seg.startsWith(':') ? '[^/]+' : esc(seg))).join('/')) + '$';
const immutable = { 'cache-control': 'public, max-age=31536000, immutable' };

const routes: Route[] = [];
// Redirects first (Next.js's: a trailing slash drops with 308; Exact's: the mount's root gains one).
routes.push({ src: `^${esc(MOUNT)}$`, status: 308, headers: { Location: BASE } });
routes.push({ src: `^/((?!${esc(MOUNT.slice(1))}/).+)/$`, status: 308, headers: { Location: '/$1' } });
// A demo post's share image keeps live's URL (its head names it; live's own answers 404): the /demos card (D25).
for (const src of alternations('^/demos/og-image/', LEGACY_DEMO_POSTS.map(esc), '$')) routes.push({ src, dest: '/og/demos.png' });
// Signed out (no accounts' API), /profile and /manage-subscription are 200 as live's, and send the visitor to /demos
// in the page, as live's did (D25). With the API behind /api/* (LEGACY_API_ORIGIN) they are the site's pages
// (components/account), which send a signed-out reader there.
if (!process.env.LEGACY_API_ORIGIN) routes.push({ src: '^/(?:profile|manage-subscription)$', dest: '/signed-out.html' });
if (process.env.LEGACY_API_ORIGIN) routes.push({ src: '^/api/(.*)$', dest: `${process.env.LEGACY_API_ORIGIN.replace(/\/$/, '')}/api/$1` });
// /demos frames the app sandboxed (no allow-same-origin: an opaque origin, so Chrome runs it in a renderer process of
// its own, off the page's main thread; decisions.md D12): its scripts, wasm and fonts are then CORS fetches. Public,
// static and credential-free, so any origin may read them.
routes.push({ src: `^${esc(BASE)}.*$`, headers: { 'Access-Control-Allow-Origin': '*' }, continue: true });
// Vercel refuses a route whose `src` is longer than 4096 characters ("Builder returned invalid routes"): an
// alternation of many names is split into as many routes as it takes, each under the limit.
function alternations(head: string, items: string[], tail: string, max = 3800) {
  const out: string[] = [];
  let cur: string[] = [];
  const src = (xs: string[]) => `${head}(?:${xs.join('|')})${tail}`;
  for (const x of items) {
    if (cur.length && src([...cur, x]).length > max) { out.push(src(cur)); cur = []; }
    cur.push(x);
  }
  if (cur.length) out.push(src(cur));
  return out;
}
// Content-named files may be cached for good (routes.json `files`).
for (const [base, r] of [['/', siteRoutes], [BASE, demosRoutes]] as const) {
  // A patched file's content no longer matches the hash in its name (tools/demos-web/patches.ts): it is revalidated
  // like any unnamed file, never cached for good, so a fix to the patch reaches every reader.
  const names = Object.values(r.files as Record<string, string>).filter((n) => n !== 'app.plan' && !(base === BASE && patched.some((p) => p.file === n)));
  for (const src of alternations(`^${esc(base)}`, names.map(esc), '$')) routes.push({ src, headers: immutable, continue: true });
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

for (const r of routes) if ('src' in r && typeof r.src === 'string' && r.src.length > 4096) throw new Error(`compose: a route of ${r.src.length} characters (Vercel refuses over 4096): ${r.src.slice(0, 80)}`);
writeFileSync(join(out, 'config.json'), JSON.stringify({ version: 3, routes }, null, 2) + '\n');
console.log(`compose: ${out}: site ${builtPages.length} pages, demos at ${BASE} (${demosDist}), ${routes.length} routes`);
