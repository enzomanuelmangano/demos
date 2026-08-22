import { RGB } from '../types';

/**
 * Converts an RGB color object to a WGSL vec3f string.
 */
export function wgslVec3(c: RGB): string {
  return `vec3f(${c.r.toFixed(6)}, ${c.g.toFixed(6)}, ${c.b.toFixed(6)})`;
}

/**
 * Common uniform struct used by all shaders. 16 floats / 64 bytes.
 *
 * The whole creeper + detonation sequence is driven from here — no per-frame
 * CPU work touches the block buffers, so the blast costs nothing beyond the
 * arithmetic already running per vertex.
 *
 * creeperT     -1 while no creeper exists, else 0..1 walk-in progress.
 * fuseT        0..1 over the hiss/swell, 1 at detonation.
 * blastT       seconds since detonation; negative before it.
 * blastX/Z     detonation point in scene units.
 * rebuildT     0..1 as the tree reassembles.
 * creeperAlpha 1 while the mob is on screen, 0 once it is consumed.
 * spawnAngle   which way the creeper walked in from.
 */
export const uniformsStruct = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  progress: f32,
  gridSize: f32,
  creeperT: f32,
  fuseT: f32,
  blastT: f32,
  blastX: f32,
  blastZ: f32,
  rebuildT: f32,
  creeperAlpha: f32,
  spawnAngle: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}
`;

/**
 * Shared WGSL utilities: hashes for per-block variation, axis rotations for
 * the debris tumble, and the easing used by the rebuild.
 */
export const shaderUtils = /* wgsl */ `
fn hash31(p: f32) -> vec3f {
  var q = fract(vec3f(p * 0.1031, p * 0.1030, p * 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}

fn hash11(p: f32) -> f32 {
  return fract(sin(p * 78.233) * 43758.5453);
}

fn rotX(v: vec3f, a: f32) -> vec3f {
  let c = cos(a); let s = sin(a);
  return vec3f(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

fn rotY(v: vec3f, a: f32) -> vec3f {
  let c = cos(a); let s = sin(a);
  return vec3f(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
}

// Rodrigues rotation — the debris tumble, about a per-block random axis.
fn rotAxis(v: vec3f, axis: vec3f, a: f32) -> vec3f {
  let c = cos(a); let s = sin(a);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

fn easeOutCubic(t: f32) -> f32 {
  let u = 1.0 - t;
  return 1.0 - u * u * u;
}

fn easeInOutCubic(t: f32) -> f32 {
  if (t < 0.5) { return 4.0 * t * t * t; }
  let u = -2.0 * t + 2.0;
  return 1.0 - u * u * u * 0.5;
}
`;
