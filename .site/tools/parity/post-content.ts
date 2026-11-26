#!/usr/bin/env bun
// A demo post (and the four articles ported with them, docs/decisions.md D25) says what live's says, in the static
// HTML: for each of the 126 /demos/<slug> and those articles, live's page is read and ours is searched, without a
// script run, for every heading, paragraph, list item and code block of live's <main> (compared with the whitespace
// taken out), every heading at its level, every link, picture and video. Exit 1 when one is missing.
//   bun tools/parity/post-content.ts [--ours dist] [--live https://reactiive.io] [--refresh] [--route /demos/x]
// Live's pages are cached for a day in .out/head-live/ (shared with head-diff.ts). The accepted differences: the
// GitHub links to src/animations/<name> (404 on GitHub) point at .legacy/, and live's two modal buttons are mail links.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LEGACY_DEMO_POSTS } from '../demos-web/legacy-posts.ts';

const site = resolve(import.meta.dir, '../..');
const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const live = (opt('--live') ?? 'https://reactiive.io').replace(/\/$/, '');
const dist = resolve(site, opt('--ours') ?? 'dist');
const cache = join(site, '.out/head-live');
mkdirSync(cache, { recursive: true });
const routes = opt('--route') ? [opt('--route')!] : [...LEGACY_DEMO_POSTS.map((s) => `/demos/${s}`), '/articles/building-demos', '/articles/open-sourcing-demos', '/articles/leaving-patreon', '/articles/patreon-migration'];

async function page(path: string): Promise<{ status: number; body: string }> {
  const f = join(cache, createHash('sha1').update(live + path).digest('hex') + '.json');
  if (!args.includes('--refresh') && existsSync(f) && Date.now() - statSync(f).mtimeMs < 864e5) return JSON.parse(readFileSync(f, 'utf8'));
  const r = await fetch(live + path, { headers: { 'user-agent': 'post-content (parity check)' } });
  const out = { status: r.status, body: await r.text() };
  writeFileSync(f, JSON.stringify(out));
  return out;
}
const decode = (s: string) => s.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const main = (html: string) => (/<main\b[\s\S]*<\/main>/.exec(html)?.[0] ?? '').replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g, '').replace(/<!--[\s\S]*?-->/g, '');
const text = (html: string) => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, '');
const all = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);
const attr = (html: string, tag: string, name: string) => all(html, new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]*)"`, 'g')).map(decode);
const moved = (u: string) => /^https:\/\/github\.com\/enzomanuelmangano\/demos\/tree\/main\/src\/animations\//.test(u);

const fails: string[] = [];
let ok = 0, blocks = 0, codes = 0, headings = 0, links = 0, media = 0;
const check = async (path: string) => {
  const l = await page(path);
  const file = join(dist, path.slice(1), 'index.html');
  if (l.status !== 200) { fails.push(`${path}: live answers ${l.status}`); return; }
  if (!existsSync(file)) { fails.push(`${path}: not built`); return; }
  const a = main(l.body), b = main(readFileSync(file, 'utf8'));
  const ours = text(b), missing: string[] = [];
  for (const m of a.matchAll(/<(h[1-4]|p|li|pre)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const t = text(m[2]);
    if (!t) continue;
    blocks++; if (m[1] === 'pre') codes++;
    if (!ours.includes(t)) missing.push(`${m[1]} ${JSON.stringify(t.slice(0, 80))}`);
  }
  const heads = (s: string) => [...s.matchAll(/<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => `${m[1]} ${text(m[2])}`);
  const mine = heads(b);
  for (const h of heads(a)) { headings++; if (!mine.includes(h)) missing.push(`heading ${h.slice(0, 80)}`); }
  const hrefs = new Set(attr(b, 'a', 'href'));
  for (const u of attr(a, 'a', 'href')) {
    if (u === '#main') continue;
    links++;
    if (!hrefs.has(u) && !(moved(u) && [...hrefs].some((h) => h.includes('/.legacy/src/animations')))) missing.push(`link ${u}`);
  }
  const srcs = new Set([...attr(b, 'img', 'src'), ...attr(b, 'video', 'src'), ...attr(b, 'iframe', 'src')]);
  for (const u of attr(a, 'video', 'src')) { media++; if (!srcs.has(u)) missing.push(`video ${u}`); }
  // Live's pictures: the avatars of its cards by URL; its own files by name (ours are the pipeline's copies).
  for (const u of attr(a, 'img', 'src')) {
    media++;
    const name = decodeURIComponent(u).split('?')[0].split('/').pop()!.replace(/\.[a-z0-9]+$/i, '').split('.')[0];
    if (!/avatars\.githubusercontent/.test(u) && ![...srcs].some((s) => s.includes(name))) missing.push(`image ${u}`);
  }
  if (missing.length) fails.push(`${path}\n    ${missing.slice(0, 8).join('\n    ')}${missing.length > 8 ? `\n    (${missing.length - 8} more)` : ''}`); else ok++;
};
for (let i = 0; i < routes.length; i += 6) await Promise.all(routes.slice(i, i + 6).map(check));
for (const f of fails.sort()) console.log(`FAIL ${f}`);
console.log(`post-content: ${ok}/${routes.length} pages hold all of live's (${blocks} text blocks, ${codes} of them code, ${headings} headings, ${links} links, ${media} pictures and videos)`);
process.exit(fails.length ? 1 : 0);
