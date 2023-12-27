import React, { useCallback } from 'react';
import type { ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type PressableOpacityProps = ViewProps & { onPress: () => void } & {
  minOpacity?: number;
};

// Kind of a TouchableOpacity, but built on top of Gesture Handler (it's a bit more performant)
const PressableOpacity: React.FC<PressableOpacityProps> = React.memo(
  ({ children, onPress, style, minOpacity = 0.9, ...props }) => {
    const onPressWrapper = useCallback(() => {
      return onPress?.();
    }, [onPress]);

    const opacity = useSharedValue(1);

    const tapGesture = Gesture.Tap()
      .maxDuration(5000)
      .onTouchesDown(() => {
        opacity.value = withTiming(minOpacity);
      })
      .onTouchesUp(() => {
        runOnJS(onPressWrapper)();
      })
      .onFinalize(() => {
        opacity.value = withTiming(1);
      });

    const rStyle = useAnimatedStyle(() => {
      return {
        opacity: opacity.value,
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

export { PressableOpacity };
