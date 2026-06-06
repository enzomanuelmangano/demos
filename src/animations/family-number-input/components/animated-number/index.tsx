import { StyleSheet } from 'react-native';

import { type FC, useMemo } from 'react';

import Animated, {
  FadeInDown,
  FadeOutDown,
  LinearTransition,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

type AnimatedNumberProps = {
  value: number;
};

// Row of digits driven entirely by Reanimated layout transitions: each digit
// (and thousands separator) is its own Animated.Text that fades in from
// below, fades out downwards, and slides into place via LinearTransition,
// while the whole row scales down as the number grows. The previous
// implementation hand-computed absolute `left` offsets per digit inside an
// animated style wrapped in nested layout transitions — reanimated 4.3 left
// the digits stranded mid-flight.
export const AnimatedNumber: FC<AnimatedNumberProps> = ({ value }) => {
  const characters = useMemo(() => {
    return value.toLocaleString('en-US').split('');
  }, [value]);

  const rContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withTiming(Math.max(1.05 - 0.05 * characters.length, 0.45)),
        },
      ],
    };
  }, [characters.length]);

  return (
    <Animated.View
      layout={LinearTransition}
      style={[styles.row, rContainerStyle]}>
      {characters.map((character, index) => (
        <Animated.Text
          key={character + index}
          layout={LinearTransition}
          entering={FadeInDown}
          exiting={FadeOutDown}
          style={styles.character}>
          {character}
        </Animated.Text>
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  character: {
    color: 'white',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 90,
    fontWeight: 'bold',
    marginHorizontal: 2,
  },
  row: {
    flexDirection: 'row',
  },
});
