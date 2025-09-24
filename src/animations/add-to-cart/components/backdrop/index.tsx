import { type FC, memo } from 'react';
import { StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated';

type BackdropProps = {
  animationProgress: SharedValue<number>;
  onPress?: () => void;
};

const Backdrop: FC<BackdropProps> = memo(({ animationProgress, onPress }) => {
  const animatedProps = useAnimatedProps(() => {
    return {
      pointerEvents: animationProgress.value ? 'auto' : 'none',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.75)',
        },
        rStyle,
      ]}
    />
  );
});

export { Backdrop };
