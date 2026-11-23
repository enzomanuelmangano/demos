import type { HybridObject } from 'react-native-nitro-modules';

/**
 * High-performance color matching using C++
 * - RGB→LAB conversion in native code
 * - Parallel processing with multiple threads
 */
export interface ColorMatcher extends HybridObject<{
  ios: 'c++';
  android: 'c++';
}> {
  /**
   * Match cells to photos using RGB colors
   * Converts to LAB internally and uses parallel greedy matching
   * @param cellRGB - Flat array of cell RGB values [r0,g0,b0, r1,g1,b1, ...]
   * @param cellIndices - Cell indices for mapping
   * @param photoRGB - Flat array of photo RGB values
   * @param photoIds - Photo IDs for mapping
   * @returns Flat array of [cellIndex, photoId, cellIndex, photoId, ...]
   */
  matchColorsRGB(
    cellRGB: number[],
    cellIndices: number[],
    photoRGB: number[],
    photoIds: number[],
  ): number[];
}
