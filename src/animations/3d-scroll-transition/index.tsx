import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { memo, useCallback, useMemo } from 'react';

import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

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
      scrollY.value = event.contentOffset.y;
    },
  });

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
      <Animated.FlatList
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
});
