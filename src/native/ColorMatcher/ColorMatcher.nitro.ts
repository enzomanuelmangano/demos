import type { HybridObject } from 'react-native-nitro-modules';

/**
 * High-performance color matching using C++
 * Runs greedy best-match algorithm ~10-20x faster than JS
 */
export interface ColorMatcher
  extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  /**
   * Match cells to photos using LAB color distance
   * @param cellLAB - Flat array of cell LAB values [l0,a0,b0, l1,a1,b1, ...]
   * @param cellIndices - Cell indices for mapping
   * @param photoLAB - Flat array of photo LAB values
   * @param photoIds - Photo IDs for mapping
   * @returns Flat array of [cellIndex, photoId, cellIndex, photoId, ...]
   */
  matchColors(
    cellLAB: number[],
    cellIndices: number[],
    photoLAB: number[],
    photoIds: number[],
  ): number[];
}
