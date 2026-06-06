import {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

const usePickerLayout = ({
  radius,
  sliderSize,
}: {
  radius: SharedValue<number>;
  sliderSize: {
    width: number;
    height: number;
  };
}) => {
  // State values for tracking sliding and picker position
  const isSliding = useSharedValue(false);
  const pickerX = useSharedValue(0);

  // This Skia value is used to compute the picker Y position
  // To be honest if the Radius is not changing, you can just use a normal value
  // In this case the radius itself is retrieved from the Skia height (see src/components/fluid-slider/index.tsx)
  const closedPickerY = useDerivedValue(() => {
    return sliderSize.height / 2; // Center position when not sliding
  }, [sliderSize]);

  const pickerY = useDerivedValue(() => {
    return withSpring(
      isSliding.get() ? sliderSize.height / 2 - 25 : closedPickerY.get(),
      {
        stiffness: 200,
        damping: 20,
        mass: 0.8,
      },
    );
  }, [isSliding, closedPickerY, sliderSize]);

  const clampedPickerX = useDerivedValue(() => {
    return Math.max(
      radius.get(),
      Math.min(pickerX.get(), sliderSize.width - radius.get()),
    );
  }, [pickerX, sliderSize, radius]);

  return {
    clampedPickerX,
    isSliding,
    pickerX,
    pickerY,
  };
};

export { usePickerLayout };
