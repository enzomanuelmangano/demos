/**
 * Generate a sprite atlas from downloaded photos
 *
 * This script:
 * 1. Reads all downloaded photos from assets/photos/
 * 2. Combines them into a single sprite atlas image
 * 3. Generates atlas-info.json with photo positions
 *
 * Run with: bun scripts/generate-sprite-atlas.ts
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

// Configuration
const PHOTO_SIZE = 80;
const ATLAS_COLS = 100; // 100x100 = 10,000 photos
const ATLAS_ROWS = 100;
const ATLAS_WIDTH = ATLAS_COLS * PHOTO_SIZE; // 8000px
const ATLAS_HEIGHT = ATLAS_ROWS * PHOTO_SIZE; // 8000px

const PHOTOS_DIR = join(
  __dirname,
  '../src/animations/the-scream-mosaic/assets/photos',
);
const ASSETS_DIR = join(
  __dirname,
  '../src/animations/the-scream-mosaic/assets',
);
const ATLAS_PATH = join(ASSETS_DIR, 'photo-atlas.jpg');
const ATLAS_INFO_PATH = join(ASSETS_DIR, 'atlas-info.json');

interface AtlasEntry {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AtlasInfo {
  atlasWidth: number;
  atlasHeight: number;
  photoSize: number;
  cols: number;
  rows: number;
  photos: AtlasEntry[];
}

async function main() {
  console.log('🎨 Sprite Atlas Generator');
  console.log('=========================');
  console.log(`Atlas size: ${ATLAS_WIDTH}x${ATLAS_HEIGHT}`);
  console.log(`Photos: ${ATLAS_COLS}x${ATLAS_ROWS} = ${ATLAS_COLS * ATLAS_ROWS}`);
  console.log('');

  // Read manifest to get photo IDs
  const manifestPath = join(ASSETS_DIR, 'photos-manifest.json');
  const manifestData = await readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestData);
  const photoIds: number[] = manifest.photos.map((p: { id: number }) => p.id);

  console.log(`Found ${photoIds.length} photos in manifest`);

  // Create composite operations for sharp
  const composites: sharp.OverlayOptions[] = [];
  const atlasEntries: AtlasEntry[] = [];

  let processed = 0;
  const startTime = Date.now();

  for (let i = 0; i < photoIds.length; i++) {
    const id = photoIds[i];
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const x = col * PHOTO_SIZE;
    const y = row * PHOTO_SIZE;

    const photoPath = join(PHOTOS_DIR, `${id}.jpg`);

    try {
      const photoBuffer = await readFile(photoPath);
      composites.push({
        input: photoBuffer,
        left: x,
        top: y,
      });

      atlasEntries.push({
        id,
        x,
        y,
        width: PHOTO_SIZE,
        height: PHOTO_SIZE,
      });

      processed++;

      if (processed % 1000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`📸 Processed ${processed}/${photoIds.length} (${elapsed}s)`);
      }
    } catch (error) {
      console.error(`Failed to read photo ${id}:`, error);
    }
  }

  console.log('');
  console.log('🔧 Compositing atlas...');

  // Create blank canvas and composite all photos
  const atlas = sharp({
    create: {
      width: ATLAS_WIDTH,
      height: ATLAS_HEIGHT,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  });

  // Process in chunks to avoid memory issues
  const chunkSize = 2500;
  let currentAtlas = atlas;

  for (let i = 0; i < composites.length; i += chunkSize) {
    const chunk = composites.slice(i, i + chunkSize);
    console.log(`   Compositing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(composites.length / chunkSize)}...`);

    if (i === 0) {
      currentAtlas = currentAtlas.composite(chunk);
    } else {
      // Save intermediate, reload, and continue compositing
      const tempBuffer = await currentAtlas.jpeg({ quality: 95 }).toBuffer();
      currentAtlas = sharp(tempBuffer).composite(chunk);
    }
  }

  // Save final atlas
  await currentAtlas.jpeg({ quality: 90 }).toFile(ATLAS_PATH);
  console.log(`✅ Generated atlas: ${ATLAS_PATH}`);

  // Generate atlas info
  const atlasInfo: AtlasInfo = {
    atlasWidth: ATLAS_WIDTH,
    atlasHeight: ATLAS_HEIGHT,
    photoSize: PHOTO_SIZE,
    cols: ATLAS_COLS,
    rows: ATLAS_ROWS,
    photos: atlasEntries,
  };

  await writeFile(ATLAS_INFO_PATH, JSON.stringify(atlasInfo, null, 2));
  console.log(`✅ Generated atlas info: ${ATLAS_INFO_PATH}`);

  // Check file size
  const { size: atlasSize } = await stat(ATLAS_PATH);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Total time: ${totalTime}s`);
  console.log(`   Photos composited: ${processed}`);
  console.log(`   Atlas size: ${(atlasSize / 1024 / 1024).toFixed(1)}MB`);
}

main().catch(console.error);
