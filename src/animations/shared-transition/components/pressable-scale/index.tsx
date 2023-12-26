import React, { useCallback } from 'react';
import type { TouchableOpacityProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type PressableScaleProps = Omit<TouchableOpacityProps, 'activeOpacity'> & {
  minScale?: number;
};

const PressableScale: React.FC<PressableScaleProps> = React.memo(
  ({
    children,
    onPressIn,
    onPress,
    onPressOut,
    style,
    minScale = 0.95,
    ...props
  }) => {
    const onPressInWrapper = useCallback(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (onPressIn as any)?.();
    }, [onPressIn]);

    const onPressWrapper = useCallback(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (onPress as any)?.();
    }, [onPress]);

    const onPressOutWrapper = useCallback(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (onPressOut as any)?.();
    }, [onPressOut]);

    const scale = useSharedValue(1);

    const tapGesture = Gesture.Tap()
      .onTouchesDown(() => {
        scale.value = withSpring(minScale, { overshootClamping: true });
        runOnJS(onPressInWrapper)();
      })
      .onTouchesUp(() => {
        runOnJS(onPressWrapper)();
      })
      .onFinalize(() => {
        scale.value = withSpring(1, { overshootClamping: true });
        runOnJS(onPressOutWrapper)();
      });

    tapGesture.shouldCancelWhenOutside(true);

    const rStyle = useAnimatedStyle(() => {
      return {
        transform: [{ scale: scale.value }],
      };
    });

    return (
      <GestureDetector gesture={tapGesture}>
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-ignore */}
        <Animated.View {...props} style={[style, rStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    );
  },
);

export { PressableScale };
