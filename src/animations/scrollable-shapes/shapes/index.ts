export { type Point3D } from './types';
export { N_POINTS } from './constants';

import { N_POINTS } from './constants';
import { CUBE_POINTS } from './cube';
import { HEART_POINTS } from './heart';
import { SPHERE_POINTS } from './sphere';
import { TORUS_POINTS } from './torus';

// Array of all shapes
export const ALL_SHAPES = [
  SPHERE_POINTS,
  CUBE_POINTS,
  TORUS_POINTS,
  HEART_POINTS,
];

export const POINTS_ARRAY = new Array(N_POINTS).fill(0);

export const ALL_SHAPES_X = POINTS_ARRAY.map((_, pointIndex) =>
  ALL_SHAPES.map(shape => shape[pointIndex].x),
);
export const ALL_SHAPES_Y = POINTS_ARRAY.map((_, pointIndex) =>
  ALL_SHAPES.map(shape => shape[pointIndex].y),
);
export const ALL_SHAPES_Z = POINTS_ARRAY.map((_, pointIndex) =>
  ALL_SHAPES.map(shape => shape[pointIndex].z),
);
