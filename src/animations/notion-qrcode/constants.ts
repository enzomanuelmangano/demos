import { Dimensions } from 'react-native';

import type { ColorConfig, TorusConfig } from './types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const CANVAS_HEIGHT = SCREEN_HEIGHT;
export const CANVAS_WIDTH = SCREEN_WIDTH;

// 3D projection
export const DISTANCE = 800;
export const CENTER_X = CANVAS_WIDTH / 2;
export const CENTER_Y = CANVAS_HEIGHT / 2;

// Golden ratio for Fibonacci distribution
export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

// Default configurations
export const DEFAULT_AVATAR_SIZE = 28;
export const DEFAULT_QR_TARGET_HEIGHT = 220;

export const DEFAULT_TORUS: TorusConfig = {
  majorRadius: 110,
  minorRadius: 80,
  targetHeight: SCREEN_HEIGHT * 0.65,
};

export const DEFAULT_COLORS: ColorConfig = {
  hue: 220,
  saturationRange: [30, 70],
  lightnessRange: [70, 85],
};

// Legacy exports for backward compatibility
export const NUM_AVATARS = 20;
export const AVATAR_SIZE = DEFAULT_AVATAR_SIZE;
export const TORUS_MAJOR_RADIUS = DEFAULT_TORUS.majorRadius;
export const TORUS_MINOR_RADIUS = DEFAULT_TORUS.minorRadius;
export const TORUS_TARGET_HEIGHT = DEFAULT_TORUS.targetHeight;
export const QR_TARGET_HEIGHT = DEFAULT_QR_TARGET_HEIGHT;
export const SPRITE_COLS = 5;
export const SPRITE_CELL_SIZE = 128;
export const BG_COLOR_HUE = DEFAULT_COLORS.hue;
export const BG_COLOR_SAT_MIN = DEFAULT_COLORS.saturationRange[0];
export const BG_COLOR_SAT_MAX = DEFAULT_COLORS.saturationRange[1];
export const BG_COLOR_LIGHT_MIN = DEFAULT_COLORS.lightnessRange[0];
export const BG_COLOR_LIGHT_MAX = DEFAULT_COLORS.lightnessRange[1];
export const BG_COLOR_DARK = `hsl(${BG_COLOR_HUE}, ${BG_COLOR_SAT_MAX}%, 45%)`;
