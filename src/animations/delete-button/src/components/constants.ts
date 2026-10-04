import { Platform } from 'react-native';

import { matchFont } from 'react-native-skia';

// The close icon: an "X" of two round-capped 2px strokes from (6, 6) to
// (18, 18) in a 24×24 box. A round-capped segment is a stadium, so each stroke
// is drawn as a rounded rect rotated by ±45° around the icon centre.
// It used to be an SVG (a stroked path). Being invisible at mount, its path
// stroke pipeline was only compiled by the GPU on the first tap, which
// stalled that frame; rounded rects reuse the button's pipeline.
export const CloseIconBarLength = 12 * Math.SQRT2 + 2;
export const CloseIconBarThickness = 2;

export const fontFamily = Platform.select({
  ios: 'Helvetica',
  default: 'serif',
});

export const fontStyle = {
  fontFamily,
  fontSize: 14,
  fontWeight: 'bold',
} as const;
export const font = matchFont(fontStyle);
