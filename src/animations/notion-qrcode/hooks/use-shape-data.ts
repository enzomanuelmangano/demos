import { useMemo } from 'react';

import {
  generateQRMatrix,
  generateQRPointsFromModules,
  generateTorusPoints,
  getQRBlackModules,
  hungarianMatch,
  normalizeShape,
  sortBySpiral,
  sortTorusByFlow,
} from '../utils';

import type { ShapeData, SpriteConfig, TorusConfig } from '../types';

// Maximum points to render for smooth 60fps performance
// Above this, we sample the QR modules to reduce load
const MAX_POINTS = 800;

/**
 * Uniformly sample array to target size while preserving distribution.
 * Uses stride-based sampling to maintain spatial coverage.
 */
const sampleArray = <T>(arr: T[], targetSize: number): T[] => {
  if (arr.length <= targetSize) return arr;

  const result: T[] = [];
  const stride = arr.length / targetSize;

  for (let i = 0; i < targetSize; i++) {
    const index = Math.floor(i * stride);
    result.push(arr[index]);
  }

  return result;
};

export const useShapeData = (
  qrData: string,
  torus: TorusConfig,
  qrTargetHeight: number,
  sprite: SpriteConfig,
): ShapeData => {
  return useMemo(() => {
    // Generate QR matrix and get black modules
    const qrMatrix = generateQRMatrix(qrData);
    let qrBlackModules = getQRBlackModules(qrMatrix);

    // Sample if too many points (preserves QR shape while limiting render load)
    if (qrBlackModules.length > MAX_POINTS) {
      qrBlackModules = sampleArray(qrBlackModules, MAX_POINTS);
    }

    const nPoints = qrBlackModules.length;
    const qrSize = qrMatrix.length;
    const qrModuleSize = qrTargetHeight / qrSize;

    // Generate shapes with matching point counts
    const rawTorusPoints = generateTorusPoints(
      nPoints,
      torus.majorRadius,
      torus.minorRadius,
    );
    const rawQRPoints = generateQRPointsFromModules(qrBlackModules, qrSize);

    // Normalize shapes
    const normalizedTorus = normalizeShape(rawTorusPoints, torus.targetHeight);
    const normalizedQR = normalizeShape(rawQRPoints, qrTargetHeight);

    // Sort torus by flow for visual coherence
    const torusPoints = sortTorusByFlow(normalizedTorus);

    // Use Hungarian algorithm to find optimal QR point matching
    const qrPoints = hungarianMatch(torusPoints, sortBySpiral(normalizedQR));

    // Assign each point an avatar index
    const avatarAssignments = Array.from(
      { length: nPoints },
      (_, i) => i % sprite.numAvatars,
    );

    // Sprite rect coordinates
    const spriteCoords = Array.from({ length: sprite.numAvatars }, (_, i) => ({
      x: (i % sprite.cols) * sprite.cellSize,
      y: Math.floor(i / sprite.cols) * sprite.cellSize,
      w: sprite.cellSize,
      h: sprite.cellSize,
    }));

    return {
      allShapes: [torusPoints, qrPoints],
      nPoints,
      qrSize,
      qrModuleSize,
      avatarAssignments,
      spriteCoords,
    };
  }, [qrData, torus, qrTargetHeight, sprite]);
};
