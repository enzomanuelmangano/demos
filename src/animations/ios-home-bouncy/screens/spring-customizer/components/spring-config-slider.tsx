import { StyleSheet, Text, View } from 'react-native';

import { type FC } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { ReText } from 'react-native-redash';

interface SpringConfigSliderProps {
  label: string;
  valueSharedValue: SharedValue<number>;
  minimumValue: number;
  maximumValue: number;
  step?: number;
}

const SLIDER_WIDTH = 280;
const THUMB_SIZE = 24;

/**
 * SpringConfigSlider component provides an interactive slider for adjusting spring animation parameters
 * Features a draggable thumb and real-time value display
 */
export const SpringConfigSlider: FC<SpringConfigSliderProps> = ({
  label,
  valueSharedValue,
  minimumValue,
  maximumValue,
  step = 1,
}) => {
  const translateX = useDerivedValue(() => {
    return (
      ((valueSharedValue.value - minimumValue) /
        (maximumValue - minimumValue)) *
      (SLIDER_WIDTH - THUMB_SIZE)
    );
  });
  const startX = useSharedValue(0);
  const startValue = useSharedValue(0);

  const displayText = useDerivedValue(() => {
    return valueSharedValue.value.toFixed(1);
  });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startX.value = translateX.value;
      startValue.value = valueSharedValue.value;
    })
    .onUpdate(event => {
      const newX = clamp(
        startX.value + event.translationX,
        0,
        SLIDER_WIDTH - THUMB_SIZE,
      );

      const progress = newX / (SLIDER_WIDTH - THUMB_SIZE);
      const newValue = minimumValue + progress * (maximumValue - minimumValue);
      const steppedValue = Math.round(newValue / step) * step;

      valueSharedValue.value = steppedValue;
    });

  const thumbStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const trackFillStyle = useAnimatedStyle(() => {
    return {
      width: translateX.value + THUMB_SIZE / 2,
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <ReText text={displayText} style={styles.value} />
      </View>
      <View style={styles.sliderContainer}>
        <View style={styles.track}>
          <Animated.View style={[styles.trackFill, trackFillStyle]} />
        </View>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </GestureDetector>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 0,
    marginTop: 16,
  },
  label: {
    color: '#6B7280',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  sliderContainer: {
    height: 44,
    justifyContent: 'center',
    width: SLIDER_WIDTH,
  },
  thumb: {
    backgroundColor: '#FFFFFF',
    borderColor: '#F3F4F6',
    borderCurve: 'continuous',
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
    boxShadow: '0px 4px 8px rgba(209, 213, 219, 0.1)',
    height: THUMB_SIZE,
    position: 'absolute',
    width: THUMB_SIZE,
  },
  track: {
    backgroundColor: '#F9FAFB',
    borderColor: '#F3F4F6',
    borderRadius: 4,
    borderWidth: 1,
    boxShadow: '0px 1px 2px rgba(229, 231, 235, 0.1)',
    height: 8,
    overflow: 'hidden',
    width: SLIDER_WIDTH,
  },
  trackFill: {
    backgroundColor: '#E5E7EB',
    boxShadow: '0px 1px 2px rgba(209, 213, 219, 0.08)',
    height: 8,
  },
  value: {
    backgroundColor: 'rgba(156, 163, 175, 0.06)',
    borderColor: 'rgba(209, 213, 219, 0.3)',
    borderCurve: 'continuous',
    borderRadius: 12,
    borderWidth: 1,
    boxShadow: '0px 2px 4px rgba(209, 213, 219, 0.05)',
    color: '#6B7280',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 16,
    fontWeight: '700',
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: 'center',
  },
});
