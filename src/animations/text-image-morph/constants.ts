// Text -> image morph: a page of text whose letters fly together to form a
// picture sampled from an arbitrary image. These are the generic look/feel and
// sampling knobs; the actual text + image are supplied per instance.

// Page text styling
export const PAGE_BG = '#f7f4ec'; // soft warm white
export const INK = '#1c1a17'; // dark ink

// Atlas glyph cell (offscreen render size per unique char)
export const GLYPH_CELL = 40;
export const GLYPH_FONT_SIZE = 30;
export const GLYPH_PAD = 3; // left bearing of the glyph inside its cell

// Display scale of a glyph on the page vs. in the assembled picture
export const PAGE_GLYPH_SCALE = 0.48;
export const PICTURE_GLYPH_SCALE = 0.44;

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
// Lower weight => bright saturated bits don't dominate; the dark-outlined main
// subject stays the densest focal mass.
export const SAT_WEIGHT = 0.45;

export const SAMPLE_GAMMA = 1.4; // contrast: dense subject, thin background

// Page side margin as a fraction of canvas width (shared by the text layout
// and the floating button so they align).
export const PAGE_MARGIN_FRAC = 0.09;

// Poisson-disk min spacing between letters, as a fraction of the image's
// longest side. Larger => airier; smaller => denser (until letters touch).
export const MIN_SPACING = 0.014;

// Picture sampling tuning
export const SAMPLE_MAX_TRIES_PER_LETTER = 800; // Poisson rejection budget per letter
export const PRUNE_RADIUS_FACTOR = 3.2; // stray-neighbour search radius (× minDist)
export const PRUNE_MIN_NEIGHBOURS = 6; // fewer neighbours in range => stray, culled
export const PICTURE_BOX_W_FRAC = 0.9; // assembled picture max width (× canvas)
export const PICTURE_BOX_H_FRAC = 0.7; // assembled picture max height (× canvas)

// Animation — fraction of the timeline spent rippling across letters
// (higher = more pronounced wave sweeping from the button).
export const STAGGER = 0.55;

// Random share of each letter's stagger delay (the rest is distance-driven), so
// the ripple front isn't perfectly rigid.
export const RIPPLE_JITTER = 0.15;

// Duration of the morph spring. The haptic pattern (haptics.ts) is hand-tuned
// to this timing + the ripple stagger — keep them in sync.
export const MORPH_DURATION_MS = 2000;

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
