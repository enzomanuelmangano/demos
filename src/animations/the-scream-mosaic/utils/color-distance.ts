import type { PhotoInfo } from '../hooks/use-photo-atlas';
import type { LAB } from '../types';

// Delta E (CIE76) - perceptually accurate color distance
export const colorDistance = (lab1: LAB, lab2: LAB): number => {
  const dL = lab1.l - lab2.l;
  const dA = lab1.a - lab2.a;
  const dB = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
};

// Find the closest photo from atlas for a given target color
export const findClosestPhotoFromAtlas = (
  targetLab: LAB,
  photoArray: PhotoInfo[],
): number | null => {
  if (photoArray.length === 0) {
    return null;
  }

  let closestId: number | null = null;
  let minDistance = Infinity;

  for (let i = 0; i < photoArray.length; i++) {
    const photo = photoArray[i];
    const distance = colorDistance(targetLab, photo.labColor);
    if (distance < minDistance) {
      minDistance = distance;
      closestId = photo.id;
    }
  }

  return closestId;
};
