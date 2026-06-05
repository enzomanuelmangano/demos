import type { Side } from './types';
import type React from 'react';
import type { View } from 'react-native';

export const delay = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

// Measure a view's frame in window (screen) coordinates, as a promise.
export const measureInWindow = (
  ref: React.RefObject<View | null>,
): Promise<{ x: number; y: number; width: number; height: number } | null> =>
  new Promise(resolve => {
    const node = ref.current;
    if (!node) return resolve(null);
    node.measureInWindow((x, y, width, height) =>
      resolve({ x, y, width, height }),
    );
  });

// Locate a king on the board from the FEN placement field. Returns the
// 0-based file (a→0) and row-from-top (rank 8 → 0), matching the board's
// internal squareToIndex convention before any flip is applied.
export const kingFromFen = (
  fen: string,
  color: Side,
): { file: number; rowFromTop: number } | null => {
  const placement = fen.split(' ')[0];
  const ranks = placement.split('/'); // ranks[0] = rank 8 = top row
  const target = color === 'w' ? 'K' : 'k';
  for (let row = 0; row < ranks.length; row++) {
    let file = 0;
    for (const ch of ranks[row]) {
      if (ch >= '1' && ch <= '9') {
        file += parseInt(ch, 10);
      } else {
        if (ch === target) return { file, rowFromTop: row };
        file += 1;
      }
    }
  }
  return null;
};

// Build an `rgba()` string from a fixed RGB triplet at a runtime alpha, on the
// UI thread. toFixed avoids scientific notation (e.g. 4.6e-8) when a spring
// settles near 0 — reanimated rejects `rgba(.., 4.6e-8)` as an invalid colour.
export const toRgba = (rgb: number[], a: number) => {
  'worklet';
  const alpha = Math.max(0, Math.min(1, a)).toFixed(3);
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
};
