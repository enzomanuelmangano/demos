import { rect } from '@shopify/react-native-skia';

import { GLYPH_CELL } from './constants';

import type { SkRect } from '@shopify/react-native-skia';

export interface Atlas {
  uniqueChars: string[];
  cols: number;
  width: number;
  height: number;
}

export interface AtlasGeometry extends Atlas {
  charToIndex: Map<string, number>;
  charSprite: SkRect[];
}

export const buildAtlas = (paragraph: string): AtlasGeometry => {
  const visible = Array.from(paragraph).filter(c => c !== ' ' && c !== '\n');
  const uniqueChars = Array.from(new Set(visible));
  const charToIndex = new Map(uniqueChars.map((c, i) => [c, i]));
  const cols = Math.ceil(Math.sqrt(uniqueChars.length));
  const rows = Math.ceil(uniqueChars.length / cols);
  const charSprite: SkRect[] = uniqueChars.map((_, i) =>
    rect(
      (i % cols) * GLYPH_CELL,
      Math.floor(i / cols) * GLYPH_CELL,
      GLYPH_CELL,
      GLYPH_CELL,
    ),
  );
  return {
    uniqueChars,
    charToIndex,
    cols,
    width: cols * GLYPH_CELL,
    height: rows * GLYPH_CELL,
    charSprite,
  };
};
