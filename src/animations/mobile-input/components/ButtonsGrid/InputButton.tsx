import { type FC, memo, type ReactNode } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { StyleProp, ViewStyle } from 'react-native';

type InputButtonProps = {
  style?: StyleProp<ViewStyle>;
  onTap?: () => void;
  children?: ReactNode;
};

const InputButton: FC<InputButtonProps> = memo(({ children, style, onTap }) => {
  const progress = useSharedValue(0);

  const tapGesture = Gesture.Tap()
    .onTouchesDown(() => {
      progress.value = withTiming(1);
    })
    .onTouchesUp(() => {
      if (onTap) scheduleOnRN(onTap);
    })
    .onFinalize(() => {
      progress.value = withTiming(0);
    })
    .maxDuration(10000);

  const rStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 1], [0, 0.1]).toFixed(2);
    const scale = interpolate(progress.value, [0, 1], [1, 0.9]);

    return {
      backgroundColor: `rgba(255,255,255,${opacity})`,
      transform: [{ scale }],
    };
  }, []);

  return (
    <GestureDetector gesture={tapGesture}>
      <Animated.View style={[style, { borderRadius: 20 }, rStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
});

export { InputButton };
