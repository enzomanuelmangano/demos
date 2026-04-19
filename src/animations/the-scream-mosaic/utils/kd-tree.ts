/**
 * K-D Tree implementation for 3D LAB color space
 *
 * Provides O(log n) nearest-neighbor queries instead of O(n) brute force.
 * Used for fast photo-to-cell color matching in the mosaic.
 */

import type { LAB } from '../types';

export interface KdNode {
  point: LAB;
  id: number;
  left: KdNode | null;
  right: KdNode | null;
  axis: number; // 0 = l, 1 = a, 2 = b
}

export interface PhotoWithLab {
  id: number;
  labColor: LAB;
}

// Get value at axis from LAB color
function getAxisValue(lab: LAB, axis: number): number {
  switch (axis) {
    case 0:
      return lab.l;
    case 1:
      return lab.a;
    case 2:
      return lab.b;
    default:
      return lab.l;
  }
}

// Squared distance between two LAB colors (faster than sqrt)
function squaredDistance(a: LAB, b: LAB): number {
  const dL = a.l - b.l;
  const dA = a.a - b.a;
  const dB = a.b - b.b;
  return dL * dL + dA * dA + dB * dB;
}

// Build k-d tree from photo array
function buildTree(
  photos: PhotoWithLab[],
  depth: number = 0,
): KdNode | null {
  if (photos.length === 0) {
    return null;
  }

  const axis = depth % 3;

  // Sort by current axis
  photos.sort((a, b) => getAxisValue(a.labColor, axis) - getAxisValue(b.labColor, axis));

  const medianIndex = Math.floor(photos.length / 2);
  const medianPhoto = photos[medianIndex];

  return {
    point: medianPhoto.labColor,
    id: medianPhoto.id,
    axis,
    left: buildTree(photos.slice(0, medianIndex), depth + 1),
    right: buildTree(photos.slice(medianIndex + 1), depth + 1),
  };
}

// Find nearest neighbor in the tree
function findNearest(
  node: KdNode | null,
  target: LAB,
  best: { node: KdNode | null; distance: number },
  excludeIds: Set<number>,
): { node: KdNode | null; distance: number } {
  if (node === null) {
    return best;
  }

  // Check current node (only if not excluded)
  if (!excludeIds.has(node.id)) {
    const dist = squaredDistance(node.point, target);
    if (dist < best.distance) {
      best = { node, distance: dist };
    }
  }

  // Determine which subtree to search first
  const targetValue = getAxisValue(target, node.axis);
  const nodeValue = getAxisValue(node.point, node.axis);
  const diff = targetValue - nodeValue;

  const first = diff < 0 ? node.left : node.right;
  const second = diff < 0 ? node.right : node.left;

  // Search the closer subtree first
  best = findNearest(first, target, best, excludeIds);

  // Check if we need to search the other subtree
  // Only if the splitting plane is closer than the best distance
  const axisDistance = diff * diff;
  if (axisDistance < best.distance) {
    best = findNearest(second, target, best, excludeIds);
  }

  return best;
}

/**
 * K-D Tree class for fast nearest-neighbor color matching
 */
export class KdTree {
  private root: KdNode | null;
  private usedIds: Set<number>;

  constructor(photos: PhotoWithLab[]) {
    // Clone array to avoid mutating original
    this.root = buildTree([...photos]);
    this.usedIds = new Set();
  }

  /**
   * Find the nearest unused photo for a target color
   * @param target - Target LAB color to match
   * @returns Photo ID of the nearest match, or null if all photos are used
   */
  findNearest(target: LAB): number | null {
    const result = findNearest(
      this.root,
      target,
      { node: null, distance: Infinity },
      this.usedIds,
    );

    if (result.node === null) {
      return null;
    }

    // Mark as used (no duplicates)
    this.usedIds.add(result.node.id);
    return result.node.id;
  }

  /**
   * Find nearest without marking as used (for preview/debug)
   */
  findNearestWithoutMarking(target: LAB): number | null {
    const result = findNearest(
      this.root,
      target,
      { node: null, distance: Infinity },
      this.usedIds,
    );

    return result.node?.id ?? null;
  }

  /**
   * Reset the used IDs set
   */
  reset(): void {
    this.usedIds.clear();
  }

  /**
   * Get the number of available (unused) photos
   */
  getAvailableCount(): number {
    return this.countNodes(this.root) - this.usedIds.size;
  }

  private countNodes(node: KdNode | null): number {
    if (node === null) {
      return 0;
    }
    return 1 + this.countNodes(node.left) + this.countNodes(node.right);
  }
}

/**
 * Build a k-d tree from an array of photos with LAB colors
 */
export function buildKdTree(photos: PhotoWithLab[]): KdTree {
  return new KdTree(photos);
}
