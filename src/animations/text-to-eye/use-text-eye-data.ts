import { useMemo } from 'react';

import {
  AlphaType,
  ColorType,
  rect,
  useFont,
  useImage,
} from '@shopify/react-native-skia';
import type { SkFont, SkRect } from '@shopify/react-native-skia';

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
  PARAGRAPH,
  SAMPLE_GAMMA,
  SAMPLE_MODE,
  SAT_WEIGHT,
} from './constants';

const EYE_IMG = require('./assets/prince.png');
const PAGE_FONT = require('./assets/Newsreader.ttf');

// --- STATIC atlas geometry (depends only on PARAGRAPH) ---
const VISIBLE_CHARS = Array.from(PARAGRAPH).filter(c => c !== ' ' && c !== '\n');
export const UNIQUE_CHARS = Array.from(new Set(VISIBLE_CHARS));
const CHAR_TO_INDEX = new Map(UNIQUE_CHARS.map((c, i) => [c, i]));
export const ATLAS_COLS = Math.ceil(Math.sqrt(UNIQUE_CHARS.length));
export const ATLAS_ROWS = Math.ceil(UNIQUE_CHARS.length / ATLAS_COLS);
export const ATLAS_WIDTH = ATLAS_COLS * GLYPH_CELL;
export const ATLAS_HEIGHT = ATLAS_ROWS * GLYPH_CELL;

const CHAR_SPRITE: SkRect[] = UNIQUE_CHARS.map((_, i) =>
  rect(
    (i % ATLAS_COLS) * GLYPH_CELL,
    Math.floor(i / ATLAS_COLS) * GLYPH_CELL,
    GLYPH_CELL,
    GLYPH_CELL,
  ),
);

export interface Particle {
  charIndex: number;
  pageX: number; // cell center on the page
  pageY: number;
  eyeX: number;
  eyeY: number;
  delay: number; // 0..1 stagger order
  depth: number; // 0..1 per-letter camera nearness for the 3D surge
}

export interface TextEyeData {
  ready: boolean;
  particles: Particle[];
  sprites: SkRect[];
  font: SkFont | null;
}

