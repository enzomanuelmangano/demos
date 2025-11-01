import { StyleSheet, View } from 'react-native';

import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { CARD_HEIGHT, CARD_WIDTH, Card } from './card';

import type { CardData } from './card';

const CARDS: CardData[] = [
  { color: '#F1EEE0' }, // Soft beige
  { color: '#F3D9BC' }, // Light peach
  { color: '#F4ACB7' }, // Pale pink
  { color: '#F6DFEB' }, // Soft lavender
  { color: '#E2F0CB' }, // Light green
  { color: '#C7E3D4' }, // Mint green
  { color: '#AFCBFF' }, // Soft blue
  { color: '#E3DFFF' }, // Lavender blue
  { color: '#FFE5E0' }, // Light coral
  { color: '#FFD1DC' }, // Baby pink
];

const VerticalListPadding = 25;

export const IMessageStack = () => {
  const scrollOffset = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      scrollOffset.value = event.contentOffset.x;
    },
  });

  return (
    <View style={styles.container}>
      <View
        style={{
          marginBottom: CARD_HEIGHT,
        }}>
        {/*
         * The beauty of this approach is that we're not coordinating custom gesture detectors.
         * Instead we're using just one ScrollView with paging enabled for the gesture handling.
         * The actual cards are rendered separately and animated based on the scroll offset.
         */}
        <Animated.FlatList
          horizontal
          snapToInterval={CARD_WIDTH}
          disableIntervalMomentum
          onScroll={onScroll}
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          style={styles.scrollView}
          data={CARDS}
          inverted
          contentContainerStyle={styles.scrollViewContentContainer}
          renderItem={() => {
            return (
              <View
                style={{
                  height: CARD_HEIGHT,
                  width: CARD_WIDTH,
                  // IMPORTANT: These invisible views create the scrollable area
                  // backgroundColor: '#7b7bfdff',
                  // borderRadius: 25,
                  // borderCurve: 'continuous',
                }}
              />
            );
          }}
        />
        {/* Cards layer - absolutely positioned on top of ScrollView */}
        <Animated.View
          style={{
            position: 'absolute',
            top: VerticalListPadding,
            bottom: VerticalListPadding,
            left: 0,
            right: 0,
            pointerEvents: 'none',
          }}>
          {CARDS.map((item, i) => {
            return (
              <Card
                scrollOffset={scrollOffset}
                index={CARDS.length - 1 - i}
                color={item.color}
                key={i}
              />
            );
          })}
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    flex: 1,
    justifyContent: 'center',
  },
  scrollView: {
    maxHeight: CARD_HEIGHT + VerticalListPadding * 2,
    position: 'absolute',
  },
  scrollViewContentContainer: {
    alignItems: 'center',
    height: CARD_HEIGHT + VerticalListPadding * 2,
    justifyContent: 'center',
    paddingHorizontal: CARD_WIDTH,
  },
});
