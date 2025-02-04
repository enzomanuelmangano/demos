import {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

import { SHAKING_ANIMATION } from './animation-config';
import { useIsShaking } from './use-is-shaking';

/**
 * Linear Congruential Generator (LCG) parameters for deterministic pseudo-random number generation.
 * Used to generate consistent random values for animation parameters based on item IDs.
 *
 * @property MULTIPLIER - The multiplier parameter (a) in the LCG formula: X(n+1) = (a * X(n) + c) mod m
 * @property INCREMENT - The increment parameter (c) in the LCG formula
 * @property MODULUS - The modulus parameter (m) that determines the sequence period
 */
const LCG = {
  MULTIPLIER: 9301,
  INCREMENT: 49297,
  MODULUS: 233280,
} as const;

/**
 * Creates a deterministic random number generator based on a seed value.
 * Returns a function that generates consistent random numbers between 0 and 1.
 *
 * @param seed - Initial value to seed the random number generator
 * @returns Function that generates deterministic random numbers
 */
const generateRandom = (seed: number) => {
  const randomSeed = (seed * LCG.MULTIPLIER + LCG.INCREMENT) % LCG.MODULUS;
  return () =>
    ((randomSeed * LCG.MULTIPLIER + LCG.INCREMENT) % LCG.MODULUS) / LCG.MODULUS;
};

/**
 * Calculates animation parameters for an item based on its ID.
 * Uses deterministic random values to create varied but consistent animations.
 *
 * @param itemId - Unique identifier for the item
 * @returns Object containing calculated animation parameters
 */
const calculateAnimationParams = (itemId: number) => {
  const random = generateRandom(itemId);
  const { BASE } = SHAKING_ANIMATION;

  return {
    amplitude: BASE.AMPLITUDE + random() * BASE.AMPLITUDE_VARIATION,
    duration: BASE.DURATION + random() * BASE.DURATION_VARIATION,
    rotationAmplitude:
      BASE.ROTATION_AMPLITUDE + random() * BASE.ROTATION_VARIATION,
    baseRotation: BASE.ROTATION_BASE + random() * BASE.ROTATION_BASE_VARIATION,
  };
};

/**
 * Hook that provides shaking animation styles for grid items.
 * Creates a unique, deterministic animation for each item based on its ID.
 * The animation includes both translation and rotation effects.
 *
 * @param id - Unique identifier for the item
 * @returns Object containing animated style for the shaking effect
 */
export const useShakingAnimation = (id = 0) => {
  const { isShaking } = useIsShaking();
  const params = calculateAnimationParams(id);

  // Create animated progress value that drives the shaking animation
  const progress = useDerivedValue(() => {
    if (progress) {
      // Cancel any existing animation to prevent memory leaks
      cancelAnimation(progress);
    }

    // Return to neutral position when not shaking
    if (!isShaking.value) {
      return withTiming(0, { duration: 150 });
    }

    // Create continuous shaking animation sequence
    return withRepeat(
      withSequence(
        withTiming(-1, { duration: params.duration }),
        withTiming(1, { duration: params.duration * 2 }), // Slower movement in opposite direction
        withTiming(0, { duration: params.duration }),
      ),
      -1, // Infinite repetition
      true, // Reverse animation
    );
  }, [isShaking]);

  // Transform the progress value into actual style properties
  const rShakingStyle = useAnimatedStyle(() => {
    // Map progress to horizontal movement
    const translateX = interpolate(
      progress.value,
      [-1, 0, 1],
      [-params.amplitude, 0, params.amplitude],
    );

    // Map progress to rotation angle
    const rotate = interpolate(
      progress.value,
      [-1, 0, 1],
      [
        params.baseRotation - params.rotationAmplitude,
        0,
        params.baseRotation + params.rotationAmplitude,
      ],
    );

    const rotation = `${rotate}deg`;

    return {
      transform: [{ translateX }, { rotate: rotation }],
    };
  });

  return { rShakingStyle };
};
