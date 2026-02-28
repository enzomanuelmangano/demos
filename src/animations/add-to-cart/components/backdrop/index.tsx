import { StyleSheet } from 'react-native';

import { type FC, memo } from 'react';

import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

type BackdropProps = {
  animationProgress: SharedValue<number>;
  onPress?: () => void;
};

const Backdrop: FC<BackdropProps> = memo(({ animationProgress, onPress }) => {
  const animatedProps = useAnimatedProps(() => {
    return {
      pointerEvents: animationProgress.value ? 'auto' : 'none',
    } as any;
  }, []);

  const rStyle = useAnimatedStyle(() => {
    return {
      opacity: animationProgress.value,
    };
  }, []);

  return (
    <Animated.View
      onTouchEnd={onPress}
      animatedProps={animatedProps}
      style={[
        {
          ...StyleSheet.absoluteFill,
          backgroundColor: 'rgba(0,0,0,0.75)',
        },
        rStyle,
      ]}
    />
  );
});

export { Backdrop };
