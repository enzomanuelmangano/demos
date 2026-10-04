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
  // Must be a worklet: it's called on the UI thread on every drag frame
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
    return clamp(translateX.get(), 0, sliderWidth);
  }, []);

  useAnimatedReaction(
    () => {
      return clampedTranslateX.get();
    },
    translation => {
      const progress = interpolate(
        translation,
        [0, sliderWidth],
        [minValue, maxValue],
      );
      // Called directly on the UI thread: no JS hop per drag frame
      if (onUpdate) onUpdate(progress);
    },
  );

  const gesture = Gesture.Pan()
    .onBegin(() => {
      // @@TODO: prefer one shared value and animate
      pickerBorderRadius.set(withSpring(pickerSize / 2));
      pickerBorderWidth.set(
        withSpring(4, {
          dampingRatio: 1,
          duration: 500,
        }),
      );
      scale.set(withSpring(1));
      contextX.set(clampedTranslateX.get());
    })
    .onUpdate(event => {
      translateX.set(contextX.get() + event.translationX);
    })
    .onTouchesUp(() => {
      scale.set(withSpring(defaultScale));
      pickerBorderRadius.set(withSpring(defaultPickerBorderRadius));
      pickerBorderWidth.set(withSpring(defaultPickerBorderWidth));
    });

  // Border props only change on press/release: kept apart from the
  // per-frame transform so dragging doesn't re-send them every frame.
  const rPickerBorderStyle = useAnimatedStyle(() => {
    return {
      borderWidth: pickerBorderWidth.get(),
      borderRadius: pickerBorderRadius.get(),
    };
  }, []);

  const rPickerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: clampedTranslateX.get() - pickerSize / 2 },
        {
          scale: scale.get(),
        },
      ],
    };
  }, []);

  // Full-width bar scaled from the left instead of animating `width`:
  // same pixels (the bar has no radius), no layout pass per frame.
  const rProgressBarStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scaleX: clampedTranslateX.get() / sliderWidth }],
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
            width: sliderWidth,
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
            rPickerBorderStyle,
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
    transformOrigin: 'left',
  },
});

export { Slider };
