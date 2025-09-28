import { type FC, memo } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { TouchableOpacityProps } from 'react-native';

type PressableScaleProps = Omit<TouchableOpacityProps, 'activeOpacity'> & {
  onPress: () => void;
};

const PressableScale: FC<PressableScaleProps> = memo(
  ({ children, onPress, style, ...props }) => {
    const scale = useSharedValue(1);

    const tapGesture = Gesture.Tap()
      .onTouchesDown(() => {
        scale.value = withSpring(0.9, { overshootClamping: true });
      })
      .onTouchesUp(() => {
        onPress();
      })
      .onFinalize(() => {
        scale.value = withSpring(1, { overshootClamping: true });
      });

    tapGesture.maxDuration(5000);
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
