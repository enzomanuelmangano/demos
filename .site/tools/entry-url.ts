#!/usr/bin/env bun
// Safari: every built page names the runtime's module as data-entry="./app-<hash>.js", which the page's inline loaders
// (Exact's activation script, and web/reveal.js's early Sign In and menu) pass to import(). Chrome resolves that
// against the page's <base href="/">; WebKit resolves an inline script's import() against the document's address and
// ignores the <base>, so on any nested page (/articles/<slug>, /series/<slug>, /docs/<page>, the demo posts
// /demos/<slug>) Safari fetched /articles/app-<hash>.js or /demos/app-<hash>.js: the runtime never started (no in-app
// navigation, no framed Demos app on a demo post's deep link). Written root-relative here, the same file for every
// engine. Run right after web-build:
//   bun tools/entry-url.ts [dist]      (exit 1 when a page names an entry this cannot make absolute)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(import.meta.dir, '..', process.argv[2] ?? 'dist');
const routes = JSON.parse(readFileSync(join(dist, 'routes.json'), 'utf8'));
const base: string = routes.base ?? '/';
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error(`entry-url: the build's base ${base} is not an absolute directory`);

let pages = 0, entries = 0;
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!name.endsWith('.html')) continue;
    const html = readFileSync(p, 'utf8');
    let n = 0;
    const out = html.replace(/\bdata-entry="([^"]*)"/g, (all, url: string) => {
      if (url.startsWith('/')) return all;
      if (!url.startsWith('./') || url.includes('..')) throw new Error(`entry-url: ${p}: data-entry="${url}" is not ./<file>`);
      n++;
      return `data-entry="${base}${url.slice(2)}"`;
    });
    if (!n) continue;
    writeFileSync(p, out);
    pages++; entries += n;
  }
};
walk(dist);
console.log(`entry-url: ${entries} runtime entries made root-relative in ${pages} pages`);
