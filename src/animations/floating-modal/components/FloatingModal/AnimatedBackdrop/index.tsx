import { StyleSheet } from 'react-native';

import { type FC, memo } from 'react';

import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

type AnimatedBackdropProps = {
  onBackdropPress?: () => void;
  isVisible: SharedValue<boolean>;
};

const AnimatedBackdrop: FC<AnimatedBackdropProps> = memo(
  ({ onBackdropPress, isVisible }) => {
    const rAnimatedStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isVisible.value ? 1 : 0),
      };
    }, [isVisible]);

    const rAnimatedProps = useAnimatedProps(() => {
      return {
        // That's a super useful trick to avoid
        // the user to interact with the backdrop (if it's not visible)

        // Note: I'm going to release a YouTube video
        //       with the same trick (for the BottomSheet) :)
        pointerEvents: isVisible.value ? 'auto' : 'none',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    }, [isVisible]);

    return (
      <Animated.View
        animatedProps={rAnimatedProps}
        onTouchStart={onBackdropPress}
        style={[
          {
            ...StyleSheet.absoluteFill,
            backgroundColor: 'rgba(0,0,0,0.4)',
          },
          rAnimatedStyle,
        ]}
      />
    );
  },
);

export { AnimatedBackdrop };
