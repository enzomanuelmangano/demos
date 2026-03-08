import { Skia } from '@shopify/react-native-skia';

import type { FlameMood } from './palettes';

// Flame shape paths
const FLAME_A =
  'M90 52C90 52 140 78 146 125C152 172 118 188 90 190C62 188 28 168 36 122C44 76 90 52 90 52Z';
const FLAME_B =
  'M85 48C85 48 137 72 144 120C151 168 116 188 88 190C60 188 26 170 32 124C38 78 85 48 85 48Z';
const FLAME_C =
  'M95 48C95 48 145 75 148 122C151 169 120 188 92 190C64 188 32 168 40 122C48 76 95 48 95 48Z';

const INNER_A =
  'M90 68C90 68 132 90 137 130C142 170 112 182 90 184C68 182 38 167 46 128C54 89 90 68 90 68Z';
const INNER_B =
  'M86 64C86 64 128 86 135 126C142 166 110 182 88 184C66 182 36 168 42 130C48 92 86 64 86 64Z';
const INNER_C =
  'M94 64C94 64 136 88 139 128C142 168 114 182 92 184C70 182 40 166 48 128C56 90 94 64 94 64Z';

export const FLAME_PATHS = {
  A: Skia.Path.MakeFromSVGString(FLAME_A)!,
  B: Skia.Path.MakeFromSVGString(FLAME_B)!,
  C: Skia.Path.MakeFromSVGString(FLAME_C)!,
};

export const INNER_PATHS = {
  A: Skia.Path.MakeFromSVGString(INNER_A)!,
  B: Skia.Path.MakeFromSVGString(INNER_B)!,
  C: Skia.Path.MakeFromSVGString(INNER_C)!,
};

// Eye paths for each mood
const DEFAULT_EYES = {
  left: Skia.Path.MakeFromSVGString('M56 118 Q67 108 78 118')!,
  right: Skia.Path.MakeFromSVGString('M102 118 Q113 108 124 118')!,
  leftTap: Skia.Path.MakeFromSVGString('M56 113 Q67 117 78 121')!,
  rightTap: Skia.Path.MakeFromSVGString('M102 121 Q113 117 124 113')!,
};

const HAPPY_EYES = {
  left: Skia.Path.MakeFromSVGString('M54 120 Q67 105 80 120')!,
  right: Skia.Path.MakeFromSVGString('M100 120 Q113 105 126 120')!,
  leftTap: Skia.Path.MakeFromSVGString('M54 115 Q67 108 80 115')!,
  rightTap: Skia.Path.MakeFromSVGString('M100 115 Q113 108 126 115')!,
};

const FOCUSED_EYES = {
  left: Skia.Path.MakeFromSVGString('M58 115 Q67 112 76 118')!,
  right: Skia.Path.MakeFromSVGString('M104 118 Q113 112 122 115')!,
  leftTap: Skia.Path.MakeFromSVGString('M58 112 Q67 115 76 120')!,
  rightTap: Skia.Path.MakeFromSVGString('M104 120 Q113 115 122 112')!,
};

const PREMIUM_EYES = {
  left: Skia.Path.MakeFromSVGString('M58 117 Q67 113 76 117')!,
  right: Skia.Path.MakeFromSVGString('M104 117 Q113 113 122 117')!,
  leftTap: Skia.Path.MakeFromSVGString('M58 115 Q67 112 76 115')!,
  rightTap: Skia.Path.MakeFromSVGString('M104 115 Q113 112 122 115')!,
};

const SUCCESS_EYES = {
  left: Skia.Path.MakeFromSVGString('M55 122 Q67 100 79 122')!,
  right: Skia.Path.MakeFromSVGString('M101 122 Q113 100 125 122')!,
  leftTap: Skia.Path.MakeFromSVGString('M55 118 Q67 105 79 118')!,
  rightTap: Skia.Path.MakeFromSVGString('M101 118 Q113 105 125 118')!,
};

const CALM_EYES = {
  left: Skia.Path.MakeFromSVGString('M60 116 Q67 120 74 116')!,
  right: Skia.Path.MakeFromSVGString('M106 116 Q113 120 120 116')!,
  leftTap: Skia.Path.MakeFromSVGString('M60 115 Q67 118 74 115')!,
  rightTap: Skia.Path.MakeFromSVGString('M106 115 Q113 118 120 115')!,
};

// Mouth paths for each mood
const DEFAULT_MOUTH = {
  base: Skia.Path.MakeFromSVGString('M65 158 Q92 172 120 155')!,
  tap: Skia.Path.MakeFromSVGString('M75 157 Q92 162 109 157')!,
};

const HAPPY_MOUTH = {
  base: Skia.Path.MakeFromSVGString('M60 156 Q92 178 124 156')!,
  tap: Skia.Path.MakeFromSVGString('M65 155 Q92 175 120 155')!,
};

const FOCUSED_MOUTH = {
  base: Skia.Path.MakeFromSVGString('M78 158 Q92 161 106 158')!,
  tap: Skia.Path.MakeFromSVGString('M80 157 Q92 159 104 157')!,
};

const PREMIUM_MOUTH = {
  base: Skia.Path.MakeFromSVGString('M72 158 Q92 166 112 156')!,
  tap: Skia.Path.MakeFromSVGString('M75 157 Q92 163 109 156')!,
};

const SUCCESS_MOUTH = {
  base: Skia.Path.MakeFromSVGString('M58 154 Q92 182 126 154')!,
  tap: Skia.Path.MakeFromSVGString('M62 155 Q92 178 122 155')!,
};

const CALM_MOUTH = {
  base: Skia.Path.MakeFromSVGString('M82 159 Q92 165 102 159')!,
  tap: Skia.Path.MakeFromSVGString('M84 158 Q92 163 100 158')!,
};

export const MOOD_EYE_PATHS: Record<FlameMood, typeof DEFAULT_EYES> = {
  default: DEFAULT_EYES,
  happy: HAPPY_EYES,
  focused: FOCUSED_EYES,
  premium: PREMIUM_EYES,
  success: SUCCESS_EYES,
  calm: CALM_EYES,
};

export const MOOD_MOUTH_PATHS: Record<FlameMood, typeof DEFAULT_MOUTH> = {
  default: DEFAULT_MOUTH,
  happy: HAPPY_MOUTH,
  focused: FOCUSED_MOUTH,
  premium: PREMIUM_MOUTH,
  success: SUCCESS_MOUTH,
  calm: CALM_MOUTH,
};

// Face center constants
export const FACE_CENTER_X = 90;
export const FACE_CENTER_Y = 140;

// Particle constants
export const PARTICLE_COUNT_YAWN = 32;
export const RISE_START_Y = 156;
export const RISE_HEIGHT = 126;

const FLAME_CENTER_X = 90;
const FLAME_LEFT = 28;
const FLAME_RIGHT = 146;
const PARTICLE_COUNT = 18;

export interface ParticleConfig {
  baseX: number;
  baseR: number;
  isExtra: boolean;
  swayOffset: number;
}

export const PARTICLE_CONFIGS: ParticleConfig[] = Array.from(
  { length: PARTICLE_COUNT_YAWN },
  (_, i) => ({
    baseX:
      FLAME_CENTER_X + Math.sin(i * 1.2) * (FLAME_RIGHT - FLAME_LEFT) * 0.35,
    baseR: 1.2 + (i % 2) * 0.4,
    isExtra: i >= PARTICLE_COUNT,
    swayOffset: i * 0.5,
  }),
);
