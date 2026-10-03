import { Dimensions } from 'react-native';

import { createNoiseTables } from './worklet-noise';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const center = {
  x: SCREEN_WIDTH / 2,
  y: SCREEN_HEIGHT / 2,
};

const FREQUENCY = 1800;
const A = 30;

// Permutation tables for the two noise fields; noise2D() in worklet-noise.ts
// evaluates them on the UI thread.
const noiseTables = createNoiseTables();
const secondNoiseTables = createNoiseTables();
const RADIUS = 80;

export { center, FREQUENCY, A, noiseTables, secondNoiseTables, RADIUS };
