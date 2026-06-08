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
    // Separate key namespaces for digits and separators, each keyed by its
    // stable left-to-right ordinal: typing appends on the right, so existing
    // digits keep their identity, and a comma can never collide with a digit
    // that lands on the same string index (which made React recycle the
    // wrong element and "overwrite" digits with commas).
    let digitCount = 0;
    let commaCount = 0;
    return value
      .toLocaleString('en-US')
      .split('')
      .map(char =>
        char === ','
          ? { char, key: `comma-${commaCount++}` }
          : { char, key: `digit-${digitCount++}` },
      );
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
      {characters.map(({ char, key }) => (
        <Animated.Text
          key={key}
          layout={LinearTransition}
          entering={FadeInDown}
          exiting={FadeOutDown}
          style={styles.character}>
          {char}
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
