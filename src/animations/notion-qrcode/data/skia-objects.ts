import { Skia } from '@shopify/react-native-skia';

// Reusable Skia objects (created once, reused every frame for performance)
export const reusablePaint = Skia.Paint();

export const reusableBlackPaint = Skia.Paint();
reusableBlackPaint.setColor(Skia.Color('#1a1a1a'));

export const reusableWhiteBgPaint = Skia.Paint();

export const reusableClipPath = Skia.Path.Make();
