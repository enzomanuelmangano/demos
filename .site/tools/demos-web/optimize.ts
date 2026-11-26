// The Demos app's web artifact, lighter on the wire (owner, 2026-11-26: "the performance must be phenomenal, above all
// without cache"; the framed app has no HTTP cache at all, D18, so every visit to /demos downloads it again). Applied
// by tools/compose.ts to its copy of the artifact, after the patches; the Demos app's sources and its iOS build keep
// their PNGs.
// - The launcher's icons (assets/app-icons/*.png, 192 x 192, ~2 MB for 109): WebP at quality 82 (method 6), each kept
//   only where it is smaller; every text file of the artifact that names `assets/app-icons/<slug>.png` is rewritten
//   to the .webp (loud: no reference found fails the compose, so a new Exact that names them otherwise is seen).
// - The wallpaper (assets/web/home-wallpaper.webp, 1206 x 2622): at most 860 px wide (the phone's 420 pt display at
//   2x, plus margin), quality 80; the same name.
// - The demos' fonts (assets/fonts/*.ttf|otf, ~1 MB raw, all preloaded: Exact's `font-display: optional` needs them
//   there at once): WOFF2 (wawoff2, the same glyphs), references and the preloads' `type` rewritten.
// Returns the files whose content changed under a content-hashed name (compose revalidates those, never `immutable`).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
// @ts-expect-error: no types
import { compress as woff2 } from 'wawoff2';

const ICONS = 'assets/app-icons';
const WALLPAPER = 'assets/web/home-wallpaper.webp';
const TEXT = /\.(?:js|mjs|html|css|json)$/;

const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

export async function optimizeDemos(dir: string) {
  const changed: { file: string; why: string }[] = [];
  let before = 0, after = 0;
  // Icons.
  const icons = join(dir, ICONS);
  const webp = new Set<string>();
  if (existsSync(icons)) {
    for (const name of readdirSync(icons).filter((n) => n.endsWith('.png'))) {
      const png = join(icons, name), out = png.replace(/\.png$/, '.webp');
      const buf = await sharp(png).webp({ quality: 82, effort: 6, alphaQuality: 90 }).toBuffer();
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
  // Wallpaper.
  const wall = join(dir, WALLPAPER);
  if (existsSync(wall)) {
    const size = statSync(wall).size;
    const buf = await sharp(wall).resize({ width: 860, withoutEnlargement: true }).webp({ quality: 80, effort: 6 }).toBuffer();
    before += size;
    if (buf.length < size) { writeFileSync(wall, buf); after += buf.length; } else after += size;
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
    const ref = /assets\/fonts\/([A-Za-z0-9_.-]+\.(?:ttf|otf))("[^>]*?type=")?(font\/(?:ttf|otf))?/g;
    let refs = 0;
    for (const f of walk(dir).filter((f) => TEXT.test(f))) {
      const text = readFileSync(f, 'utf8');
      let n = 0;
      const next = text.replace(ref, (m, name, mid, type) => {
        if (!converted.has(name)) return m;
        n++;
        return `assets/fonts/${name.replace(/\.(?:ttf|otf)$/, '.woff2')}${mid ?? ''}${type ? 'font/woff2' : ''}`;
      });
      if (n) { writeFileSync(f, next); refs += n; if (!changed.some((c) => c.file === relative(dir, f))) changed.push({ file: relative(dir, f), why: `${n} font references to WOFF2` }); }
    }
    if (!refs) throw new Error('demos optimize: no text file names the converted fonts');
  }
  console.log(`compose: demos assets ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB (${webp.size} icons as WebP, the wallpaper at 860 px, ${converted.size} fonts as WOFF2)`);
  return changed;
}
