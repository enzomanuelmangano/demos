# Art Gallery - Photo Mosaic

A WebGPU-powered photo mosaic animation that transforms ~10,000 photos into famous paintings.

## Performance Optimizations

### 1. Native C++ Color Matching (Nitro)

**Problem:** Matching 10,000 grid cells to 10,000 photos using LAB color distance was taking ~1000ms in JavaScript.

**Solution:** Moved the color matching algorithm to C++ using Nitro modules.

**Benefits:**
- **~20x speedup**: 1000ms → 45-60ms
- Parallel RGB→LAB conversion using `std::thread`
- Parallel bucket processing for greedy matching
- LAB conversion happens entirely in native code

**Files:**
- `src/native/ColorMatcher/HybridColorMatcher.cpp` - C++ implementation
- `src/native/ColorMatcher/ColorMatcher.nitro.ts` - Nitro interface

### 2. Skia.Data.fromURI for Painting Loading

**Problem:** Loading paintings via `fetch` + `arrayBuffer` + `Skia.Data.fromBytes` had unnecessary overhead.

**Solution:** Use `Skia.Data.fromURI` directly which handles the fetch internally.

**Benefits:**
- Simpler code path
- Slightly faster loading (~10-20ms savings)

### 3. Sequential Atlas Loading (Memory Optimization)

**Problem:** Loading 7 atlas images (8000x8000 each, ~256MB decoded) in parallel caused memory spikes of ~3.6GB, leading to crashes.

**Solution:** Load atlases sequentially, one at a time.

**Benefits:**
- **No more crashes**: Peak memory ~500MB instead of ~3.6GB
- Each atlas: ~130ms (100ms readPixels + 30ms GPU upload)
- Total: ~1 second for all 7 atlases

### 4. Progressive Atlas Loading with Random Reveal (UX)

**Problem:** Users saw nothing for ~1 second while all atlases loaded.

**Solution:** Start rendering immediately, tiles pop in randomly with elastic animation as atlases load.

**Implementation:**
- Each tile has a pseudo-random delay based on its instance index
- Reveal progress animates smoothly in the render loop (no Reanimated overhead)
- Tiles scale from 0 to 1 with slight overshoot for satisfying pop effect
- Bind group is recreated after each atlas completes

**Benefits:**
- Immediate visual feedback with engaging reveal animation
- Photos appear scattered randomly, creating a playful effect
- Smooth 60fps animation driven by the render loop

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    WebGPU Renderer                       │
│  - 7 atlas textures (8000x8000 each)                    │
│  - Instance rendering for 10,000+ tiles                  │
│  - Smooth transitions between paintings                  │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│              Nitro Color Matcher (C++)                   │
│  - RGB→LAB conversion (parallel)                         │
│  - Bucketed greedy matching (parallel)                   │
│  - ~45-60ms for 10,000 cells                            │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│               Painting Analysis (Skia)                   │
│  - Load painting via Skia.Data.fromURI                  │
│  - Sample grid cell colors                               │
│  - ~50-150ms total                                       │
└─────────────────────────────────────────────────────────┘
```

## Timing Breakdown

| Operation | Time |
|-----------|------|
| Painting load + analysis | ~100-200ms |
| Color matching (C++) | ~45-60ms |
| Atlas prefetch | ~500-800ms |
| Atlas decode (per atlas) | ~130ms |
| Total atlas loading | ~1000ms |

## Known Limitations

- **readPixels bottleneck**: Copying 256MB from Skia to CPU takes ~100ms per atlas. This is memory bandwidth limited.
- **copyExternalImageToTexture**: Would skip the CPU roundtrip but has threading issues in react-native-wgpu.
- **GPU compressed textures (ASTC)**: Would eliminate decode time entirely but requires build-time conversion.
