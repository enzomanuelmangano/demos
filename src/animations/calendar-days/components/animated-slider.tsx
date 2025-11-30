import { StyleSheet } from 'react-native';

import { useMemo } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import type { StyleProp, ViewStyle } from 'react-native';

type AnimatedSliderProps = {
  progress: SharedValue<number>;
  pickerSize?: number;
  sliderHeight?: number;
  color?: string;
  trackColor?: string;
  style: StyleProp<
    Omit<ViewStyle, 'width' | 'height'> & { width: number; height?: number }
  >;
  initialProgress?: number;
};

const AnimatedSlider: React.FC<AnimatedSliderProps> = ({
  progress,
  pickerSize = 35,
  color = 'white',
  trackColor = 'rgba(0, 0, 0, 0.1)',
  style,
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
  }, [sliderWidth]);

  // Update progress based on slider position
  useDerivedValue(() => {
    progress.value = clampedTranslateX.value / sliderWidth;
  }, [sliderWidth]);

  const gesture = Gesture.Pan()
    .onBegin(() => {
      scale.value = withSpring(1);
      contextX.value = clampedTranslateX.value;
    })
    .onUpdate(event => {
      translateX.value = contextX.value + event.translationX;
    })
    .onFinalize(() => {
      scale.value = withSpring(defaultScale);
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
        borderRadius: sliderHeight / 2,
        backgroundColor: trackColor,
        ...flattenedStyle,
        height: sliderHeight,
        width: sliderWidth,
        borderCurve: 'continuous',
      }}>
      <Animated.View
        style={[
          {
            backgroundColor: color,
            borderRadius: sliderHeight / 2,
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
              boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
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
    borderCurve: 'continuous',
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  progressBar: {
    borderCurve: 'continuous',
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
});

export { AnimatedSlider };
