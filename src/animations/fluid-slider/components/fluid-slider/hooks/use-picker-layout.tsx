import type { SkiaMutableValue, SkiaValue } from '@shopify/react-native-skia';
import {
  runSpring,
  useComputedValue,
  useValueEffect,
} from '@shopify/react-native-skia';

const DISTANCE_BETWEEN_SLIDER_AND_METABALL = 10;

const usePickerLayout = ({
  radius,
  sliderSize,
  isSliding,
  pickerX,
  pickerY,
}: {
  isSliding: SkiaValue<boolean>;
  pickerX: SkiaValue<number>;
  pickerY: SkiaMutableValue<number>;
  radius: SkiaValue<number>;
  sliderSize: {
    width: number;
    height: number;
  };
}) => {
  // This Skia value is used to compute the picker Y position
  // To be honest if the Radius is not changing, you can just use a normal value
  // In this case the radius itself is retrieved from the Skia height (see src/components/fluid-slider/index.tsx)
  const closedPickerY = useComputedValue(() => {
    return radius.current * 3 + DISTANCE_BETWEEN_SLIDER_AND_METABALL / 1.5;
  }, [radius]);

  // That will be the initial value for the picker Y position
  // You can see it as a "componentDidMount" 🙄
  useValueEffect(closedPickerY, val => {
    pickerY.current = val;
  });

  // When the user is sliding, we want to move the picker to the top
  // Otherwise, we want to move it to the bottom
  // You can see "useValueEffect" as a "useEffect" for Skia values
  useValueEffect(isSliding, val => {
    if (!val) {
      // If the user is not sliding, we want to move the picker to the bottom
      runSpring(pickerY, closedPickerY.current, {
        stiffness: 40,
      });
    } else {
      // If the user is sliding, we want to move the picker to the top
      runSpring(pickerY, radius.current, {
        stiffness: 50,
      });
    }
  });

  const clampedPickerX = useComputedValue(() => {
    return Math.max(
      radius.current,
      Math.min(pickerX.current, sliderSize.width - radius.current),
    );
  }, [pickerX, sliderSize, radius]);

  return {
    clampedPickerX,
  };
};

export { usePickerLayout };
