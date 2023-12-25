import React, { useCallback } from 'react';
import type { ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type ScaleButtonProps = ViewProps & {
  onTap?: () => void;
};

const ScaleButton: React.FC<ScaleButtonProps> = React.memo(
  ({ onTap, style, children, ...rest }) => {
    const scale = useSharedValue(1);

    const onTapWrapper = useCallback(() => {
      onTap?.();
    }, [onTap]);

    // handle gesture events and scale the button accordingly
    const gesture = Gesture.Tap()
      .onTouchesDown(() => {
        scale.value = withTiming(0.8);
      })
      .onTouchesUp(() => {
        runOnJS(onTapWrapper)();
      })
      .onFinalize(() => {
        scale.value = withTiming(1);
      });

    const rStyle = useAnimatedStyle(() => {
      return {
        transform: [{ scale: scale.value }],
      };
    }, []);

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View {...rest} style={[style, rStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    );
  },
);

export { ScaleButton };
