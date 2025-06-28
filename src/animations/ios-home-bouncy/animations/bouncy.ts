import {
  cancelAnimation,
  makeMutable,
  withDelay,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

export interface SpringConfig {
  mass: number;
  damping: number;
  stiffness: number;
  restDisplacementThreshold?: number;
  restSpeedThreshold?: number;
}

// NOTE: Using makeMutable is not a smart decision here, but it's so convenient.
// makeMutable might become deprecated in the future (I will always maintain the repo for Demo supporters)
// A decent approach would be to create a Provider and propagate the shared value by creating it via useSharedValue
// This way we can avoid using makeMutable and use useSharedValue instead (makeMutable is a way to define a SharedValue outside of React context)

// Shared progress value for bouncy animations (0 = closed, 1 = opening, 2 = open)
export const BouncyProgressShared = makeMutable(0);

// Spring configuration for opening animation
export const OpeningSpringConfigShared = makeMutable<SpringConfig>({
  mass: 20,
  damping: 80,
  stiffness: 180,
});

// Spring configuration for closing animation with more bounce
export const ClosingSpringConfigShared = makeMutable<SpringConfig>({
  mass: 1.4,
  damping: 18,
  stiffness: 100,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 2,
});

/**
 * Starts the bouncy animation sequence
 * Animates through: initial spring → delay → opening → closing
 */
export const startAnimation = () => {
  'worklet';
  cancelAnimation(BouncyProgressShared);
  BouncyProgressShared.value = withSequence(
    withSpring(0, { mass: 80, damping: 120, stiffness: 240 }),
    withDelay(
      800,
      withSequence(
        withSpring(1, {
          ...OpeningSpringConfigShared.get(),
          restDisplacementThreshold: 0.002,
          restSpeedThreshold: 10,
        }),
        withSpring(2, ClosingSpringConfigShared.value),
      ),
    ),
  );
};
