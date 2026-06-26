import { useEffect, useMemo, useState } from 'react';

import {
  AlphaType,
  ColorType,
  rect,
  useFont,
  useImage,
} from '@shopify/react-native-skia';

import {
  GLYPH_CELL,
  GLYPH_FONT_SIZE,
  GLYPH_PAD,
  INK_FLOOR,
  LUM_HI,
  LUM_LO,
  MIN_SPACING,
  PAGE_GLYPH_SCALE,
  PAGE_MARGIN_FRAC,
  PICTURE_BOX_H_FRAC,
  PICTURE_BOX_W_FRAC,
  PRUNE_MIN_NEIGHBOURS,
  PRUNE_RADIUS_FACTOR,
  RIPPLE_JITTER,
  SAMPLE_GAMMA,
  SAMPLE_MAX_TRIES_PER_LETTER,
  SAMPLE_MODE,
  SAT_WEIGHT,
} from './constants';

import type {
  DataSourceParam,
  SkFont,
  SkImage,
  SkRect,
} from '@shopify/react-native-skia';

// Bundled serif used for the page text (generic to the engine).
const PAGE_FONT = require('./assets/Newsreader.ttf');

// Offscreen glyph-atlas geometry, derived from the instance's paragraph.
export interface Atlas {
  uniqueChars: string[];
  cols: number;
  width: number;
  height: number;
}

// Flat per-letter morph data, filled by the (deferred) picture sampling. xy is
// interleaved [x0,y0,x1,y1,...]; delays is 0..1 stagger order per letter.
export interface MorphTargets {
  picXY: Float32Array;
  delays: Float32Array;
}

export interface TextImageMorphData {
  ready: boolean;
  // page positions of every laid-out glyph, interleaved [x,y,...]
  pageXY: Float32Array;
  // sprite rect into the atlas for each glyph (same order as pageXY)
  sprites: SkRect[];
  font: SkFont | null;
  atlas: Atlas;
  // null until the deferred sampling completes; then the morph can run
  targets: MorphTargets | null;
}

interface AtlasGeometry extends Atlas {
  charToIndex: Map<string, number>;
  charSprite: SkRect[];
}

interface Layout {
  pageXY: Float32Array;
  sprites: SkRect[];
}

interface Point {
  px: number;
  py: number;
}

const EMPTY_F32 = new Float32Array(0);
const EMPTY_SPRITES: SkRect[] = [];

// --- atlas geometry from the paragraph's unique glyphs ---
const buildAtlas = (paragraph: string): AtlasGeometry => {
  const visible = Array.from(paragraph).filter(c => c !== ' ' && c !== '\n');
  const uniqueChars = Array.from(new Set(visible));
  const charToIndex = new Map(uniqueChars.map((c, i) => [c, i]));
  const cols = Math.ceil(Math.sqrt(uniqueChars.length));
  const rows = Math.ceil(uniqueChars.length / cols);
  const width = cols * GLYPH_CELL;
  const height = rows * GLYPH_CELL;
  const charSprite: SkRect[] = uniqueChars.map((_, i) =>
    rect(
      (i % cols) * GLYPH_CELL,
      Math.floor(i / cols) * GLYPH_CELL,
      GLYPH_CELL,
      GLYPH_CELL,
    ),
  );
  return { uniqueChars, charToIndex, cols, width, height, charSprite };
};

