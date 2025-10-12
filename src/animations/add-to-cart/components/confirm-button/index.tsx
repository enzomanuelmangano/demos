import { useWindowDimensions } from 'react-native';

import { type FC, memo, type ReactNode } from 'react';

import { PressableScale } from 'pressto';
import {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

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
      };
    }, []);

    return (
      <PressableScale
        onPress={onConfirm}
        style={[
          style,
          {
            position: 'absolute',
          },
          rStyle,
        ]}>
        {children}
      </PressableScale>
    );
  },
);

export { ConfirmButton };
