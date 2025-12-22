import {
  NUM_AVATARS,
  QR_TARGET_HEIGHT,
  SPRITE_CELL_SIZE,
  SPRITE_COLS,
  TORUS_TARGET_HEIGHT,
} from '../constants';
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

// Generate QR first to get N_POINTS
const QR_MATRIX = generateQRMatrix();
const QR_BLACK_MODULES = getQRBlackModules(QR_MATRIX);

export const N_POINTS = QR_BLACK_MODULES.length;
export const QR_SIZE = QR_MATRIX.length;
export const QR_MODULE_SIZE = QR_TARGET_HEIGHT / QR_SIZE;

// Generate shapes with matching point counts
const rawTorusPoints = generateTorusPoints(N_POINTS);
const rawQRPoints = generateQRPointsFromModules(QR_BLACK_MODULES, QR_SIZE);

// Normalize shapes
const normalizedTorus = normalizeShape(rawTorusPoints, TORUS_TARGET_HEIGHT);
const normalizedQR = normalizeShape(rawQRPoints, QR_TARGET_HEIGHT);

// Sort torus by flow for visual coherence
const TORUS_POINTS = sortTorusByFlow(normalizedTorus);

// Use Hungarian algorithm to find optimal QR point matching
const QR_POINTS = hungarianMatch(TORUS_POINTS, sortBySpiral(normalizedQR));

export const ALL_SHAPES = [TORUS_POINTS, QR_POINTS];

// Assign each point an avatar index
export const AVATAR_ASSIGNMENTS = Array.from(
  { length: N_POINTS },
  (_, i) => i % NUM_AVATARS,
);

// Sprite rect coordinates
export const SPRITE_COORDS = Array.from({ length: NUM_AVATARS }, (_, i) => ({
  x: (i % SPRITE_COLS) * SPRITE_CELL_SIZE,
  y: Math.floor(i / SPRITE_COLS) * SPRITE_CELL_SIZE,
  w: SPRITE_CELL_SIZE,
  h: SPRITE_CELL_SIZE,
}));