// --- CHEAP: word-wrapped page layout. Runs synchronously so the page text can
// paint immediately; the morph targets are sampled later. ---
const buildLayout = (
  atlas: AtlasGeometry,
  paragraph: string,
  font: SkFont,
  canvasWidth: number,
  canvasHeight: number,
): Layout => {
  const { uniqueChars, charToIndex, charSprite } = atlas;

  // real ADVANCE width per glyph (incl. side bearings) — NOT the bounding
  // box (measureText), which gives uneven, cramped spacing.
  const advanceOf = (ch: string): number => {
    const ids = font.getGlyphIDs(ch);
    if (!ids.length) {
      return GLYPH_FONT_SIZE * 0.5;
    }
    const w = font.getGlyphWidths(ids)[0];
    return Number.isFinite(w) && w > 0 ? w : GLYPH_FONT_SIZE * 0.5;
  };
  const CHAR_ADV: number[] = uniqueChars.map(advanceOf);
  const SPACE_ADV = advanceOf(' ');

  const ds = PAGE_GLYPH_SCALE; // display scale of atlas glyphs
  const half = (GLYPH_CELL / 2) * ds;
  const padX = GLYPH_PAD * ds; // left bearing baked into the atlas cell
  const marginX = canvasWidth * PAGE_MARGIN_FRAC;
  const marginY = canvasHeight * 0.13;
  const colRight = canvasWidth - marginX;
  const colBottom = canvasHeight - marginY;
  const lineHeight = GLYPH_FONT_SIZE * ds * 1.55;
  const spaceW = SPACE_ADV * ds;

  const pagePts: number[] = [];
  const sprites: SkRect[] = [];

  // Paragraphs (split on '\n'); each starts on a fresh line, first line
  // indented. Laid out once, no looping — page ends when text/space runs out.
  const paragraphs = paragraph
    .trim()
    .split('\n')
    .map(p => p.trim())
    .filter(Boolean);
  const indent = spaceW * 3; // first-line indent
  let y = marginY;
  let placed = true;
  for (let pi = 0; pi < paragraphs.length && placed; pi++) {
    const words = paragraphs[pi].split(/\s+/);
    let x = marginX + indent;
    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi];
      // width of this word in display units
      let wordW = 0;
      for (const ch of word) {
        const idx = charToIndex.get(ch);
        if (idx === undefined) {
          continue;
        }
        wordW += CHAR_ADV[idx] * ds;
      }
      // wrap on word boundary
      if (x + wordW > colRight && x > marginX) {
        x = marginX;
        y += lineHeight;
        if (y > colBottom) {
          placed = false;
          break;
        }
      }
      for (const ch of word) {
        const idx = charToIndex.get(ch);
        if (idx === undefined) {
          continue;
        }
        const adv = CHAR_ADV[idx] * ds;
        // cell-left sits at x; glyph drawn padX into the cell
        const cellLeft = x - padX;
        pagePts.push(cellLeft + half, y + half);
        sprites.push(charSprite[idx]);
        x += adv;
      }
      x += spaceW;
    }
    // paragraph break — next paragraph starts on a new line
    y += lineHeight;
    if (y > colBottom) {
      placed = false;
    }
  }

  return { pageXY: Float32Array.from(pagePts), sprites };
};

// --- ink probability for a pixel: how strongly a letter should land here ---
const makeInkProb =
  (pixels: Uint8Array, imgW: number) =>
  (rx: number, ry: number): number => {
    const p = (ry * imgW + rx) * 4;
    const r = pixels[p] / 255;
    const g = pixels[p + 1] / 255;
    const b = pixels[p + 2] / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let t: number;
    if (SAMPLE_MODE === 'ink') {
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx <= 0 ? 0 : (mx - mn) / mx;
      const ink = Math.max(1 - lum, sat * SAT_WEIGHT);
      t = Math.max(0, Math.min(1, (ink - INK_FLOOR) / (1 - INK_FLOOR)));
    } else {
      t = Math.max(0, Math.min(1, (LUM_HI - lum) / (LUM_HI - LUM_LO)));
    }
    return Math.pow(t, SAMPLE_GAMMA);
  };

