/**
 * Generate high-resolution sprite atlases (800x800 per photo)
 *
 * Reduced set: 1,000 photos for practical bundle size (~80MB)
 *
 * Structure:
 * - 1,000 photos at 800x800
 * - Each atlas is 8000x8000 (10x10 photos)
 * - 10 atlases total
 *
 * Run with: bun scripts/generate-highres-atlases.ts
 */

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

// Configuration
const TOTAL_PHOTOS = 2000;
const PHOTO_SIZE = 800;
const ATLAS_COLS = 10;
const ATLAS_ROWS = 10;
const PHOTOS_PER_ATLAS = ATLAS_COLS * ATLAS_ROWS; // 100
const ATLAS_WIDTH = ATLAS_COLS * PHOTO_SIZE; // 8000px
const ATLAS_HEIGHT = ATLAS_ROWS * PHOTO_SIZE; // 8000px
const TOTAL_ATLASES = Math.ceil(TOTAL_PHOTOS / PHOTOS_PER_ATLAS); // 10

const ASSETS_DIR = join(
  __dirname,
  '../src/animations/the-scream-mosaic/assets',
);
const HIGHRES_DIR = join(ASSETS_DIR, 'highres');
const MANIFEST_PATH = join(HIGHRES_DIR, 'manifest.json');
const COLORS_PATH = join(HIGHRES_DIR, 'colors.json');

interface PhotoColor {
  id: number;
  r: number;
  g: number;
  b: number;
  l: number;
  a: number;
  bVal: number;
}

// RGB to LAB conversion
function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  // Normalize RGB
  let rNorm = r / 255;
  let gNorm = g / 255;
  let bNorm = b / 255;

  // Apply gamma correction
  rNorm = rNorm > 0.04045 ? Math.pow((rNorm + 0.055) / 1.055, 2.4) : rNorm / 12.92;
  gNorm = gNorm > 0.04045 ? Math.pow((gNorm + 0.055) / 1.055, 2.4) : gNorm / 12.92;
  bNorm = bNorm > 0.04045 ? Math.pow((bNorm + 0.055) / 1.055, 2.4) : bNorm / 12.92;

  // Convert to XYZ
  const x = (rNorm * 0.4124564 + gNorm * 0.3575761 + bNorm * 0.1804375) / 0.95047;
  const y = (rNorm * 0.2126729 + gNorm * 0.7151522 + bNorm * 0.0721750);
  const z = (rNorm * 0.0193339 + gNorm * 0.1191920 + bNorm * 0.9503041) / 1.08883;

  // Convert to LAB
  const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
  const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
  const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;

  return {
    l: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

async function downloadAndAnalyzePhoto(id: number): Promise<{ buffer: Buffer; color: PhotoColor } | null> {
  const url = `https://picsum.photos/seed/mosaic-${id}/${PHOTO_SIZE}/${PHOTO_SIZE}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Analyze color
    const { data, info } = await sharp(buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    let totalR = 0, totalG = 0, totalB = 0;
    const pixelCount = info.width * info.height;

    for (let i = 0; i < data.length; i += 3) {
      totalR += data[i];
      totalG += data[i + 1];
      totalB += data[i + 2];
    }

    const r = Math.round(totalR / pixelCount);
    const g = Math.round(totalG / pixelCount);
    const b = Math.round(totalB / pixelCount);
    const lab = rgbToLab(r, g, b);

    return {
      buffer,
      color: {
        id,
        r, g, b,
        l: lab.l,
        a: lab.a,
        bVal: lab.b,
      },
    };
  } catch {
    return null;
  }
}

async function generateAtlas(
  atlasIndex: number,
  photos: { id: number; buffer: Buffer }[],
): Promise<{ filename: string; size: number }> {
  const filename = `atlas-${atlasIndex.toString().padStart(2, '0')}.jpg`;
  const atlasPath = join(HIGHRES_DIR, filename);

  console.log(`\n📦 Atlas ${atlasIndex + 1}/${TOTAL_ATLASES} (${filename})`);

  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < photos.length; i++) {
    const { buffer } = photos[i];
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);

    composites.push({
      input: buffer,
      left: col * PHOTO_SIZE,
      top: row * PHOTO_SIZE,
    });
  }

  const atlas = sharp({
    create: {
      width: ATLAS_WIDTH,
      height: ATLAS_HEIGHT,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  });

  await atlas
    .composite(composites)
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(atlasPath);

  const { size } = await stat(atlasPath);
  console.log(`   ✅ Saved: ${(size / 1024 / 1024).toFixed(1)}MB`);

  return { filename, size };
}

async function main() {
  console.log('🎨 High-Resolution Atlas Generator');
  console.log('===================================');
  console.log(`Photos: ${TOTAL_PHOTOS} at ${PHOTO_SIZE}x${PHOTO_SIZE}`);
  console.log(`Atlases: ${TOTAL_ATLASES} at ${ATLAS_WIDTH}x${ATLAS_HEIGHT}`);
  console.log(`Estimated size: ~${TOTAL_ATLASES * 8}MB`);
  console.log('');

  await mkdir(HIGHRES_DIR, { recursive: true });

  const startTime = Date.now();
  const photos: { id: number; buffer: Buffer }[] = [];
  const colors: PhotoColor[] = [];

  // Download all photos
  console.log('📥 Downloading photos...');
  for (let id = 0; id < TOTAL_PHOTOS; id++) {
    const result = await downloadAndAnalyzePhoto(id);

    if (result) {
      photos.push({ id, buffer: result.buffer });
      colors.push(result.color);
    }

    if ((id + 1) % 50 === 0) {
      console.log(`   ${id + 1}/${TOTAL_PHOTOS} downloaded`);
    }
  }

  console.log(`\n✅ Downloaded ${photos.length} photos`);

  // Generate atlases
  const atlasInfo: { index: number; filename: string }[] = [];
  let totalSize = 0;

  for (let atlasIndex = 0; atlasIndex < TOTAL_ATLASES; atlasIndex++) {
    const start = atlasIndex * PHOTOS_PER_ATLAS;
    const end = Math.min(start + PHOTOS_PER_ATLAS, photos.length);
    const atlasPhotos = photos.slice(start, end);

    if (atlasPhotos.length === 0) break;

    const { filename, size } = await generateAtlas(atlasIndex, atlasPhotos);
    atlasInfo.push({ index: atlasIndex, filename });
    totalSize += size;
  }

  // Save manifest
  const manifest = {
    photoSize: PHOTO_SIZE,
    atlasWidth: ATLAS_WIDTH,
    atlasHeight: ATLAS_HEIGHT,
    atlasCols: ATLAS_COLS,
    atlasRows: ATLAS_ROWS,
    photosPerAtlas: PHOTOS_PER_ATLAS,
    totalPhotos: photos.length,
    totalAtlases: atlasInfo.length,
    atlases: atlasInfo,
  };

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  // Save colors (compact format for color matching)
  const compactColors = colors.flatMap(c => [c.r, c.g, c.b, Math.round(c.l), Math.round(c.a), Math.round(c.bVal)]);
  await writeFile(COLORS_PATH, JSON.stringify(compactColors));

  const totalMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n');
  console.log('📊 Summary');
  console.log('==========');
  console.log(`Time: ${totalMinutes} minutes`);
  console.log(`Photos: ${photos.length}`);
  console.log(`Atlases: ${atlasInfo.length}`);
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)}MB`);
  console.log(`Output: ${HIGHRES_DIR}`);
}

main().catch(console.error);
