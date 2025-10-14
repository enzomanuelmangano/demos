import { StyleSheet } from 'react-native';

import { useCallback, useMemo } from 'react';

import { Host, Slider } from '@expo/ui/swift-ui';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useSharedValue,
} from 'react-native-reanimated';

import { Palette } from '../../constants';

import type { StyleProp, ViewStyle } from 'react-native';

type SliderProps = {
  pickerSize?: number;
  sliderHeight?: number;
  minValue?: number;
  maxValue?: number;
  color?: string;
  style: StyleProp<
    Omit<ViewStyle, 'width' | 'height'> & { width: number; height?: number }
  >;
  onUpdate?: (progress: number) => void;
  initialProgress?: number;
};

const ReanimatedSlider = Animated.createAnimatedComponent(Slider);

const AnimatedSlider: React.FC<SliderProps> = ({
  minValue = 0,
  maxValue = 1,
  color = Palette.primary,
  style,
  onUpdate,
  initialProgress = 0,
}) => {
  const flattenedStyle = useMemo(() => {
    return StyleSheet.flatten(style);
  }, [style]);

  const sliderWidth = flattenedStyle.width;

  const sliderProgress = useSharedValue(initialProgress);

  const animatedProps = useAnimatedProps(() => {
    return {
      value: sliderProgress.value,
    };
  }, []);

  const onSliderValueChange = useCallback(
    (updatedValue: number) => {
      sliderProgress.set(updatedValue);
      if (onUpdate) {
        const progress = interpolate(
          updatedValue,
          [0, 1],
          [minValue, maxValue],
          Extrapolation.CLAMP,
        );
        onUpdate(progress);
      }
    },
    [onUpdate, minValue, maxValue, sliderProgress],
  );

  return (
    <Host
      style={[
        {
          width: sliderWidth,
        },
        styles.container,
      ]}>
      <ReanimatedSlider
        animatedProps={animatedProps}
        color={color}
        onValueChange={onSliderValueChange}
      />
    </Host>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 5,
    height: 60,
    justifyContent: 'center',
  },
});

export { AnimatedSlider };
