#!/usr/bin/env bun
// One-off import from the reference site (enzomanuelmangano/reactiive.io), which is only read, at a pinned commit:
//   bun tools/import-reference.ts <reactiive.io checkout> [<sha>]
// - content/** (MDX, metadata, images, the article components' sources for reference) → .content/ (not captured)
// - src/data/github-repos.json → .content/github-repos.json
// - public/{og,pwa}, apple-touch-icon.png, LICENSE, src/app/favicon.ico → public/ (served at the origin's root)
// - public/{logos,images/avatars}, pfp.png → assets/ (drawn by the pages)
// - src/assets/fonts/{InterVariable,SourceCodePro_400Regular}.woff2 → assets/fonts/
// - the header logo's JSX <svg> (components/header/logo-home) → assets/logo-home.svg
// Records the sha in .content/SOURCE. After the import the site owns its copies; re-running overwrites them.
// Demo videos and thumbnails are not imported: they are served from the media CDN (R2), as today.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ref = resolve(process.argv[2] ?? '../../reactiive.io');
const site = resolve(import.meta.dir, '..');
const head = spawnSync('git', ['-C', ref, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const sha = process.argv[3] ?? head;
if (sha !== head) throw new Error(`the reference checkout is at ${head}, not ${sha}: check it out there first (read-only: never commit to it)`);
const dirty = spawnSync('git', ['-C', ref, 'status', '--porcelain', '--', 'content', 'public', 'src/data', 'src/assets', 'src/components/header'], { encoding: 'utf8' }).stdout.trim();
if (dirty) throw new Error(`the reference checkout has local changes under the imported paths:\n${dirty}`);

const copy = (from: string, to: string) => { mkdirSync(resolve(to, '..'), { recursive: true }); cpSync(join(ref, from), to, { recursive: true }); };
const content = join(site, '.content');
rmSync(content, { recursive: true, force: true });
copy('content', content);
copy('src/data/github-repos.json', join(content, 'github-repos.json'));
writeFileSync(join(content, 'SOURCE'), `enzomanuelmangano/reactiive.io ${sha}\n`);

// Files the reference serves at fixed root URLs (share images, icons, the license) go to public/, which
// tools/compose.ts places at the origin's root; what only the pages draw goes to assets/ (the build's).
const assets = join(site, 'assets'), pub = join(site, 'public');
rmSync(pub, { recursive: true, force: true });
for (const d of ['og', 'pwa']) copy(`public/${d}`, join(pub, d));
for (const f of ['apple-touch-icon.png', 'LICENSE']) copy(`public/${f}`, join(pub, f));
copy('src/app/favicon.ico', join(pub, 'favicon.ico'));
for (const d of ['logos', 'images/avatars']) { rmSync(join(assets, d), { recursive: true, force: true }); copy(`public/${d}`, join(assets, d)); }
copy('public/pfp.png', join(assets, 'pfp.png'));
// The reference's own WOFF2 files, declared in app.json's head with font-display: swap as the reference does (not as
// Contract `font`s: Exact writes those as TTF/OTF with font-display: optional; docs/decisions.md D7).
rmSync(join(assets, 'fonts'), { recursive: true, force: true });
for (const f of ['InterVariable.woff2', 'SourceCodePro_400Regular.woff2']) copy(`src/assets/fonts/${f}`, join(assets, 'fonts', f));

// The logo: JSX attribute names back to SVG's, its one colour constant inlined.
const tsx = readFileSync(join(ref, 'src/components/header/logo-home/index.tsx'), 'utf8');
const svg = tsx.slice(tsx.indexOf('<svg'), tsx.lastIndexOf('</svg>') + 6)
  .replace(/\{mainSvgColor\}/g, '"#FFFFFF"')
  .replace(/\b(clipPath|fillRule|clipRule|stopColor|stopOpacity|strokeWidth|strokeLinecap|strokeLinejoin)=/g, (_, k: string) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + '=')
  .replace(/=\{"([^"]*)"\}/g, '="$1"')
  .replace(/\s+/g, ' ');
if (/[{}]/.test(svg)) throw new Error('logo-home: a JSX expression is left in the SVG');
writeFileSync(join(assets, 'logo-home.svg'), svg + '\n');
console.log(`import-reference: ${sha.slice(0, 8)} → .content/, assets/`);