// --- sample N points across the image, density following the ink, spaced by a
// Poisson-disk grid so letters never stack into blobs. ---
const sampleInkPoints = (
  pixels: Uint8Array,
  imgW: number,
  imgH: number,
  count: number,
  minDist: number,
): Point[] => {
  const inkProb = makeInkProb(pixels, imgW);
  const raw: Point[] = [];
  const minD2 = minDist * minDist;
  const cell = minDist;
  const gh = Math.ceil(imgH / cell) + 1;
  const grid = new Map<number, number[]>();
  const key = (gx: number, gy: number) => gx * gh + gy;
  const tooClose = (x: number, y: number): boolean => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let ix = gx - 1; ix <= gx + 1; ix++) {
      for (let iy = gy - 1; iy <= gy + 1; iy++) {
        const arr = grid.get(key(ix, iy));
        if (!arr) {
          continue;
        }
        for (let k = 0; k < arr.length; k += 2) {
          const dx = arr[k] - x;
          const dy = arr[k + 1] - y;
          if (dx * dx + dy * dy < minD2) {
            return true;
          }
        }
      }
    }
    return false;
  };
  const accept = (x: number, y: number, spaced: boolean) => {
    if (spaced) {
      const k = key(Math.floor(x / cell), Math.floor(y / cell));
      let a = grid.get(k);
      if (!a) {
        a = [];
        grid.set(k, a);
      }
      a.push(x, y);
    }
    raw.push({ px: x, py: y });
  };

  const maxGuard = count * SAMPLE_MAX_TRIES_PER_LETTER;
  // pass 1 — spaced (density ∝ ink, never closer than minDist)
  let guard = 0;
  while (raw.length < count && guard < maxGuard) {
    guard++;
    const rx = Math.floor(Math.random() * imgW);
    const ry = Math.floor(Math.random() * imgH);
    if (Math.random() < inkProb(rx, ry) && !tooClose(rx, ry)) {
      accept(rx, ry, true);
    }
  }
  // pass 2 — top up without spacing if the subject couldn't hold count
  let guard2 = 0;
  while (raw.length < count && guard2 < maxGuard) {
    guard2++;
    const rx = Math.floor(Math.random() * imgW);
    const ry = Math.floor(Math.random() * imgH);
    if (Math.random() < inkProb(rx, ry)) {
      accept(rx, ry, false);
    }
  }
  return raw;
};

// --- prune isolated strays, redistribute onto the figure. Probabilistic
// sampling scatters a few lonely letters into the background; count each
// point's neighbours, drop the lonely ones, and re-seed replacements jittered
// onto dense points so the silhouette reads clean and the count is preserved. ---
const pruneStrays = (raw: Point[], minDist: number, imgH: number): Point[] => {
  if (raw.length <= 8) {
    return raw;
  }
  const R = minDist * PRUNE_RADIUS_FACTOR;
  const R2 = R * R;
  const cell = R;
  const gh = Math.ceil(imgH / cell) + 1;
  const grid = new Map<number, number[]>();
  const key = (gx: number, gy: number) => gx * gh + gy;
  for (let i = 0; i < raw.length; i++) {
    const gx = Math.floor(raw[i].px / cell);
    const gy = Math.floor(raw[i].py / cell);
    const k = key(gx, gy);
    let a = grid.get(k);
    if (!a) {
      a = [];
      grid.set(k, a);
    }
    a.push(i);
  }
  const neighbours = (i: number): number => {
    const gx = Math.floor(raw[i].px / cell);
    const gy = Math.floor(raw[i].py / cell);
    let n = 0;
    for (let ix = gx - 1; ix <= gx + 1; ix++) {
      for (let iy = gy - 1; iy <= gy + 1; iy++) {
        const arr = grid.get(key(ix, iy));
        if (!arr) {
          continue;
        }
        for (const j of arr) {
          if (j === i) {
            continue;
          }
          const dx = raw[j].px - raw[i].px;
          const dy = raw[j].py - raw[i].py;
          if (dx * dx + dy * dy < R2) {
            n++;
          }
        }
      }
    }
    return n;
  };
  const keep = raw.filter((_, i) => neighbours(i) >= PRUNE_MIN_NEIGHBOURS);
  if (keep.length <= 8) {
    return raw; // too aggressive — keep the original set
  }
  const missing = raw.length - keep.length;
  for (let m = 0; m < missing; m++) {
    const seed = keep[Math.floor(Math.random() * keep.length)];
    keep.push({
      px: seed.px + (Math.random() - 0.5) * minDist,
      py: seed.py + (Math.random() - 0.5) * minDist,
    });
  }
  return keep;
};

