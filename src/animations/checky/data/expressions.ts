import type { FlameMood } from './palettes';

export interface FlameExpression {
  eyeShape: number;
  mouthShape: number;
  breatheSpeed: number;
  particleSpeed: number;
  particleIntensity: number;
  energy: number;
  glowIntensity: number;
}

export const MOOD_EXPRESSIONS: Record<FlameMood, FlameExpression> = {
  default: {
    eyeShape: 0,
    mouthShape: 0,
    breatheSpeed: 1,
    particleSpeed: 1,
    particleIntensity: 1,
    energy: 1,
    glowIntensity: 1,
  },
  happy: {
    eyeShape: 0,
    mouthShape: 0,
    breatheSpeed: 1.6,
    particleSpeed: 2.0,
    particleIntensity: 1.5,
    energy: 1.8,
    glowIntensity: 1.4,
  },
  focused: {
    eyeShape: 1.0,
    mouthShape: 1.0,
    breatheSpeed: 0.5,
    particleSpeed: 1.2,
    particleIntensity: 1.2,
    energy: 0.3,
    glowIntensity: 1.3,
  },
  premium: {
    eyeShape: 0.5,
    mouthShape: 0.6,
    breatheSpeed: 0.6,
    particleSpeed: 0.4,
    particleIntensity: 1.8,
    energy: 0.8,
    glowIntensity: 2.0,
  },
  success: {
    eyeShape: 0,
    mouthShape: 0,
    breatheSpeed: 2.0,
    particleSpeed: 2.5,
    particleIntensity: 2.0,
    energy: 2.2,
    glowIntensity: 1.8,
  },
  calm: {
    eyeShape: 0.5,
    mouthShape: 0.5,
    breatheSpeed: 0.3,
    particleSpeed: 0.6,
    particleIntensity: 0.5,
    energy: 0.2,
    glowIntensity: 0.5,
  },
};
