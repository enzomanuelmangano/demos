/* eslint-disable no-bitwise */
import type { SkPath } from '@shopify/react-native-skia';

import type { Point } from './types';

// Extracts and returns an array of points from an SkPath object.
// The whole point of this animation is using the FFT algorithm.
// The FFT algorithm requires an array of points as input.
// But we are drawing simply a Path, which is a collection of points.
// This function extracts the points from the Path.
export const getPoints = (path: SkPath): Point[] => {
  return Array.from({ length: path.countPoints() }, (_, i) => {
    const point = path.getPoint(i);
    return {
      x: point.x,
      y: point.y,
    };
  });
};

// Generates linearly interpolated points between each pair of points in the given array.
// WHY?
// Consider this case: we have a Path, which is a collection of points.
// We give to the FFT algorithm the points of the Path, and the FFT algorithm
// returns the epicycles.
// But what if before giving the points to the FFT algorithm, we add more points
// applying a Linear Interpolation?
// Of course the epicycles will be more accurate, because we have more points.
// This is what this function is all about :)
export function generateLinearInterpolatedPoints(
  points: Point[],
  density = 10,
): Point[] {
  const totalPoints = (points.length - 1) * density + 1;
  const result: Point[] = new Array(totalPoints);

  let resultIndex = 0;
  const step = 1 / density;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    // Interpolate points between p1 and p2
    for (let t = 0; t < 1; t += step) {
      result[resultIndex++] = {
        x: p1.x + t * dx,
        y: p1.y + t * dy,
      };
    }
  }

  result[totalPoints - 1] = points[points.length - 1]; // Add the last point
  return result;
}

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
