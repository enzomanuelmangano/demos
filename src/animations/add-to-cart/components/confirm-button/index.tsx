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
        animationProgress.get(),
        [0, 1],
        [layoutData.get()?.pageY ?? 0, SCREEN_HEIGHT - 100],
      );
    }, []);

    const animatedWidth = useDerivedValue(() => {
      return interpolate(
        animationProgress.get(),
        [0, 1],
        [layoutData.get()?.width ?? 0, SCREEN_WIDTH * 0.9],
      );
    }, []);

    const animatedHeight = useDerivedValue(() => {
      return interpolate(
        animationProgress.get(),
        [0, 1],
        [layoutData.get()?.height ?? 0, 45],
      );
    }, []);

    const animatedLeft = useDerivedValue(() => {
      return interpolate(
        animationProgress.get(),
        [0, 1],
        [layoutData.get()?.pageX ?? 0, SCREEN_WIDTH * 0.05],
      );
    }, []);

    const rStyle = useAnimatedStyle(() => {
      // Zero size alone isn't enough: a zero-size frame at the origin equals
      // Fabric's empty layout, so a recycled native view never receives it
      // and keeps its previous frame as a black box. Opacity 0 hides it (and
      // takes it out of hit-testing) whatever frame it has.
      if (!layoutData.get()) {
        return {
          height: 0,
          width: 0,
          opacity: 0,
        };
      }

      return {
        opacity: 1,
        height: animatedHeight.get(),
        width: animatedWidth.get(),
        zIndex: 10,
        top: animatedTop.get(),
        left: animatedLeft.get(),
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
