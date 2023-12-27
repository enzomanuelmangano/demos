import { Dimensions } from 'react-native';
import { createNoise2D } from 'simplex-noise';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const center = {
  x: SCREEN_WIDTH / 2,
  y: SCREEN_HEIGHT / 2,
};

// Some experimental values
const FREQUENCY = 1800;
const A = 30;

// Create noise functions
const noise2D = createNoise2D();
const secondNoise2D = createNoise2D();
const RADIUS = 80;

export { center, FREQUENCY, A, noise2D, secondNoise2D, RADIUS };
