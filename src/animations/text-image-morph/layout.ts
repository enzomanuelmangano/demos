import {
  GLYPH_CELL,
  GLYPH_FONT_SIZE,
  GLYPH_PAD,
  PAGE_GLYPH_SCALE,
  PAGE_MARGIN_FRAC,
} from './constants';

import type { AtlasGeometry } from './atlas';
import type { SkFont, SkRect } from '@shopify/react-native-skia';

export interface Layout {
  pageXY: Float32Array; // interleaved [x,y,...] page position per glyph
  sprites: SkRect[]; // atlas sprite per glyph, same order
}

// Word-wrapped page layout. Cheap + synchronous so the text can paint before
// the morph targets are sampled.
export const buildLayout = (
  atlas: AtlasGeometry,
  paragraph: string,
  font: SkFont,
  canvasWidth: number,
  canvasHeight: number,
): Layout => {
  const { uniqueChars, charToIndex, charSprite } = atlas;

  // glyph ADVANCE width (incl. side bearings), not the bounding box
  const advanceOf = (ch: string): number => {
    const ids = font.getGlyphIDs(ch);
    if (!ids.length) {
      return GLYPH_FONT_SIZE * 0.5;
    }
    const w = font.getGlyphWidths(ids)[0];
    return Number.isFinite(w) && w > 0 ? w : GLYPH_FONT_SIZE * 0.5;
  };
  const charAdvance = uniqueChars.map(advanceOf);
  const spaceAdvance = advanceOf(' ');

  const ds = PAGE_GLYPH_SCALE;
  const half = (GLYPH_CELL / 2) * ds;
  const padX = GLYPH_PAD * ds;
  const marginX = canvasWidth * PAGE_MARGIN_FRAC;
  const marginY = canvasHeight * 0.13;
  const colRight = canvasWidth - marginX;
  const colBottom = canvasHeight - marginY;
  const lineHeight = GLYPH_FONT_SIZE * ds * 1.55;
  const spaceW = spaceAdvance * ds;
  const indent = spaceW * 3;

  const pagePts: number[] = [];
  const sprites: SkRect[] = [];

  // one paragraph per '\n', each on a fresh indented line; no looping
  const paragraphs = paragraph
    .trim()
    .split('\n')
    .map(p => p.trim())
    .filter(Boolean);

  let y = marginY;
  let placed = true;
  for (let pi = 0; pi < paragraphs.length && placed; pi++) {
    const words = paragraphs[pi].split(/\s+/);
    let x = marginX + indent;
    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi];
      let wordW = 0;
      for (const ch of word) {
        const idx = charToIndex.get(ch);
        if (idx !== undefined) {
          wordW += charAdvance[idx] * ds;
        }
      }
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
        const cellLeft = x - padX;
        pagePts.push(cellLeft + half, y + half);
        sprites.push(charSprite[idx]);
        x += charAdvance[idx] * ds;
      }
      x += spaceW;
    }
    y += lineHeight;
    if (y > colBottom) {
      placed = false;
    }
  }

  return { pageXY: Float32Array.from(pagePts), sprites };
};
