// Import necessary modules and components from React and React Native
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// Import custom TextLabel component
import { TextLabel } from './text-label';

// Define types for color schemes and BalanceSliderProps
type ColorScheme = {
  box: string;
  label: string;
  percentage: string;
};

type BalanceSliderProps = {
  width: number;
  height: number;
  leftLabel: string;
  rightLabel: string;
  colors: {
    left: ColorScheme;
    right: ColorScheme;
  };
  initialPercentage?: number;
  onChange?: (_: { leftPercentage: number; rightPercentage: number }) => void;
  leftPercentageLimitBeforeShift: number;
  rightPercentageLimitBeforeShift: number;
};

// Clamp function to restrict a value within a given range
const clamp = (value: number, lowerBound: number, upperBound: number) => {
  'worklet';
  return Math.min(Math.max(lowerBound, value), upperBound);
};

// React functional component for the BalanceSlider
export const BalanceSlider: React.FC<BalanceSliderProps> = ({
  width,
  height,
  leftLabel,
  rightLabel,
  initialPercentage = 0.5,
  onChange,
  colors: { left: leftColor, right: rightColor },
  leftPercentageLimitBeforeShift,
  rightPercentageLimitBeforeShift,
}) => {
  // Constants for picker width percentage and picker width calculation
  const PICKER_WIDTH_PERCENTAGE = 0.05;
  const pickerWidth = width * PICKER_WIDTH_PERCENTAGE;

  // Shared animated value for the x-coordinate of the slider
  const x = useSharedValue((width + pickerWidth) * initialPercentage);

  // Callback function to handle percentage change
  const onChangeWrapper = useCallback(
    (percentage: number) => {
      if (onChange)
        onChange({
          leftPercentage: percentage,
          rightPercentage: 1 - percentage,
        });
    },
    [onChange],
  );

  // This is the percentage of the slider from the left
  const xPercentage = useDerivedValue(() => {
    return clamp((x.value - pickerWidth / 2) / width, 0, 1);
  });

  // This is a hacky way to prevent the slider from shifting when it reaches the right limit
  // This value is going to be used by components in order to fix the styling
  const uiXPercentage = useDerivedValue(() => {
    return xPercentage.value * (1 - PICKER_WIDTH_PERCENTAGE);
  }, []);

  // Gesture handler for pan gestures
  const gesture = Gesture.Pan()
    .onBegin(event => {
      // We substract the picker width / 2 because we want the picker to be centered
      // + withSpring is used to add spring animation to the slider
      x.value = withSpring(event.x + pickerWidth / 2, {
        overshootClamping: true,
      });
    })
    .onUpdate(event => {
      x.value = event.x + pickerWidth / 2;
      scheduleOnRN(onChangeWrapper, xPercentage.value);
    });

  // Derived animated value to check if the slider has reached its boundaries (left or right)
  const hasReachedBoundaries = useDerivedValue(() => {
    return (
      xPercentage.value < leftPercentageLimitBeforeShift ||
      xPercentage.value > rightPercentageLimitBeforeShift
    );
  }, [leftPercentageLimitBeforeShift, rightPercentageLimitBeforeShift]);

  // Derived animated value for box height percentage with spring animation
  const boxHeightPercentage = useDerivedValue(() => {
    // if the slider has reached its boundaries, we want to shrink the box height
    // of the left, right, and picker containers!
    return withSpring(hasReachedBoundaries.value ? 0.3 : 1);
  }, []);

  // Animated styles for the first container, second container, and picker container
  const rFirstContainerStyle = useAnimatedStyle(() => {
    return {
      width: `${uiXPercentage.value * 100}%`,
      height: `${boxHeightPercentage.value * 100}%`,
    };
  }, []);

  const rSecondContainerStyle = useAnimatedStyle(() => {
    return {
      width: `${(1 - uiXPercentage.value - PICKER_WIDTH_PERCENTAGE) * 100}%`,
      height: `${boxHeightPercentage.value * 100}%`,
    };
  }, []);

  const rPickerContainerStyle = useAnimatedStyle(() => {
    return {
      height: `${boxHeightPercentage.value * 100}%`,
    };
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          {
            width,
            height,
            flexDirection: 'row',
            alignItems: 'flex-end',
          },
        ]}>
        <TextLabel
          label={leftLabel}
          color={leftColor}
          type="left"
          xPercentage={xPercentage}
          height={height}
          shifted={hasReachedBoundaries}
        />
        <TextLabel
          label={rightLabel}
          color={rightColor}
          type="right"
          xPercentage={xPercentage}
          height={height}
          shifted={hasReachedBoundaries}
        />
        {/* Left Box */}
        <Animated.View
          style={[
            styles.box,
            {
              backgroundColor: leftColor.box,
            },
            rFirstContainerStyle,
          ]}
        />
        {/* Custom Picker */}
        <Animated.View
          style={[
            {
              width: pickerWidth,
            },
            styles.pickerContainer,
            rPickerContainerStyle,
          ]}>
          <View
            style={{
              width: pickerWidth / 4,
              height: '80%',
              backgroundColor: 'white',
              borderRadius: 50,
            }}
          />
        </Animated.View>
        {/* Right Box */}
        <Animated.View
          style={[
            styles.box,
            {
              backgroundColor: rightColor.box,
            },
            rSecondContainerStyle,
          ]}
        />
      </Animated.View>
    </GestureDetector>
  );
};

// Stylesheet for the BalanceSlider component
const styles = StyleSheet.create({
  box: {
    height: '100%',
    borderRadius: 5,
  },
  pickerContainer: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
