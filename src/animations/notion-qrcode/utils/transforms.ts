import { Point3D } from '../types';

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  'worklet';
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export const rotateX = (p: Point3D, angle: number): Point3D => {
  'worklet';
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x,
    y: p.y * cos - p.z * sin,
    z: p.y * sin + p.z * cos,
  };
};

export const rotateY = (p: Point3D, angle: number): Point3D => {
  'worklet';
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x * cos + p.z * sin,
    y: p.y,
    z: -p.x * sin + p.z * cos,
  };
};

/**
 * In-place rotation around X axis - avoids object allocation.
 * Mutates the `out` parameter and returns it.
 */
export const rotateXInPlace = (
  p: Point3D,
  angle: number,
  out: Point3D,
): Point3D => {
  'worklet';
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  out.x = p.x;
  out.y = p.y * cos - p.z * sin;
  out.z = p.y * sin + p.z * cos;
  return out;
};

/**
 * In-place rotation around Y axis - avoids object allocation.
 * Mutates the `out` parameter and returns it.
 */
export const rotateYInPlace = (
  p: Point3D,
  angle: number,
  out: Point3D,
): Point3D => {
  'worklet';
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  out.x = p.x * cos + p.z * sin;
  out.y = p.y;
  out.z = -p.x * sin + p.z * cos;
  return out;
};
