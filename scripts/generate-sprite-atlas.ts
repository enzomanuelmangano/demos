/**
 * Generate multiple sprite atlases from downloaded photos
 *
 * Creates 7 atlases for 10,000 photos at 200px each
 * Each atlas: 40x40 = 1,600 photos, 8000x8000px
 *
 * Run with: bun scripts/generate-sprite-atlas.ts
 */

import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

// Configuration
const PHOTO_SIZE = 200;
const ATLAS_COLS = 40;
const ATLAS_ROWS = 40;
const PHOTOS_PER_ATLAS = ATLAS_COLS * ATLAS_ROWS; // 1600
const ATLAS_COUNT = 7;
const ATLAS_WIDTH = ATLAS_COLS * PHOTO_SIZE; // 8000px
const ATLAS_HEIGHT = ATLAS_ROWS * PHOTO_SIZE; // 8000px

const PHOTOS_DIR = join(
  __dirname,
  '../src/animations/art-gallery/assets/photos',
);
const ASSETS_DIR = join(
  __dirname,
  '../src/animations/art-gallery/assets',
);
const ATLASES_DIR = join(ASSETS_DIR, 'atlases');

async function main() {
  console.log('🎨 Multi-Atlas Sprite Generator');
  console.log('================================');
  console.log(`Atlas size: ${ATLAS_WIDTH}x${ATLAS_HEIGHT}`);
  console.log(`Photos per atlas: ${ATLAS_COLS}x${ATLAS_ROWS} = ${PHOTOS_PER_ATLAS}`);
  console.log(`Total atlases: ${ATLAS_COUNT}`);
  console.log('');

  // Create atlases directory
  await mkdir(ATLASES_DIR, { recursive: true });

  // Read manifest to get photo IDs
  const manifestPath = join(ASSETS_DIR, 'photos-manifest.json');
  const manifestData = await readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestData);
  const photoIds: number[] = manifest.photos.map((p: { id: number }) => p.id);

  console.log(`Found ${photoIds.length} photos in manifest`);

  const startTime = Date.now();

  // Process each atlas
  for (let atlasIndex = 0; atlasIndex < ATLAS_COUNT; atlasIndex++) {
    const atlasStart = atlasIndex * PHOTOS_PER_ATLAS;
    const atlasEnd = Math.min(atlasStart + PHOTOS_PER_ATLAS, photoIds.length);

    if (atlasStart >= photoIds.length) {
      console.log(`\n📦 Atlas ${atlasIndex}: skipped (no more photos)`);
      continue;
    }

    const atlasPhotoIds = photoIds.slice(atlasStart, atlasEnd);

    console.log(`\n📦 Atlas ${atlasIndex}: photos ${atlasStart}-${atlasEnd - 1} (${atlasPhotoIds.length} photos)`);

    // Load all photos for this atlas
    const composites: sharp.OverlayOptions[] = [];

    for (let i = 0; i < atlasPhotoIds.length; i++) {
      const id = atlasPhotoIds[i];
      const col = i % ATLAS_COLS;
      const row = Math.floor(i / ATLAS_COLS);
      const x = col * PHOTO_SIZE;
      const y = row * PHOTO_SIZE;

      const photoPath = join(PHOTOS_DIR, `${id}.jpg`);

      try {
        // Resize to ensure consistent size
        const photoBuffer = await sharp(await readFile(photoPath))
          .resize(PHOTO_SIZE, PHOTO_SIZE)
          .toBuffer();

        composites.push({
          input: photoBuffer,
          left: x,
          top: y,
        });
      } catch (error) {
        console.error(`Failed to read photo ${id}:`, error);
      }

      if ((i + 1) % 500 === 0) {
        console.log(`   Loaded ${i + 1}/${atlasPhotoIds.length}`);
      }
    }

    console.log(`   Compositing ${composites.length} photos...`);

    // Build rows then stack (faster than single composite)
    const rowBuffers: Buffer[] = [];
    const numRows = Math.ceil(composites.length / ATLAS_COLS);

    for (let row = 0; row < numRows; row++) {
      const rowStart = row * ATLAS_COLS;
      const rowEnd = Math.min(rowStart + ATLAS_COLS, composites.length);
      const rowComposites = composites.slice(rowStart, rowEnd).map((c, i) => ({
        input: c.input,
        left: i * PHOTO_SIZE,
        top: 0,
      }));

      const rowBuffer = await sharp({
        create: {
          width: ATLAS_WIDTH,
          height: PHOTO_SIZE,
          channels: 3,
          background: { r: 128, g: 128, b: 128 },
        },
      })
        .composite(rowComposites)
        .png()
        .toBuffer();

      rowBuffers.push(rowBuffer);

      if ((row + 1) % 10 === 0) {
        console.log(`   Row ${row + 1}/${numRows}`);
      }
    }

    console.log(`   Stacking ${rowBuffers.length} rows...`);

    const rowInputs = rowBuffers.map((buffer, i) => ({
      input: buffer,
      left: 0,
      top: i * PHOTO_SIZE,
    }));

    const atlasPath = join(ATLASES_DIR, `photo-atlas-${atlasIndex}.jpg`);

    await sharp({
      create: {
        width: ATLAS_WIDTH,
        height: ATLAS_HEIGHT,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .composite(rowInputs)
      .jpeg({ quality: 100 })
      .toFile(atlasPath);

    console.log(`   ✅ Generated: ${atlasPath}`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Total time: ${totalTime}s`);
  console.log(`   Atlases generated: ${ATLAS_COUNT}`);
  console.log(`   Photos per atlas: ${PHOTOS_PER_ATLAS}`);
  console.log(`   Photo size: ${PHOTO_SIZE}px`);
}

main().catch(console.error);
