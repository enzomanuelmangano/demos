/**
 * Deduplicate the photo atlas.
 *
 * picsum.photos serves from a small (~1000) source pool, so the 10,000
 * downloaded photos are ~90% duplicates (979 unique by LAB signature). This
 * collapses them into a single atlas of unique tiles, extracted from the
 * existing 7 atlas jpgs (the original per-photo sources are gone).
 *
 * Output:
 *   - assets/atlases/deduped-atlas.jpg   (40 cols x N rows of unique tiles)
 *   - assets/atlas-slots.json            ({ uniqueCount, rows, slots: id->slot })
 *
 * The 10,000 logical photo ids are preserved so the color matcher's inventory
 * and the rendered mosaic are unchanged; duplicate ids just map to the same
 * atlas slot. Run with: bun scripts/generate-deduped-atlas.ts
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const PHOTO_SIZE = 200;
const ATLAS_COLS = 40;
const PHOTOS_PER_ATLAS = ATLAS_COLS * 40; // 1600

const ASSETS_DIR = join(__dirname, '../src/animations/art-gallery/assets');
const ATLASES_DIR = join(ASSETS_DIR, 'atlases');

// Where photo `id` lives in the original 7-atlas layout.
const sourceLoc = (id: number) => {
  const atlasIndex = Math.floor(id / PHOTOS_PER_ATLAS);
  const inAtlas = id % PHOTOS_PER_ATLAS;
  return {
    atlasIndex,
    x: (inAtlas % ATLAS_COLS) * PHOTO_SIZE,
    y: Math.floor(inAtlas / ATLAS_COLS) * PHOTO_SIZE,
  };
};

async function main() {
  const manifest = JSON.parse(
    await readFile(join(ASSETS_DIR, 'photos-manifest.json'), 'utf-8'),
  ) as { photos: { id: number; lab: { l: number; a: number; b: number } }[] };

  const photos = manifest.photos;
  const sig = (p: (typeof photos)[number]) =>
    `${p.lab.l.toFixed(6)},${p.lab.a.toFixed(6)},${p.lab.b.toFixed(6)}`;

  // Assign a slot per unique signature in first-occurrence order; remember the
  // representative id (first id seen) so we can extract its pixels.
  const sigToSlot = new Map<string, number>();
  const slotRepId: number[] = [];
  const idToSlot: number[] = new Array(photos.length);

  for (const p of photos) {
    const s = sig(p);
    let slot = sigToSlot.get(s);
    if (slot === undefined) {
      slot = slotRepId.length;
      sigToSlot.set(s, slot);
      slotRepId.push(p.id);
    }
    idToSlot[p.id] = slot;
  }

  const uniqueCount = slotRepId.length;
  const rows = Math.ceil(uniqueCount / ATLAS_COLS);
  const atlasW = ATLAS_COLS * PHOTO_SIZE; // 8000
  const atlasH = rows * PHOTO_SIZE;

  console.log(
    `Unique: ${uniqueCount}/${photos.length} -> atlas ${atlasW}x${atlasH} (${rows} rows)`,
  );

  // Cache the 7 source atlases as raw buffers for fast region extraction.
  const sources = new Map<number, sharp.Sharp>();
  const getSource = (atlasIndex: number) => {
    let s = sources.get(atlasIndex);
    if (!s) {
      s = sharp(join(ATLASES_DIR, `photo-atlas-${atlasIndex}.jpg`));
      sources.set(atlasIndex, s);
    }
    return s.clone();
  };

  const composites: sharp.OverlayOptions[] = [];
  for (let slot = 0; slot < uniqueCount; slot++) {
    const loc = sourceLoc(slotRepId[slot]);
    const tile = await getSource(loc.atlasIndex)
      .extract({
        left: loc.x,
        top: loc.y,
        width: PHOTO_SIZE,
        height: PHOTO_SIZE,
      })
      .toBuffer();
    composites.push({
      input: tile,
      left: (slot % ATLAS_COLS) * PHOTO_SIZE,
      top: Math.floor(slot / ATLAS_COLS) * PHOTO_SIZE,
    });
    if ((slot + 1) % 200 === 0) console.log(`  extracted ${slot + 1}`);
  }

  await sharp({
    create: {
      width: atlasW,
      height: atlasH,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 100 })
    .toFile(join(ATLASES_DIR, 'deduped-atlas.jpg'));

  await writeFile(
    join(ASSETS_DIR, 'atlas-slots.json'),
    JSON.stringify({ uniqueCount, rows, cols: ATLAS_COLS, slots: idToSlot }),
  );

  console.log('Wrote deduped-atlas.jpg + atlas-slots.json');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
