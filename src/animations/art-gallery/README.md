# Art Gallery

A photo mosaic experience that recreates famous paintings using ~10,000 photos.

## What it does

The animation displays a grid of photos that can transform into famous paintings. Each painting is recreated by matching its colors to the closest-matching photos from the atlas, creating a mosaic effect.

## Features

- **Pinch to zoom** - Zoom into the mosaic to see individual photos
- **Double tap** - Quick zoom to a specific cell
- **Pan** - Navigate around when zoomed in
- **Grid mode** - When zoomed in enough, cells snap into place for easy browsing
- **Painting selection** - Use the header menu to switch between different paintings organized by art movement and painter

## Paintings

The gallery includes works from various art movements:
- Renaissance (Leonardo da Vinci, Raphael, Botticelli)
- Impressionism (Monet, Renoir, Degas)
- Post-Impressionism (Van Gogh, Cezanne, Seurat)
- And more...

## Technical Overview

### Rendering

The mosaic is rendered with WebGPU instanced rendering. All ~10,000 tiles are drawn in a single instanced draw call, with per-tile data (position, atlas UVs, animation state) supplied via storage buffers.

### Atlas (deduplicated, ASTC-compressed)

The mosaic shows 10,000 photo cells, but the source images come from `picsum.photos`, which serves from a small pool — so the 10k downloads collapse to only **~979 unique images**. Those uniques are packed into a **single atlas**; `assets/atlas-slots.json` maps each of the 10,000 logical photo ids to its slot, so duplicate ids share a tile. This keeps the matcher's inventory and the rendered mosaic identical to a non-deduped build.

The atlas ships as a single **ASTC 10×10** texture (`deduped-atlas.astc`). ASTC is sampled compressed by the GPU in hardware, so it stays ~6 MB in VRAM instead of expanding to a full rgba8 surface. (The original design used 7× 8000×8000 rgba8 atlases ≈ **1.7 GB resident**, which exceeded the iOS per-app memory budget and got the app jetsam-killed on device.) 10×10 blocks are required because the atlas dimensions are multiples of 10 — a `writeTexture` copy whose extent is not block-aligned fails and renders black.

Apple GPUs support ASTC natively, so there is no decoded fallback. Regenerate the atlas with `bun scripts/generate-deduped-atlas.ts` (then encode the resulting jpg to `.astc` with `astcenc … 10x10`).

### Color Matching

When a painting is selected, the image is analyzed to extract the average color of each grid cell. These colors are matched to the closest photos using LAB color distance (more perceptually accurate than RGB).

The matching runs in native C++ via Nitro modules, using parallel processing to match 10,000 cells in ~50ms. It uses bucketed greedy matching — photos are grouped by hue, and each cell picks the best available match from its bucket.

### Transitions

When switching paintings, tiles animate to their new positions with a shuffle effect, driven on the GPU via the render loop with a Reanimated shared value controlling the transition progress.
