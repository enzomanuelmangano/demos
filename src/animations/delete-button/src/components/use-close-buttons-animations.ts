import { Skia } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useGestureHandler } from 'react-native-skia-gesture';

import { SpringConfig } from './constants';

// Define the parameters for the useCloseButtonAnimations hook
type UseCloseButtonAnimationsParams = {
  isToggled: SharedValue<boolean>;
  width: number;
  additionalWidth: number;
};

export const useCloseButtonAnimations = ({
  isToggled,
  width,
  additionalWidth,
}: UseCloseButtonAnimationsParams) => {
  // Track whether the close button is currently pressed
  const isCloseButtonPressed = useSharedValue(false);

  // Calculate the x-position of the close icon circle
  const closeIconCircleX = useDerivedValue(() => {
    return withSpring(
      isToggled.value
        ? width + additionalWidth / 2 // Fully expanded position
        : width / 2 + additionalWidth / 2, // Default position
      SpringConfig,
    );
  }, []);

  // Animate the opacity of the close button
  const closeButtonOpacity = useDerivedValue(() => {
    return withTiming(isToggled.value ? 1 : 0); // Fade in when toggled, fade out when not
  }, []);

  // Handle gesture events for the close button
  const gestureHandlerClose = useGestureHandler({
    onStart: () => {
      'worklet';
      isCloseButtonPressed.value = true; // Set pressed state when touch starts
    },
    onTap: () => {
      'worklet';
      isCloseButtonPressed.value = false; // Reset pressed state when touch ends
      isToggled.value = false; // Toggle off the button
    },
  });

  // Animate the scale of the close button when pressed
  const closeButtonScale = useDerivedValue(() => {
    return withTiming(isCloseButtonPressed.value ? 0.95 : 1); // Slightly shrink when pressed
  }, []);

  // Create a transform object for the close button
  const closeButtonTransform = useDerivedValue(() => {
    return [{ scale: closeButtonScale.value }];
  }, []);

  // Create a shared Skia Paint object for opacity updates
  // This is a workaround for SVG opacity updates in react-native-skia
  // See: https://github.com/Shopify/react-native-skia/issues/1709
  const paint = useSharedValue(Skia.Paint());
  useAnimatedReaction(
    () => closeButtonOpacity.value,
    opacity => {
      paint.value.setAlphaf(opacity); // Update the paint's alpha value
    },
  );

  // Return all the animated values and handlers
  return {
    closeIconCircleX,
    closeButtonOpacity,
    gestureHandlerClose,
    closeButtonTransform,
    paint,
  };
};
