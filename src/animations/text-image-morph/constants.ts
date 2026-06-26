// Generic look/feel + sampling knobs for the text->image morph. The text and
// image are supplied per instance.

// Page text
export const PAGE_BG = '#f7f4ec';
export const INK = '#1c1a17';

// Atlas glyph cell (offscreen size per unique char)
export const GLYPH_CELL = 40;
export const GLYPH_FONT_SIZE = 30;
export const GLYPH_PAD = 3; // left bearing inside the cell

// Glyph display scale: page vs. assembled picture
export const PAGE_GLYPH_SCALE = 0.48;
export const PICTURE_GLYPH_SCALE = 0.44;

// Sampling mode: 'dark' = darkest pixels (dim photos), 'ink' = darkness OR
// colour saturation (a coloured subject on a light background).
export type SampleMode = 'dark' | 'ink';
export const SAMPLE_MODE: SampleMode = 'ink';

// 'dark' band: full below LUM_LO, none above LUM_HI
export const LUM_LO = 0.1;
export const LUM_HI = 0.22;

// 'ink' params: ink = max(1 - lum, saturation * SAT_WEIGHT)
export const INK_FLOOR = 0.18; // below => background
export const SAT_WEIGHT = 0.45; // keep the dark subject denser than bright bits
export const SAMPLE_GAMMA = 1.4; // contrast

// Page margin (× canvas width), shared by text + button so they align
export const PAGE_MARGIN_FRAC = 0.09;

// Poisson min spacing (× image's longest side); smaller = denser
export const MIN_SPACING = 0.014;
export const SAMPLE_MAX_TRIES_PER_LETTER = 800; // rejection budget
export const PRUNE_RADIUS_FACTOR = 3.2; // stray search radius (× minDist)
export const PRUNE_MIN_NEIGHBOURS = 6; // fewer => stray, culled
export const PICTURE_BOX_W_FRAC = 0.9; // assembled picture max size (× canvas)
export const PICTURE_BOX_H_FRAC = 0.7;

// Ripple: share of the timeline spent staggering across letters
export const STAGGER = 0.55;
export const RIPPLE_JITTER = 0.15; // random share of each letter's delay
export const MORPH_DURATION_MS = 2000; // spring duration (haptics tuned to it)

// Mid-flight 3D: each letter surges toward the camera (more the farther it
// travels) and the scene perspective-projects toward centre. Flat at both ends.
export const CAMERA_Z = 820;
export const Z_BASE = 85;
export const Z_MOVE = 290; // keep Z_BASE + Z_MOVE < CAMERA_Z
export const ROT_3D = 0.11; // max mid-flight tilt (rad)

// Fade in flight: moving letters dim, resolving to full at rest
export const FADE_AMT = 0.42;
