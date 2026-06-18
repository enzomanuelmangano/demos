// Light, paper-desk theme. Flat 2D origami look (KAMI-style): white paper with
// soft crease shading on a calm tinted background.
export const BG_RGB = { r: 0.243, g: 0.682, b: 0.682 } as const; // soft teal
export const BG_HEX = '#3EAEAE';

// Uniform buffer: mat4 viewProj (16) + vec4 lightDir + vec4 camPos = 24 floats.
// Rounded up to the 256-byte minimum.
export const UNIFORM_BUFFER_SIZE = 256;

// Fixed orthographic camera, looking straight down with a tiny tilt so the
// flat sheet reads as flat paper while folds stay legible. No orbit.
export const VIEW_HALF_HEIGHT = 1.5; // world units mapped to half the screen height
export const CAMERA_TILT = 0.18; // radians off vertical (subtle)
