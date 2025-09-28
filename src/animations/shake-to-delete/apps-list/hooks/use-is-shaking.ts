import { useCallback } from 'react';

import { makeMutable } from 'react-native-reanimated';

/**
 * Shared mutable state to track the shaking status across components.
 * Using Reanimated's makeMutable to ensure smooth animations.
 */
const isShaking = makeMutable(false);

/**
 * Hook to manage the shaking state of app items.
 * Provides methods to start, stop, and toggle the shaking animation.
 * Uses a shared mutable state to ensure all items animate together.
 *
 * @returns Object containing:
 * - isShaking: Mutable boolean value indicating if items are shaking
 * - startShaking: Function to start the shaking animation
 * - stopShaking: Function to stop the shaking animation
 * - toggleShaking: Function to toggle between shaking and not shaking
 */
export const useIsShaking = () => {
  // Start the shaking animation
  const startShaking = useCallback(() => {
    isShaking.value = true;
  }, []);

  // Stop the shaking animation
  const stopShaking = useCallback(() => {
    isShaking.value = false;
  }, []);

  // Toggle between shaking and not shaking states
  const toggleShaking = useCallback(() => {
    isShaking.value = !isShaking.value;
  }, []);

  return { isShaking, startShaking, stopShaking, toggleShaking };
};
