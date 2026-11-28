#!/usr/bin/env bun
// Preloads the GPU module on /apps, whose ghost (a WebGPU surface) is above the fold:
//   bun tools/gpu-preloads.ts [dist]      (part of `bun run build`, after tools/preloads.ts)
// Exact asks for the GPU glue only once the runtime has booted and two frames have passed, then gpu.js, then the
// wasm, then the shaders: four round trips after the boot before the first frame. Fetched from the page's head
// instead, they are in the cache when the glue asks for them. Low priority and after Exact's own modulepreloads (also
// low), so the runtime's chunks are asked for first. Every other page is left as it is: none draws a GPU surface on
// arrival, and on those the 3 MB of wasm would only compete with the page. A browser without WebGPU (no navigator.gpu)
// never loads the module, so the links are added by a small inline script only where navigator.gpu exists.
// Fails the build when what it preloads is not what the glue loads: the files, or the URLs the glue builds for them.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SITE = resolve(import.meta.dir, '..');
const dist = resolve(SITE, process.argv[2] ?? 'dist');
const PAGES = ['apps/index.html'];
const MARK = 'data-reactiive-gpu-preload';
for (const f of ['gpu-glue.js', 'gpu.js', 'gpu_bg.wasm']) if (!existsSync(join(dist, f))) throw new Error(`gpu-preloads: no ${f} in ${dist}`);
const glue = readFileSync(join(dist, 'gpu-glue.js'), 'utf8');
// What host/web/gpu-glue.js builds, minified: `./${stem}.js`, `./${stem}_bg.wasm`, `./shaders/${name}.wgsl`.
for (const want of ['.js`', '_bg.wasm`', './shaders/${']) if (!glue.includes(want)) throw new Error(`gpu-preloads: gpu-glue.js no longer builds a URL with ${want}: Exact's GPU load changed`);
if (readFileSync(join(dist, JSON.parse(readFileSync(join(dist, 'routes.json'), 'utf8')).files['app.js']), 'utf8').indexOf('gpu-glue.js') < 0) throw new Error('gpu-preloads: the entry no longer imports gpu-glue.js');
const shaders = readdirSync(join(dist, 'shaders')).filter((f) => f.endsWith('.wgsl')).sort();
if (!shaders.length) throw new Error('gpu-preloads: no shaders');
const links: [string, string][] = [['/gpu-glue.js', ''], ['/gpu.js', ''], ['/gpu_bg.wasm', 'fetch'], ...shaders.map((f): [string, string] => [`/shaders/${f}`, 'fetch'])];
// A module script: modulepreload; a fetch(): preload as="fetch" with crossorigin (fetch's own mode, cors, same-origin
// credentials), or the browser fetches it twice.
const tag = `<script ${MARK}>if(navigator.gpu)${JSON.stringify(links)}.forEach(function(l){var e=document.createElement('link');`
  + `if(l[1]){e.rel='preload';e.as=l[1];e.crossOrigin='anonymous'}else e.rel='modulepreload';e.href=l[0];e.fetchPriority='low';document.head.appendChild(e)})</script>`;
for (const page of PAGES) {
  const p = join(dist, page);
  let html = readFileSync(p, 'utf8').replace(new RegExp(`<link [^>]*${MARK}>`, 'g'), '').replace(new RegExp(`<script ${MARK}>[\\s\\S]*?</script>`, 'g'), '');
  const last = [...html.matchAll(/<link rel="modulepreload"[^>]*>/g)].pop();
  if (!last) throw new Error(`gpu-preloads: ${page} has no modulepreload of Exact's to follow`);
  const end = last.index! + last[0].length;
  writeFileSync(p, html.slice(0, end) + tag + html.slice(end));
}
console.log(`gpu-preloads: the GPU module and ${shaders.length} shaders preloaded in ${PAGES.join(', ')} where WebGPU is (navigator.gpu)`);
