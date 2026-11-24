#!/usr/bin/env bun
// Compares the <head> of every route (and the root files) of the live site with ours: tags and attributes,
// order-insensitive; JSON-LD as parsed JSON. Exit 1 when a built route differs.
//
//   bun tools/parity/head-diff.ts [--ours dist] [--ours-url http://localhost:3000] [--live https://reactiive.io]
//                                 [--route /demos]... [--strict] [--refresh] [--generated]
// --generated compares the live head with what tools/seo/metadata.ts produces, whether or not the page is built yet.
//
// Ours is read from a built tree (default dist, after tools/seo/postbuild.ts) or fetched from --ours-url. A route with
// no built page is skipped (listed), or an error with --strict. Live responses are cached for a day in .out/head-live/
// (--refresh refetches), so a run is polite to the live site.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { allPages, headTags, htmlFile, livePath, renderTags, type PageMetadata } from '../seo/metadata.ts';
import { jsonLd, jsonLdScript } from '../seo/jsonld.ts';
import { DEMOS_DESCRIPTION, NOT_PORTED, OG, SITE_URL, loadDemoPosts } from '../seo/site.ts';
import { manifestJson, robotsTxt, rssXml, sitemapXml } from '../seo/feeds.ts';

const site = resolve(import.meta.dir, '../..');
const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const live = (opt('--live') ?? 'https://reactiive.io').replace(/\/$/, '');
const oursDir = resolve(site, opt('--ours') ?? 'dist');
const oursUrl = opt('--ours-url')?.replace(/\/$/, '');
const strict = args.includes('--strict');
const generated = args.includes('--generated');
const only = args.flatMap((a, i) => (args[i - 1] === '--route' ? [a] : []));
const cacheDir = join(site, '.out/head-live');
mkdirSync(cacheDir, { recursive: true });

/** Differences that are the framework's, not the page's, and are accepted (each with its reason). */
const IGNORE: { test: (key: string) => boolean; why: string }[] = [
  { test: (k) => k.includes('name=next-size-adjust'), why: 'Next.js internal marker' },
];
const ignored = (key: string) => IGNORE.find((i) => i.test(key));

async function fetchLive(path: string): Promise<{ status: number; body: string }> {
  const f = join(cacheDir, createHash('sha1').update(live + path).digest('hex') + '.json');
  if (!args.includes('--refresh') && existsSync(f) && Date.now() - statSync(f).mtimeMs < 864e5) return JSON.parse(readFileSync(f, 'utf8'));
  const r = await fetch(live + path, { headers: { 'user-agent': 'head-diff (parity check)' } });
  const out = { status: r.status, body: await r.text() };
  writeFileSync(f, JSON.stringify(out));
  return out;
}
async function ours(path: string, file: string): Promise<string | undefined> {
  if (generated) { const m = allPages().find((p) => p.path === (path === '/this-page-does-not-exist' ? '/404' : path))!; const ld = jsonLd(m); return `<head>${renderTags(headTags(m))}${ld ? jsonLdScript(ld) : ''}</head>`; }
  if (oursUrl) { const r = await fetch(oursUrl + path); return r.ok || r.status === 404 ? await r.text() : undefined; }
  const f = join(oursDir, file);
  return existsSync(f) ? readFileSync(f, 'utf8') : undefined;
}

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([^\s=<>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    if (m.index === 0 || ['meta', 'link', 'script'].includes(m[1])) continue;
    out[m[1].toLowerCase() === 'charset' ? 'charset' : m[1]] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}
/** A tag as one comparable key; the URL query of an icon is a cache-buster (Next hashes the file). */
function keyOf(name: string, a: Record<string, string>): string {
  const b = { ...a };
  if (name === 'link' && b.rel === 'icon' && b.href) b.href = b.href.replace(/\?.*$/, '');
  return `${name}|${Object.keys(b).sort().map((k) => `${k}=${b[k]}`).join('|')}`;
}
type Head = { tags: Map<string, number>; ld: string[] };
function headOf(html: string): Head {
  const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.stringify(JSON.parse(m[1])));
  const cut = html.search(/<\/head>|<div id="exact-root"|<body/);
  let head = html.slice(0, cut < 0 ? html.length : cut).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  const tags = new Map<string, number>();
  const add = (k: string) => tags.set(k, (tags.get(k) ?? 0) + 1);
  const title = /<title>([^<]*)<\/title>/.exec(head);
  if (title) add(`title|${decode(title[1])}`);
  for (const m of head.matchAll(/<(meta|link)\b[^>]*>/g)) {
    const a = attrsOf(m[0]);
    // not part of the page's identity: resource hints and Exact's / Next's own plumbing
    if (m[1] === 'link' && ['preload', 'modulepreload', 'stylesheet', 'prefetch', 'dns-prefetch', 'preconnect'].includes(a.rel)) continue;
    add(keyOf(m[1], a));
  }
  tags.delete('meta|charset=utf-8');
  return { tags, ld: ld.sort() };
}
/** The three description tags (name=description, og:description, twitter:description). */
const DESCRIPTIONS = /\|(name=description|property=og:description|name=twitter:description)(\||$)/;
/**
 * The demo posts (docs/decisions.md D21) differ from live on purpose, in exactly these values: live's og:image
 * (/demos/og-image/<slug>) answers 404, so ours is the /demos card, in the tags and the JSON-LD; and live's description
 * was the site's (the posts had none), ours the post's first paragraph. Live's head is rewritten to those values before
 * the diff, so any other difference, or ours lacking them, still fails.
 */
