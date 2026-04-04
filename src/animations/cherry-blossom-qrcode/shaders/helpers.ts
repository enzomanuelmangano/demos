import { RGB } from '../types';

/**
 * Converts an RGB color object to a WGSL vec3f string.
 */
export function wgslVec3(c: RGB): string {
  return `vec3f(${c.r.toFixed(6)}, ${c.g.toFixed(6)}, ${c.b.toFixed(6)})`;
}

/**
 * Common uniform struct used by all shaders.
 */
export const uniformsStruct = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  progress: f32,
  gridSize: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}
`;
