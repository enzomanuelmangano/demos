// The Little Prince (Antoine de Saint-Exupéry) — the fox's farewell.
// Themed on seeing with the heart, which ties to the picture reveal.
export const PARAGRAPH =
  'And now here is my secret, a very simple secret: It is only with the ' +
  'heart that one can see rightly; what is essential is invisible to the ' +
  'eye. What is essential is invisible to the eye, the little prince ' +
  'repeated, so that he would be sure to remember. It is the time you ' +
  'have wasted for your rose that makes your rose so important. Men have ' +
  'forgotten this truth, said the fox, but you must not forget it. You ' +
  'become responsible, forever, for what you have tamed. You are ' +
  'responsible for your rose. All grown-ups were once children, although ' +
  'few of them remember it. What makes the desert beautiful is that ' +
  'somewhere it hides a well. The stars are beautiful, because of a ' +
  'flower that cannot be seen. ';

// Page text styling
export const PAGE_BG = '#f7f4ec'; // soft warm white
export const INK = '#1c1a17'; // dark ink

// Atlas glyph cell (offscreen render size per unique char)
export const GLYPH_CELL = 40;
export const GLYPH_FONT_SIZE = 30;
export const GLYPH_PAD = 3; // left bearing of the glyph inside its cell

// Display scale of a glyph on the page (book text size)
export const PAGE_GLYPH_SCALE = 0.48;
export const EYE_GLYPH_SCALE = 0.44;

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
