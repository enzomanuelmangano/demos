// Import necessary functions and modules from react and react-native-reanimated
import { useCallback } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// Custom hook for creating an animated shaking effect
const useAnimatedShake = () => {
  // Shared value to track the horizontal translation for shaking
  const shakeTranslateX = useSharedValue(0);

  // Callback function to trigger the shake animation
  const shake = useCallback(() => {
    // Cancel any ongoing animations on shakeTranslateX
    cancelAnimation(shakeTranslateX);

    // Reset the translation value to 0 before starting the new animation
    shakeTranslateX.value = 0;

    // Apply a repeating animation to create a shaking effect
    shakeTranslateX.value = withRepeat(
      withTiming(10, {
        duration: 120,
        easing: Easing.bezier(0.35, 0.7, 0.5, 0.7),
      }),
      6, // Repeat the animation 6 times
      true, // Infinite loop (true indicates indefinite repetition)
    );
  }, [shakeTranslateX]); // Dependency array to ensure proper re-rendering

  // Define the animated style based on the current translation value
  const rShakeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeTranslateX.value }],
    };
  }, []);

  // Return the shake callback function and the animated style for external use
  return { shake, rShakeStyle };
};

// Export the custom hook for use in other components
export { useAnimatedShake };
