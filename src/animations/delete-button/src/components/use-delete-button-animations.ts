import * as Haptics from 'expo-haptics';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useGestureHandler } from 'react-native-skia-gesture';
import { scheduleOnRN } from 'react-native-worklets';

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
    return withSpring(isToggled.get() ? 0 : additionalWidth / 2);
  }, []);

  const deleteButtonColor = useDerivedValue(() => {
    return withTiming(isToggled.get() ? 'black' : 'red');
  }, []);

  const gestureHandler = useGestureHandler({
    onStart: () => {
      'worklet';
      isButtonPressed.set(true);
    },
    onTap: () => {
      'worklet';
      isButtonPressed.set(false);
      scheduleOnRN(Haptics.selectionAsync);
      if (isToggled.get()) {
        return scheduleOnRN(onDelete);
      }
      isToggled.set(true);
    },
  });

  const scale = useDerivedValue(() => {
    return withSpring(isButtonPressed.get() ? 0.95 : 1);
  }, []);

  const buttonTransform = useDerivedValue(() => {
    return [{ scale: scale.get() }];
  }, []);

  return {
    isToggled,
    deleteButtonRectX,
    deleteButtonColor,
    gestureHandler,
    buttonTransform,
  };
};
