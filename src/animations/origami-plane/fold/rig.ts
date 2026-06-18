// Crane crease pattern + fold schedule, driven by the tree folder.
//
// The square sits in the XZ plane as a diamond (corners front/right/back/left).
// We build it up one real stage at a time; this file is tuned incrementally on
// device. Stage 1 collapses the square into the preliminary base.

import type { Vec3 } from './math';
import type { Node } from './tree';

// Diamond corners and edge midpoints (flat, y = 0).
const N: Vec3 = [0, 0, 1.6]; // front
const E: Vec3 = [1.6, 0, 0]; // right
const S: Vec3 = [0, 0, -1.6]; // back
const W: Vec3 = [-1.6, 0, 0]; // left
const O: Vec3 = [0, 0, 0];
const NE: Vec3 = [0.8, 0, 0.8];
const SE: Vec3 = [0.8, 0, -0.8];
const SW: Vec3 = [-0.8, 0, -0.8];
const NW: Vec3 = [-0.8, 0, 0.8];

export const STEP_COUNT = 1; // states 0..STEP_COUNT (flat → preliminary base)

const PI = Math.PI;

// Eight triangles fanning around the centre, chained into a spanning tree.
// Creases alternate mountain/valley to accordion the square into a base.
export const buildNodes = (): Node[] => [
  // root
  {
    rest: [O, N, NE],
    parent: -1,
    hingeA: O,
    hingeB: N,
    angles: [0, 0],
    layer: 0,
  },
  {
    rest: [O, NE, E],
    parent: 0,
    hingeA: O,
    hingeB: NE,
    angles: [0, PI],
    layer: 1,
  },
  {
    rest: [O, E, SE],
    parent: 1,
    hingeA: O,
    hingeB: E,
    angles: [0, -PI],
    layer: 2,
  },
  {
    rest: [O, SE, S],
    parent: 2,
    hingeA: O,
    hingeB: SE,
    angles: [0, PI],
    layer: 3,
  },
  {
    rest: [O, S, SW],
    parent: 3,
    hingeA: O,
    hingeB: S,
    angles: [0, -PI],
    layer: 4,
  },
  {
    rest: [O, SW, W],
    parent: 4,
    hingeA: O,
    hingeB: SW,
    angles: [0, PI],
    layer: 5,
  },
  {
    rest: [O, W, NW],
    parent: 5,
    hingeA: O,
    hingeB: W,
    angles: [0, -PI],
    layer: 6,
  },
  {
    rest: [O, NW, N],
    parent: 6,
    hingeA: O,
    hingeB: NW,
    angles: [0, PI],
    layer: 7,
  },
];