function expectedLive(m: PageMetadata, l: Head): Head {
  // /demos's description is its own copy (owner, 2026-11-24, docs/decisions.md D23: "100+ animations built with Exact,
  // Rust and WebGPU"), not live's: live's three description tags are rewritten to it, nothing else.
  if (m.path === '/demos') {
    const tags = new Map<string, number>();
    for (const [k, n] of l.tags) { const key = DESCRIPTIONS.test(k) ? k.replace(/content=[^|]*/, `content=${DEMOS_DESCRIPTION}`) : k; tags.set(key, (tags.get(key) ?? 0) + n); }
    return { tags, ld: l.ld };
  }
  if (m.jsonLd?.kind !== 'demo') return l;
  const slug = m.jsonLd.slug, img = (u: string) => u.replace(`${live}/demos/og-image/${slug}`, `${SITE_URL}${OG.demos.url}`).replace(`https://reactiive.io/demos/og-image/${slug}`, `${SITE_URL}${OG.demos.url}`);
  const tags = new Map<string, number>();
  for (const [k, n] of l.tags) {
    let key = img(k);
    if (DESCRIPTIONS.test(key)) key = key.replace(/content=[^|]*/, `content=${m.description}`);
    tags.set(key, (tags.get(key) ?? 0) + n);
  }
  return { tags, ld: l.ld.map((j) => img(j)) };
}
function diffHeads(l: Head, o: Head): string[] {
  const out: string[] = [];
  for (const [k, n] of l.tags) if ((o.tags.get(k) ?? 0) < n && !ignored(k)) out.push(`  - missing in ours: ${k}`);
  for (const [k, n] of o.tags) if ((l.tags.get(k) ?? 0) < n && !ignored(k)) out.push(`  + extra in ours:   ${k}`);
  if (l.ld.join('\n') !== o.ld.join('\n')) out.push(`  ~ JSON-LD differs\n      live: ${l.ld.join(' ; ').slice(0, 400)}\n      ours: ${o.ld.join(' ; ').slice(0, 400)}`);
  return out;
}

let failed = 0, ok = 0;
const skipped: string[] = [];
const report = (label: string, lines: string[]) => { if (lines.length) { failed++; console.log(`FAIL ${label}\n${lines.join('\n')}`); } else { ok++; console.log(`ok   ${label}`); } };

