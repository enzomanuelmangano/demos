import { StyleSheet } from 'react-native';

import { useMemo } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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

const clamp = (value: number, lowerBound: number, upperBound: number) => {
  'worklet';
  return Math.min(Math.max(value, lowerBound), upperBound);
};

/**
 * This is a custom slider component that uses Reanimated and Gesture Handler
 * to create a slider that can be interacted with.
 * It's based on the structure of the slider from a previous slider animation
 * that I've made on Patreon:
 * You can find more details on the original slider here: Balloon Slider https://www.patreon.com/posts/balloon-slider-79018863
 * And here: (Custom QrCode)  https://www.patreon.com/posts/qrcode-generator-8617129
 */
const AnimatedSlider: React.FC<SliderProps> = ({
  pickerSize = 35,
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

  const sliderHeight = flattenedStyle?.height ?? 4;
  const sliderWidth = flattenedStyle.width;

  const defaultPickerBorderRadius = pickerSize / 2;

  const defaultScale = 0.8;

  const translateX = useSharedValue(initialProgress * sliderWidth);
  const contextX = useSharedValue(0);
  const scale = useSharedValue(defaultScale);

  const clampedTranslateX = useDerivedValue(() => {
    return clamp(translateX.value, 0, sliderWidth);
  }, []);
  useAnimatedReaction(
    () => {
      return clampedTranslateX.value;
    },
    translation => {
      const progress = interpolate(
        translation,
        [0, sliderWidth],
        [minValue, maxValue],
        Extrapolation.CLAMP,
      );
      if (onUpdate) scheduleOnRN(onUpdate, progress);
    },
  );

  const gesture = Gesture.Pan()
    .onBegin(() => {
      scale.value = withTiming(1);
      contextX.value = clampedTranslateX.value;
    })
    .onUpdate(event => {
      translateX.value = contextX.value + event.translationX;
    })
    .onFinalize(() => {
      scale.value = withTiming(defaultScale);
    });
  const rPickerStyle = useAnimatedStyle(() => {
    return {
      borderRadius: defaultPickerBorderRadius,
      transform: [
        { translateX: clampedTranslateX.value - pickerSize / 2 },
        { scale: scale.value },
      ],
    };
  }, []);

  const rProgressBarStyle = useAnimatedStyle(() => {
    return {
      width: clampedTranslateX.value,
    };
  }, []);

  return (
    <Animated.View
      style={{
        borderRadius: 5,
        backgroundColor: Palette.secondary,
        ...flattenedStyle,
        height: sliderHeight,
        width: sliderWidth,
      }}>
      <Animated.View
        style={[
          {
            backgroundColor: color,
          },
          styles.progressBar,
          rProgressBarStyle,
        ]}
      />
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            {
              height: pickerSize,
              top: -pickerSize / 2 + sliderHeight / 2,
            },
            styles.picker,
            rPickerStyle,
          ]}
        />
      </GestureDetector>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  picker: {
    aspectRatio: 1,
    backgroundColor: Palette.primary,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  progressBar: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
});

export { AnimatedSlider };