interface ScreenPoint {
  x: number;
  y: number;
}

// --- map sampled image-space points into a centered box on screen, fitting the
// CONTENT bounding box (not the whole image) so the subject fills the frame. ---
const fitToBox = (
  raw: Point[],
  canvasWidth: number,
  canvasHeight: number,
  count: number,
): ScreenPoint[] => {
  let minPX = Infinity;
  let minPY = Infinity;
  let maxPX = -Infinity;
  let maxPY = -Infinity;
  for (const s of raw) {
    if (s.px < minPX) minPX = s.px;
    if (s.px > maxPX) maxPX = s.px;
    if (s.py < minPY) minPY = s.py;
    if (s.py > maxPY) maxPY = s.py;
  }
  if (raw.length === 0) {
    minPX = 0;
    minPY = 0;
    maxPX = 1;
    maxPY = 1;
  }
  const contentW = Math.max(1, maxPX - minPX);
  const contentH = Math.max(1, maxPY - minPY);
  const contentAspect = contentW / contentH;

  const boxW = canvasWidth * PICTURE_BOX_W_FRAC;
  const boxH = canvasHeight * PICTURE_BOX_H_FRAC;
  const areaW = Math.min(boxW, boxH * contentAspect);
  const areaH = areaW / contentAspect;
  const originX = (canvasWidth - areaW) / 2;
  const originY = (canvasHeight - areaH) / 2;

  const samples: ScreenPoint[] = raw.map(s => ({
    x: originX + ((s.px - minPX) / contentW) * areaW,
    y: originY + ((s.py - minPY) / contentH) * areaH,
  }));
  // safety pad: if sampling fell short, drop the rest near the centre
  while (samples.length < count) {
    samples.push({
      x: originX + areaW * (0.4 + Math.random() * 0.2),
      y: originY + areaH * (0.4 + Math.random() * 0.2),
    });
  }
  return samples;
};

// --- pair each page letter to a picture target by ANGULAR order around each
// set's centroid (keeps rotational coherence so letters travel short, mostly
// parallel paths), and stagger the ripple out of the bottom-right button. ---
const assignTargets = (
  pageXY: Float32Array,
  samples: ScreenPoint[],
  canvasWidth: number,
  canvasHeight: number,
): MorphTargets => {
  const N = pageXY.length / 2;
  const picXY = new Float32Array(N * 2);
  const delays = new Float32Array(N);

  let pcx = 0;
  let pcy = 0;
  for (let i = 0; i < N; i++) {
    pcx += pageXY[i * 2];
    pcy += pageXY[i * 2 + 1];
  }
  pcx /= N;
  pcy /= N;
  let scx = 0;
  let scy = 0;
  for (let i = 0; i < N; i++) {
    scx += samples[i].x;
    scy += samples[i].y;
  }
  scx /= N;
  scy /= N;

  const pageOrder = Array.from({ length: N }, (_, i) => ({
    i,
    a: Math.atan2(pageXY[i * 2 + 1] - pcy, pageXY[i * 2] - pcx),
  })).sort((u, v) => u.a - v.a);
  const sampleOrder = samples
    .map((s, i) => ({ i, a: Math.atan2(s.y - scy, s.x - scx) }))
    .sort((u, v) => u.a - v.a);

  // Ripple origin = the floating button (bottom-right corner). Letters nearest
  // it animate first, so the morph sweeps out from where you tapped.
  const ax = canvasWidth;
  const ay = canvasHeight;
  let maxR = 1;
  for (let i = 0; i < N; i++) {
    const dx = pageXY[i * 2] - ax;
    const dy = pageXY[i * 2 + 1] - ay;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > maxR) {
      maxR = r;
    }
  }

  for (let k = 0; k < N; k++) {
    const pi = pageOrder[k].i;
    const s = samples[sampleOrder[k].i];
    picXY[pi * 2] = s.x;
    picXY[pi * 2 + 1] = s.y;
    const dx = pageXY[pi * 2] - ax;
    const dy = pageXY[pi * 2 + 1] - ay;
    const ripple = Math.sqrt(dx * dx + dy * dy) / maxR;
    // smootherstep the wave front so it eases out of the button and eases into
    // the far edge — organic, not a rigid linear sweep.
    const e = ripple * ripple * ripple * (ripple * (ripple * 6 - 15) + 10);
    // mostly distance-driven + a little jitter so the front isn't rigid
    delays[pi] = e * (1 - RIPPLE_JITTER) + Math.random() * RIPPLE_JITTER;
  }

  return { picXY, delays };
};

