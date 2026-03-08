export interface FlameColorPalette {
  flameOuter: string;
  flameMid: string;
  flameInner: string;
  flameHighlight: string;
  face: string;
  faceHighlight: string;
  shadowDeep: string;
  shadowDark: string;
  shadowMid: string;
  feature: string;
  glowOuter: string;
  glowInner: string;
  particles: [string, string, string, string];
}

export type FlameMood =
  | 'default'
  | 'happy'
  | 'focused'
  | 'premium'
  | 'success'
  | 'calm';

export const MOOD_PALETTES: Record<FlameMood, FlameColorPalette> = {
  default: {
    flameOuter: '#7C3AED',
    flameMid: '#8B5CF6',
    flameInner: '#A78BFA',
    flameHighlight: '#DDD6FE',
    face: '#C4B5FD',
    faceHighlight: '#DDD6FE',
    shadowDeep: '#2E1065',
    shadowDark: '#3B0764',
    shadowMid: '#5B21B6',
    feature: '#1E1B4B',
    glowOuter: '#7C3AED',
    glowInner: '#8B5CF6',
    particles: ['#8B5CF6', '#A78BFA', '#7C3AED', '#C4B5FD'],
  },
  happy: {
    flameOuter: '#9333EA',
    flameMid: '#A855F7',
    flameInner: '#C084FC',
    flameHighlight: '#F0ABFC',
    face: '#E9D5FF',
    faceHighlight: '#FAE8FF',
    shadowDeep: '#4A044E',
    shadowDark: '#581C87',
    shadowMid: '#7E22CE',
    feature: '#2E1065',
    glowOuter: '#9333EA',
    glowInner: '#A855F7',
    particles: ['#A855F7', '#C084FC', '#9333EA', '#E9D5FF'],
  },
  focused: {
    flameOuter: '#6D28D9',
    flameMid: '#7C3AED',
    flameInner: '#8B5CF6',
    flameHighlight: '#C4B5FD',
    face: '#A78BFA',
    faceHighlight: '#C4B5FD',
    shadowDeep: '#1E1B4B',
    shadowDark: '#2E1065',
    shadowMid: '#4C1D95',
    feature: '#0F0A1E',
    glowOuter: '#6D28D9',
    glowInner: '#7C3AED',
    particles: ['#7C3AED', '#8B5CF6', '#6D28D9', '#A78BFA'],
  },
  premium: {
    flameOuter: '#D97706',
    flameMid: '#F59E0B',
    flameInner: '#FBBF24',
    flameHighlight: '#FEF3C7',
    face: '#FDE68A',
    faceHighlight: '#FEF9C3',
    shadowDeep: '#451A03',
    shadowDark: '#78350F',
    shadowMid: '#92400E',
    feature: '#1C1917',
    glowOuter: '#D97706',
    glowInner: '#F59E0B',
    particles: ['#F59E0B', '#FBBF24', '#D97706', '#FDE68A'],
  },
  success: {
    flameOuter: '#059669',
    flameMid: '#10B981',
    flameInner: '#34D399',
    flameHighlight: '#A7F3D0',
    face: '#6EE7B7',
    faceHighlight: '#D1FAE5',
    shadowDeep: '#022C22',
    shadowDark: '#064E3B',
    shadowMid: '#047857',
    feature: '#0F1A14',
    glowOuter: '#059669',
    glowInner: '#10B981',
    particles: ['#10B981', '#34D399', '#059669', '#6EE7B7'],
  },
  calm: {
    flameOuter: '#3B82F6',
    flameMid: '#60A5FA',
    flameInner: '#93C5FD',
    flameHighlight: '#DBEAFE',
    face: '#BFDBFE',
    faceHighlight: '#EFF6FF',
    shadowDeep: '#1E3A5F',
    shadowDark: '#1E40AF',
    shadowMid: '#2563EB',
    feature: '#0F172A',
    glowOuter: '#3B82F6',
    glowInner: '#60A5FA',
    particles: ['#60A5FA', '#93C5FD', '#3B82F6', '#BFDBFE'],
  },
};
