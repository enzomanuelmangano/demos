import { StyleSheet, Text, View } from 'react-native';

import { useMemo } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import type { StyleProp, ViewStyle } from 'react-native';

type DaySliderProps = {
  progress: SharedValue<number>;
  style?: StyleProp<
    Omit<ViewStyle, 'width' | 'height'> & { width: number; height?: number }
  >;
};

const PICKER_SIZE = 32;
const SLIDER_HEIGHT = 4;
const TRACK_COLOR = '#E5E5E5';
const PICKER_COLOR = '#FFFFFF';

const clamp = (value: number, lowerBound: number, upperBound: number) => {
  'worklet';
  return Math.min(Math.max(value, lowerBound), upperBound);
};

const DaySlider = ({ progress, style }: DaySliderProps) => {
  const flattenedStyle = useMemo(() => {
    return StyleSheet.flatten(style);
  }, [style]);

  const sliderWidth = flattenedStyle?.width ?? 280;

  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);
  const scale = useSharedValue(1);

  const clampedTranslateX = useDerivedValue(() => {
    return clamp(translateX.value, 0, sliderWidth);
  }, [sliderWidth]);

  // Update progress based on slider position
  useDerivedValue(() => {
    progress.value = clampedTranslateX.value / sliderWidth;
  }, [sliderWidth]);

  const gesture = Gesture.Pan()
    .onBegin(() => {
      scale.value = withSpring(1.2, { damping: 15, stiffness: 300 });
      contextX.value = clampedTranslateX.value;
    })
    .onUpdate(event => {
      translateX.value = contextX.value + event.translationX;
    })
    .onFinalize(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    });

  const rPickerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: clampedTranslateX.value - PICKER_SIZE / 2 },
        { scale: scale.value },
      ],
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={[styles.sliderContainer, { width: sliderWidth }]}>
        <View style={[styles.track, { width: sliderWidth }]} />
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.picker, rPickerStyle]} />
        </GestureDetector>
      </View>
      <View style={[styles.labelsContainer, { width: sliderWidth }]}>
        <Text style={styles.label}>First Day</Text>
        <Text style={styles.label}>Last Day</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 16,
  },
  label: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
  },
  labelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  picker: {
    backgroundColor: PICKER_COLOR,
    borderRadius: PICKER_SIZE / 2,
    elevation: 4,
    height: PICKER_SIZE,
    left: 0,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: {
      height: 2,
      width: 0,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    top: -PICKER_SIZE / 2 + SLIDER_HEIGHT / 2,
    width: PICKER_SIZE,
  },
  sliderContainer: {
    height: SLIDER_HEIGHT,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    backgroundColor: TRACK_COLOR,
    borderRadius: SLIDER_HEIGHT / 2,
    height: SLIDER_HEIGHT,
  },
});

export { DaySlider };
