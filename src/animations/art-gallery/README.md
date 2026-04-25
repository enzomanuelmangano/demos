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

The mosaic is rendered using WebGPU with instance rendering. Each of the ~10,000 tiles is rendered in a single draw call using instanced rendering, with per-tile data (position, texture coordinates, animation state) passed via storage buffers.

Photos are stored in 7 atlas textures (8000x8000 pixels each) to minimize texture switches and enable efficient batched rendering.

### Color Matching

When a painting is selected, the image is analyzed to extract the average color of each grid cell. These colors are then matched to the closest photos using LAB color distance (which better represents perceptual color similarity than RGB).

The matching algorithm runs in native C++ via Nitro modules, using parallel processing to match 10,000 cells in ~50ms. The algorithm uses bucketed greedy matching - photos are grouped by hue, and each cell picks the best available match from its bucket.

### Transitions

When switching paintings, tiles animate to their new positions with a shuffle effect. The animation is driven entirely on the GPU via the render loop, with shared values from Reanimated controlling the transition progress.

### Atlas Loading

Atlases are loaded sequentially to avoid memory spikes (loading all 7 in parallel would require ~3.6GB of decoded pixel data). As each atlas loads, tiles reveal progressively with a randomized elastic animation.
