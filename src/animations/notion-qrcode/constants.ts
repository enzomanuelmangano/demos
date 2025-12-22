import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const CANVAS_HEIGHT = SCREEN_HEIGHT;
export const CANVAS_WIDTH = SCREEN_WIDTH;

// Avatar settings
export const NUM_AVATARS = 20;
export const AVATAR_SIZE = 28;

// 3D projection
export const DISTANCE = 800;
export const CENTER_X = CANVAS_WIDTH / 2;
export const CENTER_Y = CANVAS_HEIGHT / 2;

// Torus parameters
export const TORUS_MAJOR_RADIUS = 110;
export const TORUS_MINOR_RADIUS = 80;
export const TORUS_TARGET_HEIGHT = SCREEN_HEIGHT * 0.65;

// QR parameters
export const QR_TARGET_HEIGHT = 220;
export const QR_DATA = 'https://www.reactiive.io';

// Sprite sheet settings
export const SPRITE_COLS = 5;
export const SPRITE_CELL_SIZE = 128;

// Golden ratio for Fibonacci distribution
export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

// Background color palette (monochromatic)
export const BG_COLOR_HUE = 220; // Blue hue (0-360)
export const BG_COLOR_SAT_MIN = 30; // Minimum saturation %
export const BG_COLOR_SAT_MAX = 70; // Maximum saturation %
export const BG_COLOR_LIGHT_MIN = 70; // Minimum lightness %
export const BG_COLOR_LIGHT_MAX = 85; // Maximum lightness %

// Darker variant for buttons and text (darker than torus for better contrast)
export const BG_COLOR_DARK = `hsl(${BG_COLOR_HUE}, ${BG_COLOR_SAT_MAX}%, 45%)`;
