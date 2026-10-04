import { Image } from 'react-native';

import { Skia } from 'react-native-skia';

import type { SkFont, SkImage, SkTypeface } from 'react-native-skia';

/**
 * The glyph atlas.
 *
 * Skia rasterises each distinct glyph the paragraph engine chose — by ID, not
 * by character, so a ligature is one cell because it is one glyph — and the
 * coverage crosses to the GPU. From that moment the shader is drawing textured
 * quads and neither knows nor cares that a font was involved.
 *
 * The brief is not "looks like the page". It is that a quad drawn over its
 * letter is the SAME PIXELS, so the handoff from vector text to textured quad
 * cannot be seen. Three things buy that:
 *
 * The font is the paragraph's own SkFont object — same subpixel positioning,
 * hinting and edging — drawn through a canvas scaled by the pixel ratio, which
 * is how the on-screen canvas draws it too. Same strike, same mask.
 *
 * Skia places a glyph at quarter-pixel horizontal positions and whole-pixel
 * vertical ones; the mask differs for each of the four phases. So each glyph
 * has four cells, one per phase, and the shader picks the one Skia would have
 * used for the letter's actual x.
 *
 * It is drawn in ink on transparent, and the alpha channel is the coverage.
 * White on black would carry a different gamma treatment from dark ink and
 * come out a hair lighter — visibly, on a page of small type.
 */

export const loadTypeface = async (
  font: ReturnType<typeof require>,
): Promise<SkTypeface | null> => {
  const resolved = Image.resolveAssetSource(font);
  if (!resolved?.uri) {
    return null;
  }
  const data = await Skia.Data.fromURI(resolved.uri);
  return Skia.Typeface.MakeFreeTypeFaceFromData(data);
};

/** Skia's horizontal subpixel resolution for axis-aligned text. */
export const SUBPIXEL_PHASES = 4;

export interface GlyphAtlas {
  image: SkImage;
  width: number;
  height: number;
  /** Cells per row; cell index = glyph index * SUBPIXEL_PHASES + phase. */
  cols: number;
  /** Cell edge in device pixels. */
  cell: number;
  /** Glyph origin within a cell, in device pixels (whole numbers). */
  originX: number;
  originY: number;
}

export const buildGlyphAtlas = (
  font: SkFont,
  glyphIds: number[],
  fontSize: number,
  pixelRatio: number,
  ink: string,
): GlyphAtlas | null => {
  // Room for the tallest cap with its accent above the baseline and a
  // descender below, and for a wide glyph's side bearings: 1.6 em, with the
  // origin a little in from the left and 1.1 em down.
  const em = fontSize * pixelRatio;
  const cell = Math.ceil(em * 1.6);
  const originX = Math.round(em * 0.2);
  const originY = Math.round(em * 1.1);

  const cells = glyphIds.length * SUBPIXEL_PHASES;
  const cols = Math.ceil(Math.sqrt(cells));
  const rows = Math.ceil(cells / cols);
  const width = cols * cell;
  const height = rows * cell;

  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) {
    return null;
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('transparent'));
  canvas.scale(pixelRatio, pixelRatio);

  const paint = Skia.Paint();
  paint.setColor(Skia.Color(ink));
  paint.setAntiAlias(true);

  glyphIds.forEach((id, g) => {
    for (let phase = 0; phase < SUBPIXEL_PHASES; phase++) {
      const index = g * SUBPIXEL_PHASES + phase;
      const left = (index % cols) * cell;
      const top = Math.floor(index / cols) * cell;
      // Device-pixel positions, handed over in points because the canvas is
      // scaled: Skia maps them back to exactly these device pixels, then
      // rounds x to the quarter and y to the whole — which is where they are.
      canvas.drawGlyphs(
        [id],
        [
          {
            x: (left + originX + phase / SUBPIXEL_PHASES) / pixelRatio,
            y: (top + originY) / pixelRatio,
          },
        ],
        0,
        0,
        font,
        paint,
      );
    }
  });
  surface.flush();

  return {
    image: surface.makeImageSnapshot(),
    width,
    height,
    cols,
    cell,
    originX,
    originY,
  };
};