export const useTextEyeData = (
  canvasWidth: number,
  canvasHeight: number,
): TextEyeData => {
  const eyeImage = useImage(EYE_IMG);
  const font = useFont(PAGE_FONT, GLYPH_FONT_SIZE);

  return useMemo(() => {
    const empty: TextEyeData = {
      ready: false,
      particles: [],
      sprites: [],
      font: null,
    };
    if (!font || !eyeImage || canvasWidth <= 0 || canvasHeight <= 0) {
      return empty;
    }

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
    const CHAR_ADV: number[] = UNIQUE_CHARS.map(advanceOf);
    const SPACE_ADV = advanceOf(' ');

    // --- proportional, word-wrapped page layout ---
    const ds = PAGE_GLYPH_SCALE; // display scale of atlas glyphs
    const half = (GLYPH_CELL / 2) * ds;
    const padX = GLYPH_PAD * ds; // left bearing baked into the atlas cell
    const marginX = canvasWidth * PAGE_MARGIN_FRAC;
    const marginY = canvasHeight * 0.13;
    const colRight = canvasWidth - marginX;
    const colBottom = canvasHeight - marginY;
    const lineHeight = GLYPH_FONT_SIZE * ds * 1.55;
    const spaceW = SPACE_ADV * ds;

    const particles: Particle[] = [];
    const sprites: SkRect[] = [];

    const words = PARAGRAPH.trim().split(/\s+/);
    let x = marginX;
    let y = marginY;
    let wi = 0;
    while (y <= colBottom) {
      const word = words[wi % words.length];
      wi++;
      // width of this word in display units
      let wordW = 0;
      for (const ch of word) {
        const idx = CHAR_TO_INDEX.get(ch);
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
          break;
        }
      }
      for (const ch of word) {
        const idx = CHAR_TO_INDEX.get(ch);
        if (idx === undefined) {
          continue;
        }
        const adv = CHAR_ADV[idx] * ds;
        // cell-left sits at x; glyph drawn padX into the cell
        const cellLeft = x - padX;
        particles.push({
          charIndex: idx,
          pageX: cellLeft + half,
          pageY: y + half,
          eyeX: cellLeft + half,
          eyeY: y + half,
          delay: 0,
          depth: 0,
        });
        sprites.push(CHAR_SPRITE[idx]);
        x += adv;
      }
      x += spaceW;
    }

    const N = particles.length;

    // --- sample eye targets (only the darkest pixels; image is dim) ---
    const imgW = eyeImage.width();
    const imgH = eyeImage.height();
    const pixels = eyeImage.readPixels(0, 0, {
      width: imgW,
      height: imgH,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });

    // Sample in image-pixel space first, then remap the CONTENT bounding box
    // (not the whole image) to the target box so the subject fills the screen
    // instead of inheriting the source image's empty margins.
    const raw: { px: number; py: number }[] = [];
    let minPX = imgW;
    let minPY = imgH;
    let maxPX = 0;
    let maxPY = 0;

    // ink probability for a pixel
    const inkProb = (rx: number, ry: number): number => {
      const p = (ry * imgW + rx) * 4;
      const r = pixels![p] / 255;
      const g = pixels![p + 1] / 255;
      const b = pixels![p + 2] / 255;
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

    if (pixels) {
      // Poisson-disk spacing: reject a point too close to an accepted one, so
      // letters never stack into ink blobs. Density still follows the image
      // (dark regions fill up to the min-distance limit; light stays sparse).
      const minDist = Math.max(imgW, imgH) * MIN_SPACING;
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
        if (x < minPX) minPX = x;
        if (x > maxPX) maxPX = x;
        if (y < minPY) minPY = y;
        if (y > maxPY) maxPY = y;
      };

      // pass 1 — spaced
      let guard = 0;
      const maxGuard = N * 800;
      while (raw.length < N && guard < maxGuard) {
        guard++;
        const rx = Math.floor(Math.random() * imgW);
        const ry = Math.floor(Math.random() * imgH);
        if (Math.random() < inkProb(rx, ry) && !tooClose(rx, ry)) {
          accept(rx, ry, true);
        }
      }
      // pass 2 — top up without spacing if the subject couldn't hold N
      let guard2 = 0;
      while (raw.length < N && guard2 < maxGuard) {
        guard2++;
        const rx = Math.floor(Math.random() * imgW);
        const ry = Math.floor(Math.random() * imgH);
        if (Math.random() < inkProb(rx, ry)) {
          accept(rx, ry, false);
        }
      }
    }

    // content bbox (fallback to full image if nothing sampled)
    if (raw.length === 0) {
      minPX = 0;
      minPY = 0;
      maxPX = imgW;
      maxPY = imgH;
    }
    const contentW = Math.max(1, maxPX - minPX);
    const contentH = Math.max(1, maxPY - minPY);
    const contentAspect = contentW / contentH;

    // fit the content into a centered box
    const boxW = canvasWidth * 0.9;
    const boxH = canvasHeight * 0.7;
    const areaW = Math.min(boxW, boxH * contentAspect);
    const areaH = areaW / contentAspect;
    const originX = (canvasWidth - areaW) / 2;
    const originY = (canvasHeight - areaH) / 2;

    const samples: { x: number; y: number }[] = raw.map(s => ({
      x: originX + ((s.px - minPX) / contentW) * areaW,
      y: originY + ((s.py - minPY) / contentH) * areaH,
    }));
    while (samples.length < N) {
      samples.push({
        x: originX + areaW * (0.4 + Math.random() * 0.2),
        y: originY + areaH * (0.4 + Math.random() * 0.2),
      });
    }

    // --- assignment: pair each page letter to a target by ANGULAR order
    // around each set's centroid. Keeps rotational coherence (top->top,
    // left->left) so letters travel short, mostly-parallel paths instead of
    // crossing the whole screen randomly. ---
    let pcx = 0;
    let pcy = 0;
    for (let i = 0; i < N; i++) {
      pcx += particles[i].pageX;
      pcy += particles[i].pageY;
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

    const pageOrder = particles
      .map((p, i) => ({ i, a: Math.atan2(p.pageY - pcy, p.pageX - pcx) }))
      .sort((u, v) => u.a - v.a);
    const sampleOrder = samples
      .map((s, i) => ({ i, a: Math.atan2(s.y - scy, s.x - scx) }))
      .sort((u, v) => u.a - v.a);

    // Ripple origin = the floating button (bottom-right corner). Letters
    // nearest it animate first, so the morph sweeps out from where you tapped.
    const ax = canvasWidth;
    const ay = canvasHeight;
    let maxR = 1;
    for (let i = 0; i < N; i++) {
      const dx = particles[i].pageX - ax;
      const dy = particles[i].pageY - ay;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > maxR) {
        maxR = r;
      }
    }

    for (let k = 0; k < N; k++) {
      const pi = pageOrder[k].i;
      const s = samples[sampleOrder[k].i];
      particles[pi].eyeX = s.x;
      particles[pi].eyeY = s.y;
      const dx = particles[pi].pageX - ax;
      const dy = particles[pi].pageY - ay;
      const ripple = Math.sqrt(dx * dx + dy * dy) / maxR;
      // mostly distance-driven ripple + a little jitter so the front isn't rigid
      particles[pi].delay = ripple * 0.85 + Math.random() * 0.15;
      particles[pi].depth = Math.random();
    }

    return { ready: true, particles, sprites, font };
  }, [font, eyeImage, canvasWidth, canvasHeight]);
};
