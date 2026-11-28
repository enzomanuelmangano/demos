#!/usr/bin/env bun
// Writes web/head.css into app.json's host.web.head as the script that adds it (the head takes no style tag), and
// web/reveal.js as a script of its own; checks that the copy there is current (`--check`, for CI). Run after editing web/head.css.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOT_IN_APP } from './demos-web/legacy-posts.ts';

const site = join(import.meta.dir, '..');
const preloads: string[] = [];
const hashed = (f: string) => `/${f}?v=${new Bun.CryptoHasher('sha256').update(readFileSync(join(site, f))).digest('hex').slice(0, 10)}`;
// web/content.css (the content pages' rules, branch site-content) follows head.css in the same sheet.
const css = (readFileSync(join(site, 'web/head.css'), 'utf8') + '\n' + readFileSync(join(site, 'web/content.css'), 'utf8'))
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.trim()).filter(Boolean).join('')
  // url(@inline:<path>): the file as a data: URL (the ASCII subset of Inter, web/head.css). Rebuild the subset with
  // url(@hashed:<path>): the file's URL versioned by its content (compose caches /assets/fonts/ for good) and
  // preloaded by a head link (below). The ASCII subset of Inter, with fonttools:
  // pyftsubset assets/fonts/InterVariable.woff2 --unicodes=U+0020-007E --layout-features+=tnum --flavor=woff2 --output-file=assets/fonts/InterAscii.woff2
  .replace(/url\(@hashed:([^)]+)\)/g, (_, f: string) => { const href = hashed(f); preloads.push(href); return `url(${href})`; });
const text = `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})();`;
const path = join(site, 'app.json');
const app = JSON.parse(readFileSync(path, 'utf8'));
const head: any[] = app.host.web.head;
const i = head.findIndex((h) => h.script?.text?.includes("document.createElement('style')"));
if (i < 0) throw new Error('head: no style script in app.json host.web.head');
const links = preloads.map((href) => ({ link: { rel: 'preload', href, as: 'font', type: 'font/woff2', crossorigin: true } }));
const isPreload = (h: any) => h.link?.rel === 'preload' && h.link?.as === 'font';
const next = [...links, ...head.filter((h) => !isPreload(h))];
next[next.findIndex((h) => h.script?.text?.includes("document.createElement('style')"))] = { script: { text } };
// web/reveal.js (RevealOnScroll, the card grids' cascade), its own script after the style's, comments dropped.
const reveal = readFileSync(join(site, 'web/reveal.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
const r = next.findIndex((h) => h.script?.text?.includes('IntersectionObserver'));
if (r >= 0) next[r] = { script: { text: reveal } };
else next.splice(next.findIndex((h) => h.script?.text?.includes("document.createElement('style')")) + 1, 0, { script: { text: reveal } });
// web/sim-hint.js (/demos's frame host and arrow, D19/D22), its own script after reveal.js, comments dropped.
const hint = readFileSync(join(site, 'web/sim-hint.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
const hi = next.findIndex((h) => typeof h.script?.text === 'string' && h.script.text.includes('reactiive.demos.arrow'));
if (hi >= 0) next[hi] = { script: { text: hint } };
else next.splice(next.findIndex((h) => h.script?.text?.includes('IntersectionObserver')) + 1, 0, { script: { text: hint } });
// web/sim-goto.js (a demo post's deep link, D21), its own script after sim-hint.js, comments dropped.
const goto = readFileSync(join(site, 'web/sim-goto.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
  .replace("'__NO_APP__'", () => `'${NOT_IN_APP.join(' ')}'`);
const isGoto = (h: any) => typeof h.script?.text === 'string' && h.script.text.includes("demos: 'goto'");
const gi = next.findIndex(isGoto);
if (gi >= 0) next[gi] = { script: { text: goto } };
else next.splice(next.findIndex((h) => typeof h.script?.text === 'string' && h.script.text.includes('reactiive.demos.arrow')) + 1, 0, { script: { text: goto } });
// web/gpu-guard.js (<html data-gpu>: a page shows a still where WebGPU will not draw), last, comments dropped. It
// replaces #172's guard (found by its `exact-gpu-reload:` marker), whose retries Exact now does itself. The Demos app's
// head (../app.json) gets the same text: its frame on /demos and /demos/app/ load the same GPU glue.
const guard = readFileSync(join(site, 'web/gpu-guard.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
const isGuard = (h: any) => typeof h.script?.text === 'string' && (h.script.text.includes('exact-gpu-reload:') || h.script.text.includes("setAttribute('data-gpu'"));
const gu = next.findIndex(isGuard);
if (gu >= 0) next[gu] = { script: { text: guard } }; else next.push({ script: { text: guard } });
const demosPath = join(site, '../app.json');
const demos = JSON.parse(readFileSync(demosPath, 'utf8'));
const dh: any[] = demos.host.web.head;
const du = dh.findIndex(isGuard);
const demosNext = du >= 0 ? dh.map((h, k) => (k === du ? { script: { text: guard } } : h)) : [...dh, { script: { text: guard } }];
if (process.argv.includes('--check')) {
  if (JSON.stringify(next) !== JSON.stringify(head)) { console.error('head: app.json is stale: run bun tools/head.ts'); process.exit(1); }
  if (JSON.stringify(demosNext) !== JSON.stringify(dh)) { console.error("head: the Demos app's app.json GPU guard is stale: run bun tools/head.ts"); process.exit(1); }
  process.exit(0);
}
app.host.web.head = next;
writeFileSync(path, JSON.stringify(app, null, 2) + '\n');
if (JSON.stringify(demosNext) !== JSON.stringify(dh)) { demos.host.web.head = demosNext; writeFileSync(demosPath, JSON.stringify(demos, null, 2) + '\n'); }
console.log(`head: ${css.length} bytes of CSS in app.json`);
