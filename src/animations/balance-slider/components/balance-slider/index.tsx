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

import { TextLabel } from './text-label';

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

const clamp = (value: number, lowerBound: number, upperBound: number) => {
  'worklet';
  return Math.min(Math.max(lowerBound, value), upperBound);
};

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
  const PICKER_WIDTH_PERCENTAGE = 0.05;
  const pickerWidth = width * PICKER_WIDTH_PERCENTAGE;

  const x = useSharedValue((width + pickerWidth) * initialPercentage);

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

  const xPercentage = useDerivedValue(() => {
    return clamp((x.value - pickerWidth / 2) / width, 0, 1);
  });

  const uiXPercentage = useDerivedValue(() => {
    return xPercentage.value * (1 - PICKER_WIDTH_PERCENTAGE);
  }, []);

  const gesture = Gesture.Pan()
    .onBegin(event => {
      x.value = withSpring(event.x + pickerWidth / 2, {
        overshootClamping: true,
      });
    })
    .onUpdate(event => {
      x.value = event.x + pickerWidth / 2;
      scheduleOnRN(onChangeWrapper, xPercentage.value);
    });

  const hasReachedBoundaries = useDerivedValue(() => {
    return (
      xPercentage.value < leftPercentageLimitBeforeShift ||
      xPercentage.value > rightPercentageLimitBeforeShift
    );
  }, [leftPercentageLimitBeforeShift, rightPercentageLimitBeforeShift]);

  const boxHeightPercentage = useDerivedValue(() => {
    return withSpring(hasReachedBoundaries.value ? 0.3 : 1);
  }, []);

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
        <Animated.View
          style={[
            styles.box,
            {
              backgroundColor: leftColor.box,
            },
            rFirstContainerStyle,
          ]}
        />
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
