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

export const useShapeData = (
  qrData: string,
  torus: TorusConfig,
  qrTargetHeight: number,
  sprite: SpriteConfig,
): ShapeData => {
  return useMemo(() => {
    // Generate QR matrix and get black modules
    const qrMatrix = generateQRMatrix(qrData);
    const qrBlackModules = getQRBlackModules(qrMatrix);

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
