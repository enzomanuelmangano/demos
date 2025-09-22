import {
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useGestureHandler } from 'react-native-skia-gesture';

import { SpringConfig } from './constants';

type UseDeleteButtonAnimationsParams = {
  additionalWidth: number;
  onDelete: () => void;
};

// Custom hook for managing delete button animations
export const useDeleteButtonAnimations = ({
  additionalWidth,
  onDelete,
}: UseDeleteButtonAnimationsParams) => {
  // Shared values for tracking button state
  const isToggled = useSharedValue(false);
  const isButtonPressed = useSharedValue(false);

  // Animate the x-position of the delete button
  const deleteButtonRectX = useDerivedValue(() => {
    // Move button to 0 when toggled, otherwise to half of additionalWidth
    return withSpring(isToggled.value ? 0 : additionalWidth / 2, SpringConfig);
  }, []);

  // Animate the color of the delete button
  const deleteButtonColor = useDerivedValue(() => {
    // Change color to black when toggled, otherwise red
    return withTiming(isToggled.value ? 'black' : 'red');
  }, []);

  // Handle gesture events for the delete button
  const gestureHandler = useGestureHandler({
    onStart: () => {
      'worklet';
      isButtonPressed.value = true;
    },
    onTap: () => {
      'worklet';
      isButtonPressed.value = false;
      if (isToggled.value) {
        // If already toggled, trigger delete action
        return runOnJS(onDelete)();
      }
      // Otherwise, toggle the button
      isToggled.value = true;
    },
  });

  // Animate the scale of the button when pressed
  const scale = useDerivedValue(() => {
    return withTiming(isButtonPressed.value ? 0.95 : 1);
  }, []);

  // Create a transform object for the button
  const buttonTransform = useDerivedValue(() => {
    return [{ scale: scale.value }];
  }, []);

  // Return all necessary values and functions for the delete button
  return {
    isToggled,
    deleteButtonRectX,
    deleteButtonColor,
    gestureHandler,
    buttonTransform,
  };
};
