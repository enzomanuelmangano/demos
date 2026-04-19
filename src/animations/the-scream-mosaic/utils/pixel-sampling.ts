import { AlphaType, ColorType, type SkImage } from '@shopify/react-native-skia';

import type { RGB } from '../types';

// Sample average color from an image region
export const sampleRegionColor = (
  image: SkImage,
  x: number,
  y: number,
  width: number,
  height: number,
): RGB | null => {
  const imageInfo = {
    width: Math.floor(width),
    height: Math.floor(height),
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  };

  const pixels = image.readPixels(Math.floor(x), Math.floor(y), imageInfo);

  if (!pixels) {
    return null;
  }

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  // Process RGBA pixels (4 bytes each)
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    // Only count pixels with some opacity
    if (alpha > 0) {
      totalR += pixels[i];
      totalG += pixels[i + 1];
      totalB += pixels[i + 2];
      count++;
    }
  }

  if (count === 0) {
    return { r: 128, g: 128, b: 128 }; // Default gray for empty regions
  }

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
  };
};

// Sample entire image to get average color
export const sampleImageColor = (image: SkImage): RGB | null => {
  return sampleRegionColor(image, 0, 0, image.width(), image.height());
};

// Sample image at lower resolution for performance
export const sampleImageColorFast = (
  image: SkImage,
  sampleSize: number = 10,
): RGB | null => {
  const width = image.width();
  const height = image.height();

  // Sample a grid of points
  const stepX = Math.max(1, Math.floor(width / sampleSize));
  const stepY = Math.max(1, Math.floor(height / sampleSize));

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const color = sampleRegionColor(image, x, y, 1, 1);
      if (color) {
        totalR += color.r;
        totalG += color.g;
        totalB += color.b;
        count++;
      }
    }
  }

  if (count === 0) {
    return null;
  }

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
  };
};
