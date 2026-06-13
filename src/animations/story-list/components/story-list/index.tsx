import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { type ReactNode, useMemo, useState } from 'react';

import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { StoryListItem } from './story-item';

type StoryListProps<T> = {
  stories: T[];
  storyItemDimensions: {
    width: number;
    height: number;
  };
  renderItem: (story: T, index: number) => ReactNode;
};

function StoryList<T>({
  stories,
  storyItemDimensions,
  renderItem,
}: StoryListProps<T>) {
  const scrollOffset = useSharedValue(0);
  const { width: windowWidth } = useWindowDimensions();

  // e2e outcome probe: flips to "paged" once the carousel is scrolled away from
  // the first story, exposed as an assertable token so a test can verify the
  // swipe actually paged the carousel. Visually negligible (alpha ~0.01).
  const [pageState, setPageState] = useState<'idle' | 'paged'>('idle');
  useAnimatedReaction(
    () => scrollOffset.get() > 1,
    hasPaged => {
      if (hasPaged) {
        scheduleOnRN(setPageState, 'paged');
      }
    },
  );

  // Match GitHub formula exactly: paddingLeft = (WindowWidth - StoryListItemWidth) / 4
  const paddingLeft = useMemo(() => {
    return (windowWidth - storyItemDimensions.width) / 4;
  }, [windowWidth, storyItemDimensions.width]);

  // Match GitHub formula exactly: ListPadding = WindowWidth - StoryListItemWidth
  const listPadding = useMemo(() => {
    return windowWidth - storyItemDimensions.width;
  }, [windowWidth, storyItemDimensions.width]);

  // Match GitHub formula exactly: StoryListItemWidth * Stories.length + ListPadding
  const contentWidth = useMemo(() => {
    return storyItemDimensions.width * stories.length + listPadding;
  }, [storyItemDimensions.width, stories.length, listPadding]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      scrollOffset.set(event.contentOffset.x);
    },
  });

  return (
    <>
      <Text testID="story-list-status" style={styles.statusProbe}>
        {pageState}
      </Text>
      {/*
       * The beauty of this approach is that we're not coordinating custom gesture detectors.
       * Instead we're using just one ScrollView for the gesture handling.
       * The actual story items are rendered separately and animated based on the scroll offset.
       */}
      <Animated.ScrollView
        testID="story-list"
        horizontal
        snapToInterval={storyItemDimensions.width}
        decelerationRate="fast"
        disableIntervalMomentum
        onScroll={onScroll}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        bounces
        contentContainerStyle={{
          width: contentWidth,
          paddingLeft: paddingLeft,
        }}>
        {/* Invisible placeholder views that define the scrollable area */}
        {stories.map((_, index) => (
          <View
            key={index}
            style={{
              width: storyItemDimensions.width,
              height: storyItemDimensions.height,
              // The magic trick
              // backgroundColor: '#7b7bfdff',
              // borderRadius: 25,
              // borderCurve: 'continuous',
            }}
          />
        ))}
      </Animated.ScrollView>
      {/* Visual layer - absolutely positioned on top of ScrollView */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          pointerEvents: 'none',
        }}>
        {stories.map((story, index) => (
          <StoryListItem
            key={index}
            story={story}
            index={index}
            scrollOffset={scrollOffset}
            itemWidth={storyItemDimensions.width}
            itemHeight={storyItemDimensions.height}
            paddingLeft={paddingLeft}
            renderItem={renderItem}
          />
        ))}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  statusProbe: {
    color: '#2D3045',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 1000,
  },
});

export { StoryList };
