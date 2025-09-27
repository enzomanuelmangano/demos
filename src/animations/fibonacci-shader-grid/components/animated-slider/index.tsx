import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
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
  color = 'white',
  style,
  onUpdate,
  initialProgress = 0,
}) => {
  // Memoize the flattened style for performance.
  const flattenedStyle = useMemo(() => {
    return StyleSheet.flatten(style);
  }, [style]);

  // Extract slider height and width from the style.
  const sliderHeight = flattenedStyle?.height ?? 4;
  const sliderWidth = flattenedStyle.width;

  // Default values for picker appearance and interaction.
  const defaultPickerBorderRadius = pickerSize / 2;

  const defaultScale = 0.8;

  // Reanimated values for animation and interaction.
  const translateX = useSharedValue(initialProgress * sliderWidth);
  const contextX = useSharedValue(0);
  const scale = useSharedValue(defaultScale);

  // Ensure that translateX value stays within bounds.
  const clampedTranslateX = useDerivedValue(() => {
    return clamp(translateX.value, 0, sliderWidth);
  }, [sliderWidth]);

  // Update the progress based on the slider's position.
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
      if (onUpdate) onUpdate(progress);
    },
  );

  // Define a gesture handler for panning (dragging) interactions.
  const gesture = Gesture.Pan()
    // The following functions specify what should happen during different phases of the gesture:
    // When the pan gesture begins (user starts dragging the slider).
    .onBegin(() => {
      // Increase the scale of the picker when dragging starts, giving it a zoom-in effect.
      scale.value = withTiming(1);
      // Store the current position of the picker so we can calculate the translation relative to this point.
      contextX.value = clampedTranslateX.value;
    })
    // While the gesture is being updated (user is actively dragging the slider).
    .onUpdate(event => {
      // Update the `translateX` value based on the initial position (contextX) and the current drag distance (event.translationX).
      // This makes the slider move along with the user's drag.
      translateX.value = contextX.value + event.translationX;
    })
    // When the pan gesture is finalized (user releases the slider after dragging).
    .onFinalize(() => {
      // Restore the picker to its default scale (zoom-out effect) after the drag is completed.
      scale.value = withTiming(defaultScale);
    });

  // Define the style for the animated picker.
  const rPickerStyle = useAnimatedStyle(() => {
    return {
      borderRadius: defaultPickerBorderRadius,
      transform: [
        { translateX: clampedTranslateX.value - pickerSize / 2 },
        { scale: scale.value },
      ],
    };
  }, []);

  // Define the style for the animated progress bar.
  const rProgressBarStyle = useAnimatedStyle(() => {
    return {
      width: clampedTranslateX.value,
    };
  }, []);

  return (
    <Animated.View
      style={{
        borderRadius: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
  progressBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  picker: {
    aspectRatio: 1,
    backgroundColor: 'white',
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
});

export { AnimatedSlider };
