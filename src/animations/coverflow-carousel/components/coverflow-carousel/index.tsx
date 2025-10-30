import { useWindowDimensions } from 'react-native';

import { useCallback } from 'react';

import Animated, {
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
  const onScroll = useAnimatedScrollHandler({
    onScroll: ({ contentOffset: { x } }) => {
      scrollOffset.value = x;
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
    <Animated.FlatList
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
  );
};
