// The Little Prince (Antoine de Saint-Exupéry) — the fox's farewell.
// Themed on seeing with the heart, which ties to the picture reveal.
// Paragraph breaks are marked with '\n' — the layout lays each paragraph on
// its own line with a first-line indent (real book formatting).
export const PARAGRAPH =
  '“You are beautiful, but you are empty,” he went on. “One could not die ' +
  'for you. To be sure, an ordinary passerby would think that my rose ' +
  'looked just like you—the rose that belongs to me. But in herself alone ' +
  'she is more important than all the hundreds of you other roses: because ' +
  'it is she that I have watered; because it is she that I have put under ' +
  'the glass globe; because it is she that I have sheltered behind the ' +
  'screen; because it is for her that I have killed the caterpillars ' +
  '(except the two or three that we saved to become butterflies); because ' +
  'it is she that I have listened to, when she grumbled, or boasted, or ' +
  'even sometimes when she said nothing. Because she is my rose.”\n' +
  'And he went back to meet the fox.\n' +
  '“Goodbye,” he said.\n' +
  '“Goodbye,” said the fox.\n' +
  '“And now here is my secret, a very simple secret: It is only with the ' +
  'heart that one can see rightly; what is essential is invisible to the ' +
  'eye.”\n' +
  'What is essential is invisible to the eye, the little prince repeated, ' +
  'so that hember.\n' +
  '“It is the time you have wasted for your rose that makes your rose so ' +
  'important.”\n' +
  '“It is the time I have wasted for my rose…” the little prince repeated, ' +
  'so that he would be sure to remember.\n' +
  '“Men have forgotten this truth,” said the fox. “But you must not forget ' +
  'it. You become responsible, forever, for what you have tamed. You are ' +
  'responsible for your rose…”';

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

// Page side margin as a fraction of canvas width (shared by the text layout
// and the floating button so they align).
export const PAGE_MARGIN_FRAC = 0.09;

// Poisson-disk min spacing between letters, as a fraction of the image's
// longest side. Larger => airier; smaller => denser (until letters touch).
export const MIN_SPACING = 0.014;

// Animation — fraction of the timeline spent rippling across letters
// (higher = more pronounced wave sweeping from the button).
export const STAGGER = 0.55;

// Cinematic depth during the morph (art-gallery style): mid-flight each letter
// surges toward the camera (sin(t*PI) peak, flat at both ends) and the scene is
// perspective-projected toward the centre. Letters that travel farther pop more
// — coherent depth, not random, so the whole cloud reads as one 3D move.
export const CAMERA_Z = 820; // virtual camera distance
export const Z_BASE = 85; // base pop toward camera
export const Z_MOVE = 290; // extra pop scaled by travel distance (keep base+move < CAMERA_Z)
export const ROT_3D = 0.11; // max mid-flight tilt (radians)

// Fade in flight: the moving letters dim, then resolve to full opacity as they
// settle (peaks at sin(progress*PI), zero at both ends). No blur.
export const FADE_AMT = 0.42; // how much opacity dips mid-flight (0..1)
