import React from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Card } from './card/card.component';
import { styles } from './card-carousel.styles';
import { CARD_WIDTH, CARD_DATA, CARD_HEIGHT } from './utils/constants';
import type { CardData } from './utils/types';

export const CardCarousel: React.FC = () => {
  // Shared value to track horizontal scroll position
  const scrollX = useSharedValue(0);

  /**
   * Renders individual card items in the carousel
   * @param item - Card data containing title, price, and description
   * @param index - Index of the card in the carousel
   */
  const renderCard = ({ item, index }: { item: CardData; index: number }) => (
    <Card item={item} index={index} scrollX={scrollX} />
  );

  /**
   * Animated scroll handler to update scrollX shared value
   * Used for calculating card animations based on scroll position
   */
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      scrollX.value = event.contentOffset.x;
    },
  });

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={{ height: CARD_HEIGHT * 1.2, zIndex: 101 }}>
        <Animated.FlatList
          data={CARD_DATA}
          renderItem={renderCard}
          keyExtractor={item => item.id.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH}
          decelerationRate="fast"
          contentContainerStyle={styles.flatListContent}
          onScroll={onScroll}
          scrollEventThrottle={8}
        />
      </View>
    </GestureHandlerRootView>
  );
};
