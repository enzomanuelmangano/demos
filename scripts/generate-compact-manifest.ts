/**
 * Generate a compact manifest format
 *
 * Original: 2.3MB JSON with nested objects
 * Compact: ~600KB flat array [r,g,b,l,a,b, r,g,b,l,a,b, ...]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ASSETS_DIR = join(
  __dirname,
  '../src/animations/art-gallery/assets',
);

interface PhotoEntry {
  id: number;
  rgb: { r: number; g: number; b: number };
  lab: { l: number; a: number; b: number };
}

async function main() {
  console.log('📦 Generating compact manifest...');

  // Read original manifest
  const manifestPath = join(ASSETS_DIR, 'photos-manifest.json');
  const manifestData = await readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestData) as { photos: PhotoEntry[] };

  // Create flat array: [r,g,b,l,a,b, r,g,b,l,a,b, ...]
  // 6 numbers per photo, photos ordered by ID
  const compact: number[] = [];

  // Sort by ID to ensure order
  const sorted = [...manifest.photos].sort((a, b) => a.id - b.id);

  for (const photo of sorted) {
    compact.push(
      photo.rgb.r,
      photo.rgb.g,
      photo.rgb.b,
      // Round LAB to 2 decimal places to save space
      Math.round(photo.lab.l * 100) / 100,
      Math.round(photo.lab.a * 100) / 100,
      Math.round(photo.lab.b * 100) / 100,
    );
  }

  // Write as compact JSON array
  const compactPath = join(ASSETS_DIR, 'photos-compact.json');
  await writeFile(compactPath, JSON.stringify(compact));

  const originalSize = manifestData.length;
  const compactSize = JSON.stringify(compact).length;

  console.log(`✅ Generated: ${compactPath}`);
  console.log(`   Original: ${(originalSize / 1024).toFixed(1)}KB`);
  console.log(`   Compact: ${(compactSize / 1024).toFixed(1)}KB`);
  console.log(`   Reduction: ${((1 - compactSize / originalSize) * 100).toFixed(1)}%`);
}

main().catch(console.error);
