import { StyleSheet, View } from 'react-native';

import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

const DOT = 7;
const GAP = 7;

interface Props {
  count: number;
  scrollX: SharedValue<number>;
  pageWidth: number;
}

// iOS-style page indicator: equal round dots, the active one brightened.
// Driven by the pager's scrollX (active page = scrollX / pageWidth), so it
// tracks continuously through the swipe — not just on settle.
const Dot = ({
  index,
  scrollX,
  pageWidth,
}: {
  index: number;
  scrollX: SharedValue<number>;
  pageWidth: number;
}) => {
  const rStyle = useAnimatedStyle(() => {
    const page = scrollX.get() / pageWidth;
    const d = Math.abs(page - index);
    return {
      opacity: interpolate(d, [0, 1], [1, 0.35], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[styles.dot, rStyle]} />;
};

export const PageDots = ({ count, scrollX, pageWidth }: Props) => {
  if (count <= 1) {
    return null;
  }
  return (
    <View style={styles.row} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} index={i} scrollX={scrollX} pageWidth={pageWidth} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  dot: {
    backgroundColor: '#fff',
    borderCurve: 'continuous',
    borderRadius: DOT / 2,
    height: DOT,
    marginHorizontal: GAP / 2,
    width: DOT,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
