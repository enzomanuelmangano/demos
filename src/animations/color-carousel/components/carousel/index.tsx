import React from 'react';
import Animated, {
  SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { CarouselItem } from './carousel-item';

type BaseCarouselItemType = {
  mainColor: string;
};

type CarouselProps<T extends BaseCarouselItemType = BaseCarouselItemType> = {
  items: (T | null)[];
  maxRenderedItems: number;
  width: number;
  activeIndex: SharedValue<number>;
};

// Define a constant that holds the aspect ratio of each item in the list
// Feel free to update it to match your needs (or pass it as a props)
const LIST_ITEM_ASPECT_RATIO = 3 / 4;

// Define the Carousel component with the given props
const Carousel: React.FC<CarouselProps> = React.memo(
  ({ items, maxRenderedItems, width, activeIndex }) => {
    // Calculate the width and height of each list item based on the given width and aspect ratio
    const LIST_ITEM_WIDTH = width / maxRenderedItems;
    const LIST_ITEM_HEIGHT = LIST_ITEM_WIDTH / LIST_ITEM_ASPECT_RATIO;

    // Create a shared animated value to track the current position of the list
    const translateX = useSharedValue(0);

    // Create a scroll handler to update the shared value when the user scrolls the list
    // This hook is super useful! It allows us to update the shared value without
    // having to use a state and re-render the component.
    // In the past I've made few videos about it on my YouTube channel
    // https://youtu.be/OT-73hpwxXQ
    const onScroll = useAnimatedScrollHandler({
      onScroll: ({ contentOffset: { x } }) => {
        translateX.value = -x;
      },
    });

    // Render the carousel using the Animated ScrollView and the CarouselItem component
    return (
      <Animated.View style={{ flex: 1 }}>
        {/* 
            I've used a ScrollView since there's an issue with the zIndex while using FlatList. 
            ScrollDown to give a try with it, to check out the differences.
        */}
        <Animated.ScrollView
          horizontal
          pagingEnabled
          contentContainerStyle={{
            alignItems: 'center',
          }}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          decelerationRate={0.8}
          snapToOffsets={items.map((_, index) => index * LIST_ITEM_WIDTH)}>
          {items.map((item, index) => {
            return (
              <CarouselItem
                key={index}
                item={item}
                index={index}
                translateX={translateX}
                itemWidth={LIST_ITEM_WIDTH}
                itemHeight={LIST_ITEM_HEIGHT}
                carouselWidth={width}
                maxRenderedItems={maxRenderedItems}
                activeIndex={activeIndex}
              />
            );
          })}
        </Animated.ScrollView>
      </Animated.View>
    );
  },
);

// Unfortunately, there's an issue with the zIndex while using FlatList.
// Feel free to suggest a solution in the comment. I'll be happy to update the code!
// eslint-disable-next-line no-lone-blocks
{
  /* <Animated.FlatList
  horizontal
  pagingEnabled
  contentContainerStyle={{
    alignItems: 'center',
  }}
  showsHorizontalScrollIndicator={false}
  onScroll={onScroll}
  scrollEventThrottle={16}
  snapToOffsets={items.map((_, index) => index * LIST_ITEM_WIDTH)}
  data={items}
  keyExtractor={(_, index) => index.toString()}
  renderItem={({ item, index }) => {
    return (
      <CarouselItem
        key={index}
        item={item}
        index={index}
        translateX={translateX}
        itemWidth={LIST_ITEM_WIDTH}
        itemHeight={LIST_ITEM_HEIGHT}
        carouselWidth={width}
        maxRenderedItems={maxRenderedItems}
        activeIndex={activeIndex}
      />
    );
  }}
/>; */
}

// Export the Carousel component
export { Carousel };
