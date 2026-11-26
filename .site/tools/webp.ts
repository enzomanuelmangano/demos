#!/usr/bin/env bun
// One image to WebP, at most `max` px wide, quality 82 (gen-content.ts's ImageMagick settings), for a machine without
// ImageMagick (Vercel's build image).   bun tools/webp.ts <in> <out> <max> [quality, default 82]
import sharp from 'sharp';
const [src, dst, max, quality = '82'] = process.argv.slice(2);
await sharp(src).resize({ width: Number(max), withoutEnlargement: true }).webp({ quality: Number(quality), effort: 6 }).toFile(dst);
