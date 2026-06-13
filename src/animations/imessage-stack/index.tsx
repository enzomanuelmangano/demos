import { StyleSheet, Text, View } from 'react-native';

import { useState } from 'react';

import Animated, {
  runOnJS,
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

  // e2e outcome probe: flips to "moved" once the stack has actually scrolled
  // (cards are offset-driven with no inspectable RN state). Near-invisible.
  const [status, setStatus] = useState<'idle' | 'moved'>('idle');

  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      scrollOffset.set(event.contentOffset.x);
      if (Math.abs(event.contentOffset.x) > 1) {
        runOnJS(setStatus)('moved');
      }
    },
  });

  return (
    <View style={styles.container}>
      <Text testID="imessage-stack-status" style={styles.statusProbe}>
        {status}
      </Text>
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
          testID="imessage-stack"
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
  // Near-invisible to the eye, but on-screen for the e2e accessibility tree.
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#FFFFFF',
    opacity: 0.012,
    zIndex: 10,
  },
});
