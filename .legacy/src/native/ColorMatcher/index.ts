import { NitroModules } from 'react-native-nitro-modules';

import type { ColorMatcher } from './ColorMatcher.nitro';

export const ColorMatcherModule =
  NitroModules.createHybridObject<ColorMatcher>('ColorMatcher');

/**
 * High-performance color matching using C++ via Nitro
 * - Converts RGB to LAB in native code
 * - Uses parallel processing for speed
 */
export function matchColorsNative(
  cellRGB: number[],
  cellIndices: number[],
  photoRGB: number[],
  photoIds: number[],
): Map<number, number> {
  const resultArray = ColorMatcherModule.matchColorsRGB(
    cellRGB,
    cellIndices,
    photoRGB,
    photoIds,
  );

  // Convert flat array to Map
  const mapping = new Map<number, number>();
  for (let i = 0; i < resultArray.length; i += 2) {
    mapping.set(resultArray[i], resultArray[i + 1]);
  }
  return mapping;
}
