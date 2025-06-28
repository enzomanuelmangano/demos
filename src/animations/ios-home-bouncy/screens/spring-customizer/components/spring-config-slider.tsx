import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useDerivedValue,
  clamp,
} from 'react-native-reanimated';

import { ReText } from '../../../components/ReText';

interface SpringConfigSliderProps {
  label: string;
  valueSharedValue: Animated.SharedValue<number>;
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
export const SpringConfigSlider: React.FC<SpringConfigSliderProps> = ({
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
    marginTop: 16,
  },
  label: {
    fontSize: 17,
    color: '#6B7280',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontWeight: '700',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  value: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '700',
    fontFamily: 'SF-Pro-Rounded-Bold',
    minWidth: 70,
    textAlign: 'center',
    backgroundColor: 'rgba(156, 163, 175, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(209, 213, 219, 0.3)',
    shadowColor: '#D1D5DB',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sliderContainer: {
    height: 44,
    justifyContent: 'center',
    width: SLIDER_WIDTH,
  },
  track: {
    height: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
    width: SLIDER_WIDTH,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#E5E7EB',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
    overflow: 'hidden',
  },
  trackFill: {
    height: 8,
    backgroundColor: '#E5E7EB',
    shadowColor: '#D1D5DB',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    backgroundColor: '#FFFFFF',
    borderRadius: THUMB_SIZE / 2,
    shadowColor: '#D1D5DB',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#F3F4F6',
  },
});
