#!/usr/bin/env bun
// One image to WebP, at most `max` px wide, quality 82 (gen-content.ts's ImageMagick settings), for a machine without
// ImageMagick (Vercel's build image).   bun tools/webp.ts <in> <out> <max>
import sharp from 'sharp';
const [src, dst, max] = process.argv.slice(2);
await sharp(src).resize({ width: Number(max), withoutEnlargement: true }).webp({ quality: 82, effort: 6 }).toFile(dst);
