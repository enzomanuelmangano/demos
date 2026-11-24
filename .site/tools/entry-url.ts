#!/usr/bin/env bun
// Safari: every built page names the runtime's module as data-entry="./app-<hash>.js", which the page's inline loaders
// (Exact's activation script, and web/reveal.js's early Sign In and menu) pass to import(). Chrome resolves that
// against the page's <base href="/">; WebKit resolves an inline script's import() against the document's address and
// ignores the <base>, so on any nested page (/articles/<slug>, /series/<slug>, /docs/<page>, the demo posts
// /demos/<slug>) Safari fetched /articles/app-<hash>.js or /demos/app-<hash>.js: the runtime never started (no in-app
// navigation, no framed Demos app on a demo post's deep link). Written root-relative here, the same file for every
// engine. Run right after web-build:
//   bun tools/entry-url.ts [dist]      (exit 1 when a page's runtime entry is not root-relative after it, or none is found)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(import.meta.dir, '..', process.argv[2] ?? 'dist');
const routes = JSON.parse(readFileSync(join(dist, 'routes.json'), 'utf8'));
const base: string = routes.base ?? '/';
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error(`entry-url: the build's base ${base} is not an absolute directory`);

// Every page with the runtime's checkpoint script must end with a root-relative entry (one written here, or by an
// earlier run: a re-run is a no-op). A page that keeps another entry, or a build where nothing names an entry at all,
// fails the build: Safari would not start that page's runtime.
let pages = 0, entries = 0, already = 0;
const bad: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!name.endsWith('.html')) continue;
    const html = readFileSync(p, 'utf8');
    let n = 0;
    const out = html.replace(/\bdata-entry="([^"]*)"/g, (all, url: string) => {
      if (url.startsWith('/')) { already++; return all; }
      if (!url.startsWith('./') || url.includes('..')) { bad.push(`${p}: data-entry="${url}"`); return all; }
      n++;
      return `data-entry="${base}${url.slice(2)}"`;
    });
    if (n) { writeFileSync(p, out); pages++; entries += n; }
    for (const tag of out.match(/<script\b[^>]*\btype="application\/vnd\.exact\.checkpoint"[^>]*>/g) ?? [])
      if (!/\bdata-entry="\//.test(tag)) bad.push(`${p}: a checkpoint script without a root-relative data-entry`);
  }
};
walk(dist);
if (bad.length) { console.error(`entry-url: ${bad.length} page(s) Safari could not start:\n  ${bad.slice(0, 20).join('\n  ')}`); process.exit(1); }
if (entries + already === 0) { console.error(`entry-url: no page in ${dist} names a runtime entry (data-entry): the build's loader changed; check tools/entry-url.ts`); process.exit(1); }
console.log(`entry-url: ${entries} runtime entries made root-relative in ${pages} pages${already ? ` (${already} already were)` : ''}`);