// --- EXPENSIVE: full sampling pipeline for the morph targets. Reads the image
// then sample -> prune -> fit -> assign. Kept off the first-paint critical path
// (see useTextImageMorph). ---
const computeTargets = (
  pageXY: Float32Array,
  pictureImage: SkImage,
  canvasWidth: number,
  canvasHeight: number,
): MorphTargets => {
  const N = pageXY.length / 2;
  const imgW = pictureImage.width();
  const imgH = pictureImage.height();
  const pixels = pictureImage.readPixels(0, 0, {
    width: imgW,
    height: imgH,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });

  let raw: Point[] = [];
  if (pixels) {
    const minDist = Math.max(imgW, imgH) * MIN_SPACING;
    raw = sampleInkPoints(pixels as Uint8Array, imgW, imgH, N, minDist);
    raw = pruneStrays(raw, minDist, imgH);
  }

  const samples = fitToBox(raw, canvasWidth, canvasHeight, N);
  return assignTargets(pageXY, samples, canvasWidth, canvasHeight);
};

interface Params {
  image: DataSourceParam;
  paragraph: string;
  width: number;
  height: number;
}

export const useTextImageMorph = ({
  image,
  paragraph,
  width,
  height,
}: Params): TextImageMorphData => {
  const pictureImage = useImage(image);
  const font = useFont(PAGE_FONT, GLYPH_FONT_SIZE);

  // Atlas geometry depends only on the (stable) paragraph.
  const atlas = useMemo(() => buildAtlas(paragraph), [paragraph]);

  // Cheap layout — drives the immediate page text paint.
  const layout = useMemo(() => {
    if (!font || width <= 0 || height <= 0) {
      return null;
    }
    return buildLayout(atlas, paragraph, font, width, height);
  }, [atlas, paragraph, font, width, height]);

  // Expensive picture-target sampling — deferred until after the first paint so
  // the text shows instantly; the morph targets arrive a beat later as an
  // immutable object (the renderer keys its buffers off its identity).
  const [targets, setTargets] = useState<MorphTargets | null>(null);
  useEffect(() => {
    setTargets(null);
    if (!layout || !pictureImage) {
      return;
    }
    let cancelled = false;
    // defer past the first paint (macrotask) so the heavy sampling doesn't
    // block the initial render of the page text.
    const id = setTimeout(() => {
      if (cancelled) {
        return;
      }
      const t = computeTargets(layout.pageXY, pictureImage, width, height);
      if (!cancelled) {
        setTargets(t);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [layout, pictureImage, width, height]);

  return {
    ready: !!layout && !!font,
    pageXY: layout?.pageXY ?? EMPTY_F32,
    sprites: layout?.sprites ?? EMPTY_SPRITES,
    font: font ?? null,
    atlas,
    targets,
  };
};
