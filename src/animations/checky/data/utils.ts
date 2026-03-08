import {
  MOOD_EXPRESSIONS,
  MOOD_EYE_PATHS,
  MOOD_MOUTH_PATHS,
  MOOD_PALETTES,
  type FlameColorPalette,
  type FlameMood,
} from './index';

// Mood order for scroll
export const MOODS: FlameMood[] = [
  'default',
  'focused',
  'happy',
  'premium',
  'success',
  'calm',
];

export const MOOD_INPUT_RANGE = MOODS.map((_, i) => i);

// Pre-compute path arrays for usePathInterpolation
export const LEFT_EYE_BASE_PATHS = MOODS.map(m => MOOD_EYE_PATHS[m].left);
export const RIGHT_EYE_BASE_PATHS = MOODS.map(m => MOOD_EYE_PATHS[m].right);
export const MOUTH_BASE_PATHS = MOODS.map(m => MOOD_MOUTH_PATHS[m].base);
export const LEFT_EYE_TAP_PATHS = MOODS.map(m => MOOD_EYE_PATHS[m].leftTap);
export const RIGHT_EYE_TAP_PATHS = MOODS.map(m => MOOD_EYE_PATHS[m].rightTap);
export const MOUTH_TAP_PATHS = MOODS.map(m => MOOD_MOUTH_PATHS[m].tap);

// Expression parameter arrays
export const BREATHE_SPEEDS = MOODS.map(m => MOOD_EXPRESSIONS[m].breatheSpeed);
export const PARTICLE_SPEEDS = MOODS.map(
  m => MOOD_EXPRESSIONS[m].particleSpeed,
);
export const PARTICLE_INTENSITIES = MOODS.map(
  m => MOOD_EXPRESSIONS[m].particleIntensity,
);
export const ENERGIES = MOODS.map(m => MOOD_EXPRESSIONS[m].energy);
export const GLOW_INTENSITIES = MOODS.map(
  m => MOOD_EXPRESSIONS[m].glowIntensity,
);

// Color interpolation utilities
export function lerpColor(c1: string, c2: string, t: number): string {
  'worklet';
  const n1 = parseInt(c1.slice(1), 16);
  const n2 = parseInt(c2.slice(1), 16);
  const r = Math.round(
    ((n1 >> 16) & 255) + (((n2 >> 16) & 255) - ((n1 >> 16) & 255)) * t,
  );
  const g = Math.round(
    ((n1 >> 8) & 255) + (((n2 >> 8) & 255) - ((n1 >> 8) & 255)) * t,
  );
  const b = Math.round((n1 & 255) + ((n2 & 255) - (n1 & 255)) * t);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function lerpPalette(progress: number): FlameColorPalette {
  'worklet';
  const lo = Math.max(0, Math.floor(progress));
  const hi = Math.min(MOODS.length - 1, Math.ceil(progress));
  const t = progress - lo;
  const p1 = MOOD_PALETTES[MOODS[lo]];
  const p2 = MOOD_PALETTES[MOODS[hi]];
  return {
    flameOuter: lerpColor(p1.flameOuter, p2.flameOuter, t),
    flameMid: lerpColor(p1.flameMid, p2.flameMid, t),
    flameInner: lerpColor(p1.flameInner, p2.flameInner, t),
    flameHighlight: lerpColor(p1.flameHighlight, p2.flameHighlight, t),
    face: lerpColor(p1.face, p2.face, t),
    faceHighlight: lerpColor(p1.faceHighlight, p2.faceHighlight, t),
    shadowDeep: lerpColor(p1.shadowDeep, p2.shadowDeep, t),
    shadowDark: lerpColor(p1.shadowDark, p2.shadowDark, t),
    shadowMid: lerpColor(p1.shadowMid, p2.shadowMid, t),
    feature: lerpColor(p1.feature, p2.feature, t),
    glowOuter: lerpColor(p1.glowOuter, p2.glowOuter, t),
    glowInner: lerpColor(p1.glowInner, p2.glowInner, t),
    particles: [
      lerpColor(p1.particles[0], p2.particles[0], t),
      lerpColor(p1.particles[1], p2.particles[1], t),
      lerpColor(p1.particles[2], p2.particles[2], t),
      lerpColor(p1.particles[3], p2.particles[3], t),
    ],
  };
}
