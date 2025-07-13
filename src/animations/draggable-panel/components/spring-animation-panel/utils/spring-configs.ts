import type { WithSpringConfig } from 'react-native-reanimated';

export const springAnimationConfigs: Record<string, WithSpringConfig> = {
  elegant: {
    damping: 30,
    stiffness: 200,
    mass: 0.7,
  },
  springy: {
    damping: 18,
    stiffness: 150,
    mass: 1.0,
  },
  'super-springy': {
    damping: 15,
    stiffness: 120,
    mass: 1.4,
  },
};

export const defaultSpringConfig = springAnimationConfigs.elegant;
