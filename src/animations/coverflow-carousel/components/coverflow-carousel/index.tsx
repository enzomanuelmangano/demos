import Animated, {
  useAnimatedRef,
  useScrollViewOffset,
} from 'react-native-reanimated';
import { useWindowDimensions } from 'react-native';
import { useCallback } from 'react';

import { CarouselItem } from './carousel-item';

type CoverFlowCarouselProps = {
  images: string[];
};

const ItemWidth = 160;

export const CoverFlowCarousel: React.FC<CoverFlowCarouselProps> = ({
  images,
}) => {
  const animatedRef = useAnimatedRef<any>();
  const scrollOffset = useScrollViewOffset(animatedRef);

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
      ref={animatedRef}
      horizontal
      pagingEnabled
      snapToInterval={ItemWidth}
      decelerationRate={'fast'}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        alignItems: 'center',
        paddingHorizontal,
      }}
      renderItem={renderItem}
      data={images}
    />
  );
};
