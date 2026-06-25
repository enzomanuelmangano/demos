// Real paragraph (about seeing / the eye) — repeated to fill the page.
// Meaning ties to the reveal: text dissolves into the eye it describes.
export const PARAGRAPH =
  'The eye is the lamp of the body. For a long while she only read, ' +
  'letting the words pass like quiet water, never once suspecting that ' +
  'the page was watching her in return. Between every line a second ' +
  'reader waited, patient as ink, gathering the loose letters of the ' +
  'world into a single steady gaze. To see, she learned, is not to ' +
  'collect the light but to be collected by it. And when at last she ' +
  'looked up, the story had already turned its slow dark pupil toward ' +
  'her, and blinked, and knew her name. ';

// Page text styling
export const PAGE_BG = '#efe7d6'; // warm paper
export const INK = '#1c1a17'; // dark ink

// Atlas glyph cell (offscreen render size per unique char)
export const GLYPH_CELL = 40;
export const GLYPH_FONT_SIZE = 30;
export const GLYPH_PAD = 3; // left bearing of the glyph inside its cell

// Display scale of a glyph on the page (book text size)
export const PAGE_GLYPH_SCALE = 0.42;
export const EYE_GLYPH_SCALE = 0.4;

// Sampling mode per source image:
//  'dark' — dim photo, subject is the DARKEST pixels (reject mid-tone skin).
//  'ink'  — colored subject on a LIGHT background; "ink" = darkness OR color
//           saturation, so the (bright-ish) colored subject still counts.
export type SampleMode = 'dark' | 'ink';
export const SAMPLE_MODE: SampleMode = 'ink';

// 'dark' params: letters where luminance < LUM_LO (full) fading out by LUM_HI.
export const LUM_LO = 0.1;
export const LUM_HI = 0.22;

// 'ink' params: ink = max(1 - lum, saturation * SAT_WEIGHT).
export const INK_FLOOR = 0.18; // below this -> background, no letters
// Lower weight => bright saturated bits (yellow stars) don't dominate; the
// dark-outlined main subject (prince) stays the densest focal mass.
export const SAT_WEIGHT = 0.45;

export const SAMPLE_GAMMA = 1.4; // contrast: dense subject, thin background

// Poisson-disk min spacing between letters, as a fraction of the image's
// longest side. Larger => airier; smaller => denser (until letters touch).
export const MIN_SPACING = 0.014;

// Animation
export const STAGGER = 0.35; // fraction of timeline spent staggering across particles
