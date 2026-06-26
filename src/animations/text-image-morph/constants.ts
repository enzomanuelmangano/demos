export const PAGE_BG = '#f7f4ec';
export const INK = '#1c1a17';

export const GLYPH_CELL = 40; // offscreen atlas cell per char
export const GLYPH_FONT_SIZE = 30;
export const GLYPH_PAD = 3;

export const PAGE_GLYPH_SCALE = 0.48;
export const PICTURE_GLYPH_SCALE = 0.44;

// 'dark' = darkest pixels; 'ink' = darkness OR colour saturation
export type SampleMode = 'dark' | 'ink';
export const SAMPLE_MODE: SampleMode = 'ink';

export const LUM_LO = 0.1;
export const LUM_HI = 0.22;

export const INK_FLOOR = 0.18;
export const SAT_WEIGHT = 0.45;
export const SAMPLE_GAMMA = 1.4;

export const PAGE_MARGIN_FRAC = 0.09;

export const MIN_SPACING = 0.014; // × image's longest side
export const SAMPLE_MAX_TRIES_PER_LETTER = 800;
export const PRUNE_RADIUS_FACTOR = 3.2;
export const PRUNE_MIN_NEIGHBOURS = 6;
export const PICTURE_BOX_W_FRAC = 0.9;
export const PICTURE_BOX_H_FRAC = 0.7;

export const STAGGER = 0.55;
export const RIPPLE_JITTER = 0.15;
export const MORPH_DURATION_MS = 2000; // haptics are tuned to this

export const CAMERA_Z = 820;
export const Z_BASE = 85;
export const Z_MOVE = 290; // keep Z_BASE + Z_MOVE < CAMERA_Z
export const ROT_3D = 0.11;

export const FADE_AMT = 0.42;
