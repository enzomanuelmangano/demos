import { AlphaType, ColorType } from '@shopify/react-native-skia';

import {
  INK_FLOOR,
  LUM_HI,
  LUM_LO,
  MIN_SPACING,
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

import type { SkImage } from '@shopify/react-native-skia';

export interface MorphTargets {
  picXY: Float32Array;
  delays: Float32Array;
}

interface Point {
  px: number;
  py: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

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

// Poisson-disk sample: density follows the ink, never closer than minDist.
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
  let guard = 0;
  while (raw.length < count && guard < maxGuard) {
    guard++;
    const rx = Math.floor(Math.random() * imgW);
    const ry = Math.floor(Math.random() * imgH);
    if (Math.random() < inkProb(rx, ry) && !tooClose(rx, ry)) {
      accept(rx, ry, true);
    }
  }
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

// Drop lonely strays, re-seed onto dense points so the silhouette reads clean
// and the count is preserved.
const pruneStrays = (raw: Point[], minDist: number, imgH: number): Point[] => {
  if (raw.length <= 8) {
    return raw;
  }
  const R2 = (minDist * PRUNE_RADIUS_FACTOR) ** 2;
  const cell = minDist * PRUNE_RADIUS_FACTOR;
  const gh = Math.ceil(imgH / cell) + 1;
  const grid = new Map<number, number[]>();
  const key = (gx: number, gy: number) => gx * gh + gy;
  for (let i = 0; i < raw.length; i++) {
    const k = key(Math.floor(raw[i].px / cell), Math.floor(raw[i].py / cell));
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
    return raw;
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

// Map points into a centred box, fitting the content bbox so the subject fills
// the frame (not the image's empty margins).
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
  const aspect = contentW / contentH;

  const areaW = Math.min(
    canvasWidth * PICTURE_BOX_W_FRAC,
    canvasHeight * PICTURE_BOX_H_FRAC * aspect,
  );
  const areaH = areaW / aspect;
  const originX = (canvasWidth - areaW) / 2;
  const originY = (canvasHeight - areaH) / 2;

  const samples: ScreenPoint[] = raw.map(s => ({
    x: originX + ((s.px - minPX) / contentW) * areaW,
    y: originY + ((s.py - minPY) / contentH) * areaH,
  }));
  while (samples.length < count) {
    samples.push({
      x: originX + areaW * (0.4 + Math.random() * 0.2),
      y: originY + areaH * (0.4 + Math.random() * 0.2),
    });
  }
  return samples;
};

// Pair page letters to targets by angular order around each centroid (short,
// parallel paths), and stagger the ripple out of the bottom-right button.
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
  let scx = 0;
  let scy = 0;
  for (let i = 0; i < N; i++) {
    pcx += pageXY[i * 2];
    pcy += pageXY[i * 2 + 1];
    scx += samples[i].x;
    scy += samples[i].y;
  }
  pcx /= N;
  pcy /= N;
  scx /= N;
  scy /= N;

  const pageOrder = Array.from({ length: N }, (_, i) => ({
    i,
    a: Math.atan2(pageXY[i * 2 + 1] - pcy, pageXY[i * 2] - pcx),
  })).sort((u, v) => u.a - v.a);
  const sampleOrder = samples
    .map((s, i) => ({ i, a: Math.atan2(s.y - scy, s.x - scx) }))
    .sort((u, v) => u.a - v.a);

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
    const e = ripple * ripple * ripple * (ripple * (ripple * 6 - 15) + 10); // smootherstep
    delays[pi] = e * (1 - RIPPLE_JITTER) + Math.random() * RIPPLE_JITTER;
  }

  return { picXY, delays };
};

// sample -> prune -> fit -> assign. Heavy; runs off the first-paint path.
export const computeTargets = (
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
