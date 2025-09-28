import { useWindowDimensions } from 'react-native';

import { type FC, memo, type ReactNode } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { StyleProp, ViewStyle } from 'react-native';
import type { MeasuredDimensions, SharedValue } from 'react-native-reanimated';

type ConfirmButtonProps = {
  animationProgress: SharedValue<number>;
  layoutData: SharedValue<null | MeasuredDimensions>;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  onConfirm?: () => void;
};

const ConfirmButton: FC<ConfirmButtonProps> = memo(
  ({ animationProgress, layoutData, style, children, onConfirm }) => {
    const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } =
      useWindowDimensions();

    const animatedTop = useDerivedValue(() => {
      return interpolate(
        animationProgress.value,
        [0, 1],
        [layoutData.value?.pageY ?? 0, SCREEN_HEIGHT - 100],
      );
    }, []);

    const animatedWidth = useDerivedValue(() => {
      return interpolate(
        animationProgress.value,
        [0, 1],
        [layoutData.value?.width ?? 0, SCREEN_WIDTH * 0.9],
      );
    }, []);

    const animatedHeight = useDerivedValue(() => {
      return interpolate(
        animationProgress.value,
        [0, 1],
        [layoutData.value?.height ?? 0, 45],
      );
    }, []);

    const animatedLeft = useDerivedValue(() => {
      return interpolate(
        animationProgress.value,
        [0, 1],
        [layoutData.value?.pageX ?? 0, SCREEN_WIDTH * 0.05],
      );
    }, []);

    const scale = useSharedValue(1);

    const tapGesture = Gesture.Tap()
      .onTouchesDown(() => {
        scale.value = withTiming(0.95);
      })
      .onTouchesUp(() => {
        if (onConfirm) scheduleOnRN(onConfirm);
      })
      .onFinalize(() => {
        scale.value = withTiming(1);
      });
    tapGesture.shouldCancelWhenOutside(true);
    tapGesture.maxDuration(5000);

    const rStyle = useAnimatedStyle(() => {
      if (!layoutData.value) {
        return {
          height: 0,
          width: 0,
        };
      }

      return {
        height: animatedHeight.value,
        width: animatedWidth.value,
        zIndex: 10,
        top: animatedTop.value,
        left: animatedLeft.value,
        transform: [{ scale: scale.value }],
      };
    }, []);

    return (
      <GestureDetector gesture={tapGesture}>
        <Animated.View
          style={[
            style,
            {
              position: 'absolute',
            },
            rStyle,
          ]}>
          {children}
        </Animated.View>
      </GestureDetector>
    );
  },
);

export { ConfirmButton };
