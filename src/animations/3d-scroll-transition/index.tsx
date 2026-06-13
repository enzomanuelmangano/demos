import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { memo, useCallback, useMemo, useState } from 'react';

import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BlurredListItem } from './components/blurred-list-item';

const NUMBERS_ARRAY = new Array(100)
  .fill(0)
  .map((_, i) => i.toString())
  .reverse();

export const ScrollTransition3D = memo(() => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const scrollY = useSharedValue(0);
  // This is tremendously more efficient than using the default onScroll prop
  // Combining the useAnimatedScrollHandler with the Animated.FlatList's onScroll prop
  // is one of the most useful and efficient ways to handle scroll events 💥
  // Because everything happens on the native thread
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      'worklet';
      scrollY.set(event.contentOffset.y);
    },
  });

  // e2e outcome probe: the 3D transition is keyed off scrollY (a worklet value
  // with no inspectable RN state), so we bridge a CHANGED flag to prove the
  // paged swipes actually scrolled the list. Near-invisible (alpha ~0.01).
  const [status, setStatus] = useState<'idle' | 'moved'>('idle');
  useAnimatedReaction(
    () => scrollY.get(),
    (current, previous) => {
      if (previous != null && Math.abs(current - previous) > 1) {
        scheduleOnRN(setStatus, 'moved');
      }
    },
    [],
  );

  const itemSize = windowWidth * 0.55;

  const contentContainerStyle = useMemo(() => {
    return {
      paddingVertical: windowHeight / 2 - itemSize / 2,
    };
  }, [itemSize, windowHeight]);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: itemSize,
      offset: itemSize * index,
      index,
    }),
    [itemSize],
  );

  return (
    <View style={styles.container}>
      <Text testID="scroll-transition-3d-status" style={styles.statusProbe}>
        {status}
      </Text>
      <Animated.FlatList
        testID="scroll-transition-3d-list"
        inverted
        contentContainerStyle={contentContainerStyle}
        onScroll={onScroll}
        data={NUMBERS_ARRAY}
        getItemLayout={getItemLayout}
        // Without this prop, the list will be a bit janky (that's the secret ingredient! 🤫)
        windowSize={2}
        snapToInterval={itemSize}
        decelerationRate={'fast'}
        renderItem={({ item, index }) => (
          <BlurredListItem
            text={item}
            size={itemSize}
            index={index}
            scrollY={scrollY}
          />
        )}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#000',
    flex: 1,
    justifyContent: 'center',
  },
  statusProbe: {
    color: '#FFF',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 10,
  },
});
