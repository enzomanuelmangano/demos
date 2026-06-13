import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useCallback, useState } from 'react';

import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { CarouselItem } from './carousel-item';

type CoverFlowCarouselProps = {
  images: string[];
};

const ItemWidth = 160;

export const CoverFlowCarousel: React.FC<CoverFlowCarouselProps> = ({
  images,
}) => {
  const scrollOffset = useSharedValue(0);

  // e2e outcome probe: flips to "moved" once the carousel has scrolled (the
  // cover-flow transform is offset-driven, no inspectable RN state).
  const [status, setStatus] = useState<'idle' | 'moved'>('idle');

  const onScroll = useAnimatedScrollHandler({
    onScroll: ({ contentOffset: { x } }) => {
      scrollOffset.set(x);
      if (x > 1) {
        runOnJS(setStatus)('moved');
      }
    },
  });

  const { width: windowWidth } = useWindowDimensions();

  const paddingHorizontal = Math.round((windowWidth - ItemWidth) / 2);

  const renderItem = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <CarouselItem
        image={item}
        index={index}
        scrollOffset={scrollOffset}
        itemWidth={ItemWidth}
      />
    ),
    [scrollOffset],
  );

  return (
    <View>
      <Text testID="coverflow-carousel-status" style={styles.statusProbe}>
        {status}
      </Text>
      <Animated.FlatList
        testID="coverflow-carousel"
        scrollEventThrottle={16}
        horizontal
        pagingEnabled
        snapToInterval={ItemWidth}
        decelerationRate={'fast'}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal,
        }}
        renderItem={renderItem}
        data={images}
      />
    </View>
  );
};

// Near-invisible to the eye, but on-screen for the e2e accessibility tree.
const styles = StyleSheet.create({
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#808080',
    opacity: 0.012,
    zIndex: 10,
  },
});
