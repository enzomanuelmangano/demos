/* eslint-disable no-bitwise */
import type { SkPath } from '@shopify/react-native-skia';

import type { Point } from './types';
import { PathGeometry } from './geometry';

// Extracts and returns an array of points from an SkPath object.
// The whole point of this animation is using the FFT algorithm.
// The FFT algorithm requires an array of points as input.
// But we are drawing simply a Path, which is a collection of points.
// This function extracts the points from the Path.
export const getPoints = (path: SkPath): Point[] => {
  const pathGeo = new PathGeometry(path);
  const totalLength = pathGeo.getTotalLength();
  const PointsAmount = Math.round(totalLength);
  const points = [];
  for (let i = 0; i < PointsAmount; i++) {
    const point = pathGeo.getPointAtLength((i / PointsAmount) * totalLength);
    points.push({
      x: point.x,
      y: point.y,
    });
  }

  return points;
};

// Checks if a number is a power of two.
export function isPowerOfTwo(n: number): boolean {
  return (n & (n - 1)) === 0;
}

// Calculates the next power of two greater than or equal to `n`.
export function nextPowerOfTwo(n: number): number {
  let count = 0;

  if (n && !isPowerOfTwo(n)) {
    // Count the number of shifts required to get to the next power of two.
    while (n !== 0) {
      n >>= 1;
      count += 1;
    }
  }

  return 1 << count;
}

// Fills the array of points up to the nearest power of two with a default point.
// IMPORTANT:
// This function is super important since the FFT algorithm requires
// the number of points to be a power of two.
export function fillToPowerOfTwo(points: Point[]): Point[] {
  const targetLength = nextPowerOfTwo(points.length);

  const defaultPoint = points[points.length - 1];
  const filledPoints: Point[] = Array(targetLength).fill(defaultPoint);
  for (let i = 0; i < points.length; i++) {
    filledPoints[i] = points[i];
  }
  return filledPoints;
}
