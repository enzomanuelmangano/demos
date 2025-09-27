import { Host, Slider } from '@expo/ui/swift-ui';
import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useSharedValue,
} from 'react-native-reanimated';
import { Palette } from '../../constants';

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

  return (
    <Host
      style={{
        borderRadius: 5,
        ...flattenedStyle,
        height: 60,
        width: sliderWidth,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      <ReanimatedSlider
        animatedProps={animatedProps}
        color={color}
        onValueChange={updatedValue => {
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
        }}
      />
    </Host>
  );
};

export { AnimatedSlider };
