// The Demos app's web artifact, lighter on the wire (owner, 2026-11-26: "the performance must be phenomenal, above all
// without cache"; the framed app has no HTTP cache at all, D18, so every visit to /demos downloads it again). Applied
// by tools/compose.ts to its copy of the artifact, after the patches; the Demos app's sources and its iOS build keep
// their PNGs.
// - The launcher's icons (assets/app-icons/*.png, 192 x 192, ~2 MB for 109): WebP at quality 90 with sharp YUV
//   subsampling, or lossless where that falls under 32 dB PSNR against the PNG (a fine dot grid, atlas-button); each
//   kept only where it is smaller. Every text file of the artifact that names `assets/app-icons/<slug>.png` is
//   rewritten to the .webp (loud: no reference found fails the compose). The PNGs stay deployed: a reader whose
//   browser kept an earlier app-*.js (cached `immutable` before this) still asks for them.
// - The wallpaper keeps its own WebP (re-encoding at its full 1206 px, which 3x phones need, is no smaller; a
//   smaller one loses its grain).
// - The demos' fonts (assets/fonts/*.ttf|otf, ~1 MB raw, all preloaded: Exact's `font-display: optional` needs them
//   there at once): WOFF2 (wawoff2, the same glyphs), references and the preloads' `type` rewritten.
// Returns the files whose content changed under a content-hashed name (compose revalidates those, never `immutable`).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
// @ts-expect-error: no types
import { compress as woff2 } from 'wawoff2';

const ICONS = 'assets/app-icons';
const TEXT = /\.(?:js|mjs|html|css|json)$/;

// Dot files (.exact-build.json: the build's own record of names and digests) are left as they were built.
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).filter((e) => !e.name.startsWith('.')).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

// PSNR (dB) of an encoded image against the original, over RGBA.
async function psnr(original: string, encoded: Buffer) {
  const [a, b] = await Promise.all([sharp(original).ensureAlpha().raw().toBuffer(), sharp(encoded).ensureAlpha().raw().toBuffer()]);
  let se = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; se += d * d; }
  const mse = se / a.length;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

export async function optimizeDemos(dir: string) {
  const changed: { file: string; why: string }[] = [];
  let before = 0, after = 0;
  // Icons.
  const icons = join(dir, ICONS);
  const webp = new Set<string>();
  if (existsSync(icons)) {
    for (const name of readdirSync(icons).filter((n) => n.endsWith('.png'))) {
      const png = join(icons, name), out = png.replace(/\.png$/, '.webp');
      let buf = await sharp(png).webp({ quality: 90, effort: 6, smartSubsample: true, alphaQuality: 90 }).toBuffer();
      if ((await psnr(png, buf)) < 32) buf = await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer();
      const size = statSync(png).size;
      before += size;
      if (buf.length < size) { writeFileSync(out, buf); webp.add(name.replace(/\.png$/, '')); after += buf.length; } else after += size;
    }
  }
  if (webp.size) {
    const ref = /assets\/app-icons\/([a-z0-9-]+)\.png/g;
    let refs = 0;
    for (const f of walk(dir).filter((f) => TEXT.test(f))) {
      const text = readFileSync(f, 'utf8');
      let n = 0;
      const next = text.replace(ref, (m, slug) => (webp.has(slug) ? (n++, `assets/app-icons/${slug}.webp`) : m));
      if (n) { writeFileSync(f, next); refs += n; changed.push({ file: relative(dir, f), why: `${n} icon references to WebP` }); }
    }
    if (!refs) throw new Error(`demos optimize: no text file names ${ICONS}/<slug>.png: the icons are referenced otherwise now`);
  }
  // Fonts.
  const fonts = join(dir, 'assets/fonts');
  const converted = new Set<string>();
  if (existsSync(fonts)) {
    for (const name of readdirSync(fonts).filter((n) => /\.(?:ttf|otf)$/.test(n))) {
      const src = readFileSync(join(fonts, name)), out: Uint8Array = await woff2(src);
      before += src.length;
      if (out.length < src.length) { writeFileSync(join(fonts, name.replace(/\.(?:ttf|otf)$/, '.woff2')), out); converted.add(name); after += out.length; } else after += src.length;
    }
  }
  if (converted.size) {
    const ref = /assets\/fonts\/([A-Za-z0-9_.-]+\.(?:ttf|otf))/g;
    let refs = 0;
    for (const f of walk(dir).filter((f) => TEXT.test(f))) {
      const text = readFileSync(f, 'utf8');
      let n = 0;
      const renamed = text.replace(ref, (m, name) => (converted.has(name) ? (n++, `assets/fonts/${name.replace(/\.(?:ttf|otf)$/, '.woff2')}`) : m));
      // A preload's `type` follows its href, within its own <link> tag only.
      const next = renamed.replace(/<link\b[^>]*>/g, (tag) => (/href="[^"]*assets\/fonts\/[^"]+\.woff2"/.test(tag) ? tag.replace(/type="font\/(?:ttf|otf)"/, 'type="font/woff2"') : tag));
      if (n) { writeFileSync(f, next); refs += n; if (!changed.some((c) => c.file === relative(dir, f))) changed.push({ file: relative(dir, f), why: `${n} font references to WOFF2` }); }
    }
    if (!refs) throw new Error('demos optimize: no text file names the converted fonts');
  }
  console.log(`compose: demos assets ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB (${webp.size} icons as WebP, ${converted.size} fonts as WOFF2)`);
  return changed;
}
