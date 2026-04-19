import type { LAB } from '../types';

// Delta E (CIE76) - perceptually accurate color distance
export const colorDistance = (lab1: LAB, lab2: LAB): number => {
  const dL = lab1.l - lab2.l;
  const dA = lab1.a - lab2.a;
  const dB = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
};

// Find the closest photo from a database for a given target color
export const findClosestPhoto = (
  targetLab: LAB,
  photoDatabase: Array<{ id: number; labColor: LAB }>,
): number | null => {
  if (photoDatabase.length === 0) {
    return null;
  }

  let closestId = photoDatabase[0].id;
  let minDistance = colorDistance(targetLab, photoDatabase[0].labColor);

  for (let i = 1; i < photoDatabase.length; i++) {
    const photo = photoDatabase[i];
    const distance = colorDistance(targetLab, photo.labColor);
    if (distance < minDistance) {
      minDistance = distance;
      closestId = photo.id;
    }
  }

  return closestId;
};
