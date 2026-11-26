#!/usr/bin/env bun
// Links and redirects of the composed site, served (tools/serve.ts or a preview): every internal URL the site's built
// pages, sitemap.xml, rss.xml and manifest.json name answers 200 (redirects followed), and the legacy URLs answer as
// docs/decisions.md D25 says. The Demos app's own files under /demos/app/ are its build's, not crawled.
//   bun tools/parity/links.ts <origin> [--out .vercel/output]      (exit 1 on any failure)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { DEMO_POSTS, NOT_IN_APP } from '../demos-web/legacy-posts.ts';
import { loadDemoPosts } from '../seo/site.ts';

const args = process.argv.slice(2);
const origin = (args[0] ?? 'http://127.0.0.1:4310').replace(/\/$/, '');
const i = args.indexOf('--out');
const root = join(resolve(import.meta.dir, '../..', i < 0 ? '.vercel/output' : args[i + 1]), 'static');
if (!existsSync(root)) throw new Error(`links: no composed tree at ${root}`);
const fails: string[] = [];
const fail = (s: string) => { fails.push(s); console.log(`FAIL ${s}`); };

// ---- the URLs the site names
const urls = new Set<string>();
const add = (u: string, base: string) => {
  if (!u || /^(data:|mailto:|javascript:|#|tel:)/.test(u)) return;
  let url: URL;
  try { url = new URL(u.replace(/^https:\/\/reactiive\.io/, origin), origin + base); } catch { return; }
  if (url.origin !== origin || url.pathname.startsWith('/demos/app/') && url.pathname !== '/demos/app/' && !/^\/demos\/app\/demo\/[^/]+$/.test(url.pathname)) return;
  urls.add(url.pathname + url.search);
};
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name.startsWith('.') ? [] : e.isDirectory() ? (relative(root, join(d, e.name)) === 'demos/app' ? [] : walk(join(d, e.name))) : [join(d, e.name)]));
const files = walk(root);
let pages = 0;
for (const f of files.filter((f) => f.endsWith('.html'))) {
  pages++;
  const html = readFileSync(f, 'utf8'), base = '/' + relative(root, f).replace(/index\.html$/, '');
  for (const m of html.matchAll(/\s(?:href|src|content)="([^"]+)"/g)) if (m[1].startsWith('/') || m[1].startsWith('https://reactiive.io')) add(m[1], base);
  for (const m of html.matchAll(/url\(([^)'"]+)\)/g)) if (m[1].startsWith('/')) add(m[1], base);
}
for (const f of ['sitemap.xml', 'rss.xml']) for (const m of readFileSync(join(root, f), 'utf8').matchAll(/<(?:loc|link)>([^<]+)<\/(?:loc|link)>/g)) add(m[1], '/');
for (const icon of JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).icons ?? []) add(icon.src, '/');
let ok = 0;
const list = [...urls].sort();
for (let k = 0; k < list.length; k += 16) await Promise.all(list.slice(k, k + 16).map(async (u) => {
  const r = await fetch(origin + u, { redirect: 'follow' }).catch(() => null);
  if (r?.status === 200) ok++; else fail(`${u} answers ${r?.status ?? 'nothing'}`);
}));
console.log(`links: ${pages} pages, ${list.length} unique internal URLs, ${ok} answer 200`);

// ---- the legacy URLs
const expect = async (path: string, status: number, location?: string) => {
  const r = await fetch(origin + path, { redirect: 'manual' });
  const loc = r.headers.get('location')?.replace(origin, '');
  if (r.status !== status || (location !== undefined && loc !== location)) fail(`${path}: ${r.status} ${loc ?? ''}, expected ${status} ${location ?? ''}`);
  else if (status >= 300 && status < 400) { const t = await fetch(origin + path); if (t.status !== 200) fail(`${path} → ${loc} lands on ${t.status}`); }
};
let n = 0;
for (const d of loadDemoPosts()) {
  await expect(`/demos/${d.slug}`, 200); await expect(`/demos/${d.slug}/`, 308, `/demos/${d.slug}`); await expect(`/demos/og-image/${d.slug}`, 200); n += 3;
  const html = await (await fetch(`${origin}/demos/${d.slug}`)).text();
  if (!html.includes(`<link rel="canonical" href="`) || !html.includes(`/demos/${d.slug}"`)) fail(`/demos/${d.slug}: no canonical to itself`);
  if (!html.includes(`demos/videos/${d.slug}.mp4`)) fail(`/demos/${d.slug}: no demo video`);
  if (d.app ? !html.includes(`href="/demos/app/demo/${d.app}"`) : html.includes('href="/demos/app/demo/')) fail(`/demos/${d.slug}: the try button is ${d.app ? 'missing' : 'there without a demo'}`);
}
// Live's 200s that were redirects here until D25: pages (and the signed-out account routes) answer 200.
for (const p of ['/articles/building-demos', '/articles/open-sourcing-demos', '/articles/leaving-patreon', '/articles/patreon-migration', '/series/thoughts', '/series/engineering', '/profile', '/manage-subscription']) { await expect(p, 200); n++; }
await expect('/demos/app', 308, '/demos/app/'); await expect('/demos/not-a-post', 404); await expect('/demos/app/demo/snake', 200); n += 3;
console.log(`legacy: ${n} URLs checked (${DEMO_POSTS.length} demo posts with their demo, ${NOT_IN_APP.length} without)`);
if (fails.length) { console.error(`links: ${fails.length} failure(s)`); process.exit(1); }
console.log('links: none broken');
