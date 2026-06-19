// Light, paper theme: white paper with soft crease shading on a calm teal
// background.
export const BG_RGB = { r: 0.243, g: 0.682, b: 0.682 } as const; // soft teal
export const BG_HEX = '#3EAEAE';

// Uniform buffer: mat4 viewProj (16) + vec4 lightDir + vec4 camPos = 24 floats.
// Rounded up to the 256-byte minimum.
export const UNIFORM_BUFFER_SIZE = 256;

// Fixed 3/4 perspective camera so the crane reads in 3D. No orbit.
export const CAMERA_EYE: [number, number, number] = [0.45, 4.3, 1.35];
export const CAMERA_TARGET: [number, number, number] = [0, 0, 0];
export const CAMERA_FOV = (32 * Math.PI) / 180;
