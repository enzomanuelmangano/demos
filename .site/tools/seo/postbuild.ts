#!/usr/bin/env bun
// After `web-build`: the live site's head on every built page, JSON-LD, and the root files (docs/architecture.md §7).
//
//   bun tools/seo/postbuild.ts [dist]
//
// Exact writes a default head (title, description, canonical, a short og/twitter set, a placeholder icon, a relative
// manifest link). Each tag of that set is replaced by the tags of tools/seo/metadata.ts, at the title's place; the page's
// own `head title=…` stays the source of the title, and this checks the two agree. Also written into the dist root:
// sitemap.xml, robots.txt, rss.xml, manifest.json (these replace Exact's generated ones). favicon.ico, the pwa icons
// and the share cards are public/ files, placed by tools/compose.ts. A page the metadata table does not know, or a table
// entry with no built page, is an error (a page must say what it is).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { allPages, headTags, htmlFile, renderTags } from './metadata.ts';
import { jsonLd, jsonLdScript } from './jsonld.ts';
import { manifestJson, robotsTxt, rssXml, sitemapXml } from './feeds.ts';

const dist = resolve(process.argv[2] ?? join(import.meta.dir, '../../dist'));
if (!existsSync(join(dist, 'routes.json'))) throw new Error(`seo: ${dist} has no routes.json: run web-build first`);

// What Exact's default head holds that ours replaces (everything before the page's own markup).
const REPLACED = [
  /<title>[^<]*<\/title>/,
  /<meta name="viewport"[^>]*>/,
  /<meta name="description"[^>]*>/,
  /<meta name="robots"[^>]*>/,
  /<link rel="canonical"[^>]*>/,
  /<link rel="manifest"[^>]*>/,
  /<link rel="icon"[^>]*>/,
  /<meta property="og:[^"]*"[^>]*>/g,
  /<meta name="twitter:[^"]*"[^>]*>/g,
];
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const pages = allPages();
const known = new Set(pages.map((p) => htmlFile(p.path)));
const built = readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter((f) => !f.split('/').some((s) => s.startsWith('.')) && (f.endsWith('index.html') || f === '404.html')).map((f) => f.split('\\').join('/'));
for (const f of built) if (!known.has(f)) throw new Error(`seo: ${f} is built but the metadata table (tools/seo/metadata.ts allPages) has no entry for it`);

let done = 0;
const missing: string[] = [];
for (const m of pages) {
  const file = join(dist, htmlFile(m.path));
  if (!existsSync(file)) { missing.push(m.path); continue; }
  let html = readFileSync(file, 'utf8');
  const cut = html.search(/<div id="exact-root"|<body/);
  let head = html.slice(0, cut < 0 ? html.length : cut);
  const rest = html.slice(head.length);
  if (head.includes('rel="canonical"') === false) throw new Error(`seo: ${file}: no Exact default head to replace`);
  // Not idempotent: a second pass would keep the first pass's tags that Exact's head lacks (author, publisher, ...).
  if (head.includes('name="publisher"')) throw new Error(`seo: ${file}: already post-built: run web-build again first (bun run build)`);
  const own = /<title>([^<]*)<\/title>/.exec(head)?.[1];
  const tags = headTags(m);
  const want = (tags.find((t) => t.tag === 'title') as { text: string }).text;
  if (own !== undefined && decode(own) !== want) throw new Error(`seo: ${m.path}: the page's head title is "${decode(own)}", the metadata table says "${want}": make them agree`);
  const [title, ...others] = REPLACED;
  head = head.replace(title, '\u0000');
  for (const re of others) head = head.replace(re.global ? new RegExp(re.source, 'g') : re, '');
  // charset is Exact's (and ours): written once, at the head's start.
  const generated = renderTags(tags.filter((t) => !(t.tag === 'meta' && 'charset' in t.attrs)));
  const ld = jsonLd(m);
  // The articles' YouTube and X frames load lazily (the browser's own `loading="lazy"`, which Exact's `iframe` does
  // not take): no `intersect` node, so they never start the page's runtime (docs/decisions.md D16).
  const body = rest.replace(/<iframe (?![^>]*\bloading=)(?=[^>]*\btitle="(?:YouTube video player|X post)")/g, '<iframe loading="lazy" ');
  html = head.replace('\u0000', generated + (ld ? jsonLdScript(ld) : '')) + body;
  writeFileSync(file, html);
  done++;
}
writeFileSync(join(dist, 'sitemap.xml'), sitemapXml());
writeFileSync(join(dist, 'robots.txt'), robotsTxt());
writeFileSync(join(dist, 'rss.xml'), rssXml());
writeFileSync(join(dist, 'manifest.json'), manifestJson());
console.log(`seo: head + JSON-LD on ${done} pages (${missing.length ? `not built: ${missing.join(' ')}` : 'all built'}), sitemap.xml, robots.txt, rss.xml, manifest.json`);
