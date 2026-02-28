import { StyleSheet } from 'react-native';

import { type FC, memo } from 'react';

import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

type BackdropProps = {
  onTap: () => void;
  isActive: SharedValue<boolean>;
};

const Backdrop: FC<BackdropProps> = memo(({ isActive, onTap }) => {
  const rBackdropStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isActive.value ? 1 : 0),
    };
  }, []);

  const rBackdropProps = useAnimatedProps(() => {
    return {
      pointerEvents: isActive.value ? 'auto' : 'none',
    } as any;
  }, []);
  return (
    <Animated.View
      onTouchStart={onTap}
      animatedProps={rBackdropProps}
      style={[
        {
          ...StyleSheet.absoluteFill,
          backgroundColor: 'rgba(0,0,0,0.2)',
        },
        rBackdropStyle,
      ]}
    />
  );
});

export { Backdrop };
