// The GPU module's images for the web (app.json `before_build`): every file in gpu/images, cut in 64 KiB pieces,
// written to packages/gpu-images/chunks/ (Git ignores it) and listed in packages/gpu-images/exact.json's `web.assets`.
// The web build serves a package's web assets at /assets/demos-gpu-images/<path> (LLP 1154 D2), and the iPhone
// bundle never holds them: native builds keep the `include_bytes!` of gpu/images (gpu/src/bytes.rs), the wasm
// fetches the pieces a demo draws when its canvas is made (Surface::assets). Pieces, not whole files: the web host
// gives each asset request 5 s per attempt, so a 6 MB atlas never arrives over 4G; 64 KiB arrives over Fast 3G
// with eight in flight. CHUNK must equal gpu/src/bytes.rs's. Runs before every build verb: done at once when the
// pieces match the images (a stamp of each file's size and mtime).
// It also writes chunks/shaders.wgsl, every gpu/shaders/*.wgsl in one JSON object ({ name: text }, a web asset
// too; named .wgsl so every host compresses it as text/wgsl): the head
// script in app.json answers the GPU glue's 55 one-at-a-time shader fetches from that one request, started with the
// wasm's (tools/web-perf.md, "The shaders in one request"). The web build ships gpu/shaders as they are (this app
// declares no gpu.shaderRoots / shaderPreludes; the script refuses if it ever does), so the bundle is the same text.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const CHUNK = 64 * 1024;
const app = resolve(import.meta.dirname, '..');
const images = join(app, 'gpu/images'), pkg = join(app, 'packages/gpu-images'), out = join(pkg, 'chunks');
const files = [];
const walk = dir => {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const at = join(dir, e.name);
    if (e.isDirectory()) walk(at);
    else if (e.isFile() && !/\.(sh|md)$/.test(e.name) && e.name !== '.DS_Store') files.push(at);
  }
};
walk(images);
const rows = files.map(f => { const s = statSync(f); return [relative(images, f).split(sep).join('/'), s.size, Math.round(s.mtimeMs)]; });
const stamp = createHash('sha256').update(JSON.stringify([CHUNK, rows])).digest('hex');
const stampFile = join(out, '.stamp');

// The shaders, every build (340 KB of text): the bundle never lags gpu/shaders. Not a .json: the dev loop
// (host/web-js/dev.mjs) takes every event on a package's files as an edit, a build reads a package's .json files,
// and a .json bundle set every dev build aside, forever.
const manifest = JSON.parse(readFileSync(join(app, 'app.json'), 'utf8'));
if (manifest.gpu?.shaderRoots?.length || Object.keys(manifest.gpu?.shaderPreludes ?? {}).length)
  throw new Error('gpu-images-web: app.json declares shader roots or preludes: shaders.wgsl must be built from what the web build ships (scripts/app.mjs shaderFiles)');
const shaderDir = join(app, 'gpu/shaders'), shaders = {};
for (const name of readdirSync(shaderDir).filter(n => /^[A-Za-z_][A-Za-z0-9_]*\.wgsl$/.test(n)).sort())
  shaders[name.slice(0, -5)] = readFileSync(join(shaderDir, name), 'utf8');
const writeManifest = assets => {
  const bundle = JSON.stringify(shaders), bundleFile = join(out, 'shaders.wgsl');
  mkdirSync(out, { recursive: true });
  if (!existsSync(bundleFile) || readFileSync(bundleFile, 'utf8') !== bundle) writeFileSync(bundleFile, bundle);
  const text = JSON.stringify({ web: { assets: [...assets, 'chunks/shaders.wgsl'] } }, null, 1) + '\n', at = join(pkg, 'exact.json');
  if (!existsSync(at) || readFileSync(at, 'utf8') !== text) writeFileSync(at, text);
};

if (existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp && existsSync(join(pkg, 'exact.json'))) {
  writeManifest(JSON.parse(readFileSync(join(pkg, 'exact.json'), 'utf8')).web.assets.filter(a => /^chunks\/.+\.\d+$/.test(a)));
  process.exit(0);
}

rmSync(out, { recursive: true, force: true });
const assets = [];
for (const [rel, size] of rows) {
  const bytes = readFileSync(join(images, rel)), n = Math.max(1, Math.ceil(size / CHUNK));
  mkdirSync(join(out, rel, '..'), { recursive: true });
  for (let i = 0; i < n; i++) {
    writeFileSync(join(out, `${rel}.${i}`), bytes.subarray(i * CHUNK, (i + 1) * CHUNK));
    assets.push(`chunks/${rel}.${i}`);
  }
}
writeManifest(assets);
writeFileSync(stampFile, stamp);
console.error(`gpu-images-web: ${rows.length} images, ${assets.length} pieces in packages/gpu-images/chunks`);
