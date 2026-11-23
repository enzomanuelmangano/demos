import { Skia, TextAlign } from 'react-native-skia';

import {
  GLYPH_FONT_SIZE,
  INK_HEX,
  LINE_HEIGHT_FACTOR,
  PAGE_GLYPH_SCALE,
  PAGE_MARGIN_FRAC,
  PAGE_TOP_FRAC,
} from './constants';

import type { SkFont, SkParagraph, SkTypeface } from 'react-native-skia';

export interface PageLayout {
  /**
   * The shaped paragraph itself. Skia draws THIS at rest — not a copy, not a
   * re-layout — so the vector text on screen and the quads measured from it
   * cannot disagree by so much as a subpixel.
   */
  paragraph: SkParagraph;
  /** Where the paragraph is painted, so the two renderers share an origin. */
  originX: number;
  originY: number;
  /**
   * The font the paragraph actually draws with — subpixel, hinting, edging
   * and all. The atlas rasterises with THIS object, so the mask on the GPU is
   * the mask Skia puts on screen, not a rendering of the same outline under
   * settings that merely resemble it.
   */
  font: SkFont;
  /** Interleaved [x, y, …] in px: each glyph's ORIGIN — pen position on the baseline. */
  xy: Float32Array;
  /** Advance per glyph in px, parallel to `xy`. */
  adv: Float32Array;
  /**
   * Every distinct glyph id used, in the order the atlas will hold them, with
   * its advance at the layout size. The atlas centres each cell on the advance
   * and the marks are positioned by it, so the two cannot drift apart.
   */
  atlasIds: number[];
  /** Index into `atlasIds` per mark, parallel to `xy`. */
  cell: Float32Array;
  /** Point size the text was shaped at. */
  fontSize: number;
  /** Total height of the column in px. */
  height: number;
  count: number;
}

const FAMILY = 'Newsreader';
/** Space, em space (the indent), no-break and thin space. */
const BLANKS = ' \u2003\u00a0\u2009';

/**
 * The column, shaped by Skia.
 *
 * This is the one job in the whole demo that WGSL cannot do at all, and it is
 * why Skia is here: it knows what a font is. It replaced a hand-rolled layout
 * that summed advance widths character by character, which could not kern — no
 * idea that A beside V should close up, or that f and i in a serif want to be
 * one glyph — and broke lines by splitting on whitespace rather than by the
 * Unicode algorithm, which is not the same thing in a text full of dashes and
 * quotation marks.
 *
 * `extendedVisit` is what makes it usable for this. The paragraph is shaped
 * once, properly, and hands back every run: the glyph ids Skia actually chose,
 * each glyph's position, and its ink bounds. So the marks that fly are the
 * glyphs Skia decided on — ligatures fly as one, because that is what they are.
 *
 * Positions come back on the baseline. They are converted here to the centre of
 * each glyph's advance box, vertically on the font's ascent-descent band: the
 * atlas centres a glyph in its cell the same way, so a quad centred on this
 * lands the letter exactly where Skia would have painted it.
 */
export const buildPageLayout = (
  text: string,
  typeface: SkTypeface,
  canvasWidth: number,
  canvasHeight: number,
): PageLayout => {
  const fontSize = GLYPH_FONT_SIZE * PAGE_GLYPH_SCALE;
  const marginX = canvasWidth * PAGE_MARGIN_FRAC;
  const top = canvasHeight * PAGE_TOP_FRAC;

  const provider = Skia.TypefaceFontProvider.Make();
  provider.registerFont(typeface, FAMILY);

  const builder = Skia.ParagraphBuilder.Make(
    {
      textAlign: TextAlign.Left,
      textStyle: {
        fontFamilies: [FAMILY],
        fontSize,
        heightMultiplier: LINE_HEIGHT_FACTOR,
        color: Skia.Color(INK_HEX),
      },
    },
    provider,
  );

  // One paragraph per source line, each opening with an indent. Skia has no
  // first-line indent of its own, so it is an em of space — which is what a
  // typesetter would have set anyway.
  for (const paragraph of text
    .split('\n')
    .map(p => p.trim())
    .filter(Boolean)) {
    builder.addText(` ${paragraph}\n`);
  }

  const para = builder.build();
  para.layout(canvasWidth - marginX * 2);

  const xs: number[] = [];
  const ids: number[] = [];
  const advs: number[] = [];
  let runFont: SkFont | null = null;

  para.extendedVisit((_line, info) => {
    if (!info) {
      return; // end of a line
    }
    runFont ??= info.font;
    // Whitespace is shaped like any other glyph and inks nothing. As a mark
    // it took a point on the figure and left it bare — nearly a fifth of
    // every statue — and pushed the end of each article past the last point,
    // where its letters had no seat and vanished at the tap. Skia still sets
    // the spaces; they just do not fly.
    const blank = new Set(info.font.getGlyphIDs(BLANKS));
    // The glyph's origin, unrounded, in canvas points: exactly the position
    // Skia hands its rasteriser. The shader rounds it the way Skia does, so
    // the quad's texels fall on the pixels Skia's mask fell on.
    //
    // Not the ink bounds. `bounds` here turned out to carry the glyph's
    // position within the run, whatever the typings say — every letter but the
    // first of a line was pushed out of its atlas cell by its own x.
    const advances = info.font.getGlyphWidths(info.glyphs);
    for (let i = 0; i < info.glyphs.length; i++) {
      const pos = info.positions[i];
      const id = info.glyphs[i];
      if (blank.has(id)) {
        continue;
      }
      ids.push(id);
      advs.push(advances[i]);
      xs.push(marginX + info.origin.x + pos.x, top + info.origin.y + pos.y);
    }
  });

  // The atlas holds one cell per distinct glyph, so the marks index into it.
  const atlasIds = [...new Set(ids)];
  const indexOf = new Map(atlasIds.map((id, i) => [id, i]));
  const cell = Float32Array.from(ids, id => indexOf.get(id) ?? 0);
  if (!runFont) {
    throw new Error('portrait-in-words: the paragraph shaped no glyphs');
  }

  return {
    paragraph: para,
    font: runFont,
    originX: marginX,
    originY: top,
    xy: Float32Array.from(xs),
    adv: Float32Array.from(advs),
    atlasIds,
    cell,
    fontSize,
    height: top * 2 + para.getHeight(),
    count: ids.length,
  };
};
