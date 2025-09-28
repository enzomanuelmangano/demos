import {
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useGestureHandler } from 'react-native-skia-gesture';
import { scheduleOnRN } from 'react-native-worklets';

import { SpringConfig } from './constants';

type UseDeleteButtonAnimationsParams = {
  additionalWidth: number;
  onDelete: () => void;
};

export const useDeleteButtonAnimations = ({
  additionalWidth,
  onDelete,
}: UseDeleteButtonAnimationsParams) => {
  const isToggled = useSharedValue(false);
  const isButtonPressed = useSharedValue(false);

  const deleteButtonRectX = useDerivedValue(() => {
    return withSpring(isToggled.value ? 0 : additionalWidth / 2, SpringConfig);
  }, []);

  const deleteButtonColor = useDerivedValue(() => {
    return withTiming(isToggled.value ? 'black' : 'red');
  }, []);

  const gestureHandler = useGestureHandler({
    onStart: () => {
      'worklet';
      isButtonPressed.value = true;
    },
    onTap: () => {
      'worklet';
      isButtonPressed.value = false;
      if (isToggled.value) {
        return scheduleOnRN(onDelete);
      }
      isToggled.value = true;
    },
  });

  const scale = useDerivedValue(() => {
    return withTiming(isButtonPressed.value ? 0.95 : 1);
  }, []);

  const buttonTransform = useDerivedValue(() => {
    return [{ scale: scale.value }];
  }, []);

  return {
    isToggled,
    deleteButtonRectX,
    deleteButtonColor,
    gestureHandler,
    buttonTransform,
  };
};
