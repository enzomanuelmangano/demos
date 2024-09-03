import React, { useCallback } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type PressableScaleProps = {
  onPress?: () => void;
  minScale?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const PressableScale: React.FC<PressableScaleProps> = React.memo(
  ({ children, onPress, style, minScale = 0.95, ...props }) => {
    const onPressWrapper = useCallback(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (onPress as any)?.();
    }, [onPress]);

    const scale = useSharedValue(1);

    const tapGesture = Gesture.Tap()
      .maxDuration(5000)
      .onTouchesDown(() => {
        scale.value = withSpring(minScale, { overshootClamping: true });
      })
      .onTouchesUp(() => {
        scale.value = withSpring(1, { overshootClamping: true }, isFinished => {
          if (isFinished) runOnJS(onPressWrapper)();
        });
      })
      .onTouchesCancelled(() => {
        scale.value = withSpring(1, { overshootClamping: true });
      });

    tapGesture.shouldCancelWhenOutside(true);

    const rStyle = useAnimatedStyle(() => {
      return {
        transform: [{ scale: scale.value }],
      };
    });

    return (
      <GestureDetector gesture={tapGesture}>
        <Animated.View {...props} style={[style, rStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    );
  },
);

export { PressableScale };
