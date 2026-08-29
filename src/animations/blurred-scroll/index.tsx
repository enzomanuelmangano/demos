import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useState } from 'react';

import Animated, {
  FadeIn,
  LinearTransition,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BlurredItem } from './components/BlurredItem';

const App = () => {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const contentOffsetY = useSharedValue(0);

  // e2e outcome probe: flips to "scrolled" once the list has scrolled past a
  // threshold, so a test can assert the scroll actually moved the content.
  const [scrollState, setScrollState] = useState<'initial' | 'scrolled'>(
    'initial',
  );
  useAnimatedReaction(
    () => contentOffsetY.get() > 80,
    (crossed, prev) => {
      if (crossed && crossed !== prev) {
        scheduleOnRN(setScrollState, 'scrolled');
      }
    },
  );

  const blurredItemContainerHeight = windowHeight * 0.45;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      contentOffsetY.set(event.contentOffset.y);
    },
  });

  return (
    <View style={styles.container}>
      <Text testID="blurred-scroll-status" style={styles.statusProbe}>
        {scrollState}
      </Text>
      <Animated.FlatList
        testID="blurred-scroll-list"
        layout={LinearTransition}
        entering={FadeIn}
        onScroll={scrollHandler}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: windowHeight / 2 - blurredItemContainerHeight / 2,
          paddingBottom: windowHeight / 2 - blurredItemContainerHeight / 2,
        }}
        scrollEventThrottle={16}
        data={new Array(10).fill(0).map((_, index) => index)}
        getItemLayout={(_, index) => {
          return {
            length: windowHeight,
            offset: blurredItemContainerHeight * index,
            index,
          };
        }}
        renderItem={({ index }) => (
          <BlurredItem
            width={windowWidth}
            height={blurredItemContainerHeight}
            index={index}
            contentOffsetY={contentOffsetY}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'black',
    flex: 1,
  },
  statusProbe: {
    color: '#fff',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 999,
  },
});

export { App as BlurredScroll };