for (const m of allPages()) {
  if (only.length && !only.includes(m.path)) continue;
  const lp = livePath(m.path);
  const [l, o] = [await fetchLive(lp), await ours(m.path === '/404' ? '/this-page-does-not-exist' : m.path, htmlFile(m.path))];
  const want = m.path === '/404' ? 404 : 200;
  if (o === undefined) { if (strict) report(m.path, ['  not built']); else skipped.push(m.path); continue; }
  const lines = l.status === want ? diffHeads(expectedLive(m, headOf(l.body)), headOf(o)) : [`  live answers ${l.status}, expected ${want}`];
  report(m.path, lines);
}

// The root files, as text (sitemap, robots, rss: as written; manifest: as JSON).
const files: [string, string, (s: string) => string][] = [
  ['/robots.txt', robotsTxt(), (s) => s],
  ['/sitemap.xml', sitemapXml(), (s) => s.replace(/<lastmod>[^<]*<\/lastmod>/g, (x) => x)],
  ['/rss.xml', rssXml(), (s) => s],
  ['/manifest.json', manifestJson(), (s) => JSON.stringify(JSON.parse(s))],
];
for (const [path, generated, norm] of files) {
  if (only.length) continue;
  const l = await fetchLive(path);
  const built = oursUrl ? await ours(path, path.slice(1)) : existsSync(join(oursDir, path.slice(1))) ? readFileSync(join(oursDir, path.slice(1)), 'utf8') : undefined;
  const text = built ?? generated;
  const a = norm(l.body.trim()).split('\n'), b = norm(text.trim()).split('\n');
  const lines: string[] = [];
  if (path === '/sitemap.xml' || path === '/rss.xml') {
    // Items present on both sides compare as lines; a page the port leaves out (NOT_PORTED) is named, not hidden.
    const locs = (s: string) => [...s.matchAll(/<(?:loc|link)>([^<]*)<\/(?:loc|link)>/g)].map((x) => x[1]);
    const [la, lb] = [new Set(locs(l.body)), new Set(locs(text))];
    // The four articles that present Demos are not ported (owner's scope cut): named, accepted.
    for (const u of la) if (!lb.has(u) && [...NOT_PORTED].some((n) => u.endsWith(`/articles/${n}`))) la.delete(u);
    for (const u of la) if (!lb.has(u)) lines.push(`  - not in ours: ${u}`);
    // The demo posts are listed by ours only (live left them out; D21): named, accepted, and all must be there.
    if (path === '/sitemap.xml') for (const d of loadDemoPosts()) { const u = `${SITE_URL}/demos/${d.slug}`; if (lb.has(u)) lb.delete(u); else lines.push(`  - demo post not listed: ${u}`); }
    for (const u of lb) if (!la.has(u)) lines.push(`  + only in ours: ${u}`);
    if (!lines.length && locs(l.body).filter((u) => la.has(u)).join() !== locs(text).filter((u) => la.has(u)).join()) lines.push('  ~ same URLs, different order');
    if (!lines.length && !NOT_PORTED.size) { const x = a.filter((s, i) => s !== b[i]); if (x.length) lines.push(`  ~ ${x.length} lines differ, first: ${x[0]}`); }
  } else {
    a.forEach((s, i) => { if (s !== b[i]) lines.push(`  ~ line ${i + 1}: live ${JSON.stringify(s)} ours ${JSON.stringify(b[i])}`); });
    if (b.length > a.length) lines.push('  + ours has more lines');
  }
  report(`${path}${built === undefined ? ' (generator output; not in the built tree)' : ''}`, lines);
}
console.log(`\n${ok} ok, ${failed} different${skipped.length ? `, ${skipped.length} not built (skipped): ${skipped.join(' ')}` : ''}`);
process.exit(failed ? 1 : 0);
