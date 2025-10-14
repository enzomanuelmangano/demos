import { type FC, memo } from 'react';

import Animated, {
  type SharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type DotProps = {
  index: number;
  activeDots: SharedValue<number>;
};

const Dot: FC<DotProps> = memo(({ index, activeDots }) => {
  const rStyle = useAnimatedStyle(() => {
    const isActive = activeDots.value > index;
    const opacity = withTiming(isActive ? 1 : 0.4);

    const scale = withSpring(isActive ? 1.4 : 1);
    return {
      opacity: opacity,
      transform: [{ scale }],
    };
  }, []);

  return (
    <Animated.View
      style={[
        {
          height: 8,
          aspectRatio: 1,
          marginHorizontal: 12,
          borderRadius: 4,
          backgroundColor: 'white',
          borderCurve: 'continuous',
        },
        rStyle,
      ]}
    />
  );
});

export { Dot };
export type { DotProps };
