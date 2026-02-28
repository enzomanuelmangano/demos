import { StyleSheet } from 'react-native';

import { type FC, memo } from 'react';

import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }, []);

  return (
    <Animated.View
      onTouchStart={onTap}
      animatedProps={rBackdropProps}
      style={[
        {
          ...StyleSheet.absoluteFill,
          backgroundColor: 'rgba(255,255,255,0.05)',
        },
        rBackdropStyle,
      ]}
    />
  );
});

export { Backdrop };
