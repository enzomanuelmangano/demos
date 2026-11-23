// The GPU module's images for the web (app.json `before_build`): every file in gpu/images, cut in 64 KiB pieces,
// written to packages/gpu-images/chunks/ (Git ignores it) and listed in packages/gpu-images/exact.json's `web.assets`.
// The web build serves a package's web assets at /assets/demos-gpu-images/<path> (LLP 1154 D2), and the iPhone
// bundle never holds them: native builds keep the `include_bytes!` of gpu/images (gpu/src/bytes.rs), the wasm
// fetches the pieces a demo draws when its canvas is made (Surface::assets). Pieces, not whole files: the web host
// gives each asset request 5 s per attempt, so a 6 MB atlas never arrives over 4G; 64 KiB arrives over Fast 3G
// with eight in flight. CHUNK must equal gpu/src/bytes.rs's. Runs before every build verb: done at once when the
// pieces match the images (a stamp of each file's size and mtime).
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
if (existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp && existsSync(join(pkg, 'exact.json'))) process.exit(0);

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
writeFileSync(join(pkg, 'exact.json'), JSON.stringify({ web: { assets } }, null, 1) + '\n');
writeFileSync(stampFile, stamp);
console.error(`gpu-images-web: ${rows.length} images, ${assets.length} pieces in packages/gpu-images/chunks`);
