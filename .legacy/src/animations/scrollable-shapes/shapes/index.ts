export { type Point3D } from './types';
export { N_POINTS } from './constants';

import { N_POINTS } from './constants';
import { makeCubePoints } from './cube';
import { makeHeartPoints } from './heart';
import { makeSpherePoints } from './sphere';
import { makeTorusPoints } from './torus';

// In display order
const SHAPE_FACTORIES = [
  makeSpherePoints,
  makeCubePoints,
  makeTorusPoints,
  makeHeartPoints,
];

export const SHAPES_COUNT = SHAPE_FACTORIES.length;

type ShapeAxes = {
  // [pointIndex][shapeIndex]
  x: number[][];
  y: number[][];
  z: number[][];
};

let cachedShapeAxes: ShapeAxes | undefined;

// Four shapes of N_POINTS each are generated on the demo's first mount, not at
// import: the registry imports every demo at launch.
export const getShapeAxes = (): ShapeAxes => {
  if (!cachedShapeAxes) {
    const shapes = SHAPE_FACTORIES.map(make => make());
    const pointsArray = new Array(N_POINTS).fill(0);
    cachedShapeAxes = {
      x: pointsArray.map((_, pointIndex) =>
        shapes.map(shape => shape[pointIndex].x),
      ),
      y: pointsArray.map((_, pointIndex) =>
        shapes.map(shape => shape[pointIndex].y),
      ),
      z: pointsArray.map((_, pointIndex) =>
        shapes.map(shape => shape[pointIndex].z),
      ),
    };
  }
  return cachedShapeAxes;
};
