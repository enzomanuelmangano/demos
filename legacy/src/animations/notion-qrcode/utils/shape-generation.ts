import { GOLDEN_RATIO } from '../constants';
import { Point3D } from '../types';

const fibonacciPoint = (i: number, total: number) => {
  const t = i / total;
  const theta = (2 * Math.PI * i) / GOLDEN_RATIO;
  const phi = Math.acos(1 - 2 * t);
  return { theta, phi };
};

export const generateTorusPoints = (
  count: number,
  majorRadius: number,
  minorRadius: number,
): Point3D[] => {
  const points: Point3D[] = [];

  for (let i = 0; i < count; i++) {
    const { theta, phi } = fibonacciPoint(i, count);

    const u = theta;
    const v = phi * 2;

    points.push({
      x: (majorRadius + minorRadius * Math.cos(v)) * Math.cos(u),
      y: minorRadius * Math.sin(v),
      z: (majorRadius + minorRadius * Math.cos(v)) * Math.sin(u),
    });
  }

  return points;
};

export const generateQRPointsFromModules = (
  modules: { x: number; y: number }[],
  matrixSize: number,
): Point3D[] => {
  const points: Point3D[] = [];
  const size = 200;
  const moduleSize = size / matrixSize;
  const offset = size / 2;

  for (const module of modules) {
    points.push({
      x: module.x * moduleSize - offset + moduleSize / 2,
      y: module.y * moduleSize - offset + moduleSize / 2,
      z: 0,
    });
  }

  return points;
};

export const normalizeShape = (
  points: Point3D[],
  targetHeight: number,
): Point3D[] => {
  if (points.length === 0) return points;

  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  const currentHeight = maxY - minY || 1;
  const scale = targetHeight / currentHeight;
  const centerY = (minY + maxY) / 2;

  return points.map(p => ({
    x: (p.x - (minX + maxX) / 2) * scale,
    y: (p.y - centerY) * scale,
    z: (p.z - (minZ + maxZ) / 2) * scale,
  }));
};

export const sortTorusByFlow = (points: Point3D[]): Point3D[] => {
  return [...points].sort((a, b) => {
    const angleA = Math.atan2(a.z, a.x);
    const angleB = Math.atan2(b.z, b.x);

    if (Math.abs(angleA - angleB) > 0.1) {
      return angleA - angleB;
    }

    return a.y - b.y;
  });
};

export const sortBySpiral = (points: Point3D[]): Point3D[] => {
  return [...points].sort((a, b) => {
    const distA = Math.sqrt(a.x * a.x + a.y * a.y);
    const distB = Math.sqrt(b.x * b.x + b.y * b.y);
    const angleA = Math.atan2(a.y, a.x);
    const angleB = Math.atan2(b.y, b.x);
    const spiralA = distA * 0.1 + angleA;
    const spiralB = distB * 0.1 + angleB;
    return spiralA - spiralB;
  });
};
