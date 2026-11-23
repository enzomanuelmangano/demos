#!/usr/bin/env bun
// What Exact's bake captures from an app root, re-implemented from `sources()` in
// <exact2>/js/bake/src/lib.rs (identical at c193f394, the demos' seed, and 2180d806, the site's).
// Usage: bun capture.ts <app-root> [--list] [--json]
// Prints the file count, the byte total and the per-top-level-directory split. `--list` prints every path,
// so two runs can be diffed path by path (isolation proof 1 in .site/docs/isolation.md).
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = realpathSync(process.argv[2] ?? '.');
const list = process.argv.includes('--list'), json = process.argv.includes('--json');
const manifest = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
// host.{ios,macos}.resources trees are bundle resources, not sources.
const native = new Set(
  ['ios', 'macos'].flatMap((p) => (manifest.host?.[p]?.resources ?? []).map((r: { from: string }) => {
    try { return realpathSync(join(root, r.from)); } catch { return ''; }
  })).filter(Boolean),
);
const mounts = Object.keys(manifest.typescript?.sources ?? {});
const BESIDE = ['gen', 'gen.reaped', 'leases', 'lock', 'previous']; // js/bake/src/beside.rs
const CAPTURED_EXT = new Set(['.ts', '.js', '.mjs', '.cjs', '.json', '.contract', '.ttf', '.otf']);
const TREES = ['assets', 'deck', 'gpu/shaders'];
const files: [string, number][] = [];

function walk(at: string) {
  for (const name of readdirSync(at)) {
    const path = join(at, name), st = lstatSync(path), dir = st.isDirectory(), top = at === root;
    if (['.git', 'node_modules', 'target', 'dist'].includes(name)) continue;
    if (top && (name === 'dist-windows' || (name.startsWith('dist.') && (BESIDE.includes(name.slice(5)) || /^stage-./.test(name.slice(5)))))) continue;
    if (name.startsWith('.exact-js-bake-') || (name.startsWith('.') && dir)) continue;
    if (name.endsWith('.test.contract') || (top && name === 'app.contract.d.ts')) continue;
    if (native.has(path)) continue;
    const rel = relative(root, path);
    if (dir && name.endsWith('.xcframework') && ['modules', 'ios/modules', 'macos/modules', 'tvos/modules'].some((t) => rel.startsWith(t))) continue;
    if (top && mounts.includes(name)) continue;
    if (st.isSymbolicLink()) continue; // a document link (CLAUDE.md); any other link fails the real bake
    if (dir) { walk(path); continue; }
    if (CAPTURED_EXT.has(extname(name)) || TREES.some((t) => rel === t || rel.startsWith(t + '/'))) files.push([rel, statSync(path).size]);
  }
}
walk(root);
files.sort(([a], [b]) => (a < b ? -1 : 1));
const total = files.reduce((s, [, n]) => s + n, 0);
const byTop: Record<string, number> = {};
for (const [p, n] of files) byTop[p.split('/')[0]] = (byTop[p.split('/')[0]] ?? 0) + n;
if (list) for (const [p, n] of files) console.log(`${n}\t${p}`);
else if (json) console.log(JSON.stringify({ files: files.length, bytes: total, byTop }));
else {
  console.log(`${files.length} files, ${total} bytes (${(total / 2 ** 20).toFixed(2)} MiB)`);
  for (const [k, v] of Object.entries(byTop).sort((a, b) => b[1] - a[1])) console.log(`  ${k}\t${(v / 2 ** 20).toFixed(2)} MiB`);
}
