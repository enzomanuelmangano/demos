import { StyleSheet } from 'react-native';

import { type FC, useMemo } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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

const PRIMARY_COLOR = 'white';

const clamp = (value: number, lowerBound: number, upperBound: number) => {
  'worklet';
  return Math.min(Math.max(value, lowerBound), upperBound);
};

// This is a custom slider component that uses reanimated
// and gesture handler to create a slider that can be used
// Basically I took the structure of the slider from my previous slider animation
// - https://www.patreon.com/posts/balloon-slider-79018863

const Slider: FC<SliderProps> = ({
  pickerSize = 50,
  minValue = 0,
  maxValue = 1,
  color = PRIMARY_COLOR,
  style,
  onUpdate,
  initialProgress = 0,
}) => {
  const flattenedStyle = useMemo(() => {
    return StyleSheet.flatten(style);
  }, [style]);

  const sliderHeight = flattenedStyle?.height ?? 4;
  const sliderWidth = flattenedStyle.width;

  const defaultPickerBorderRadius = pickerSize / 2.5;
  const defaultPickerBorderWidth = Math.floor(pickerSize / 3);
  const defaultScale = 0.7;

  const translateX = useSharedValue(initialProgress * sliderWidth);
  const contextX = useSharedValue(0);

  const scale = useSharedValue(defaultScale);
  const pickerBorderRadius = useSharedValue(defaultPickerBorderRadius);
  const pickerBorderWidth = useSharedValue(defaultPickerBorderWidth);

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
      );
      if (onUpdate) scheduleOnRN(onUpdate, progress);
    },
  );

  const gesture = Gesture.Pan()
    .onBegin(() => {
      // @@TODO: prefer one shared value and animate
      pickerBorderRadius.value = withSpring(pickerSize / 2);
      pickerBorderWidth.value = withSpring(4, {
        dampingRatio: 1,
        duration: 500,
      });
      scale.value = withSpring(1);
      contextX.value = clampedTranslateX.value;
    })
    .onUpdate(event => {
      translateX.value = contextX.value + event.translationX;
    })
    .onTouchesUp(() => {
      scale.value = withSpring(defaultScale);
      pickerBorderRadius.value = withSpring(defaultPickerBorderRadius);
      pickerBorderWidth.value = withSpring(defaultPickerBorderWidth);
    });

  const rPickerStyle = useAnimatedStyle(() => {
    return {
      borderWidth: pickerBorderWidth.value,
      borderRadius: pickerBorderRadius.value,
      transform: [
        { translateX: clampedTranslateX.value - pickerSize / 2 },
        {
          scale: scale.value,
        },
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
        backgroundColor: 'gray',
        ...flattenedStyle,
        height: sliderHeight,
        width: sliderWidth,
        borderCurve: 'continuous',
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
              borderColor: color,
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
    backgroundColor: 'white',
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

export { Slider };
