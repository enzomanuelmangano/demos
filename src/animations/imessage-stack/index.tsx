import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
} from 'react-native-reanimated';

import { CARD_HEIGHT, CARD_WIDTH, Card } from './card';

const CARDS = [
  {
    color: '#F1EEE0', // Soft beige
  },
  {
    color: '#F3D9BC', // Light peach
  },
  {
    color: '#F4ACB7', // Pale pink
  },
  {
    color: '#F6DFEB', // Soft lavender
  },
  {
    color: '#E2F0CB', // Light green
  },
  {
    color: '#C7E3D4', // Mint green
  },
  {
    color: '#AFCBFF', // Soft blue
  },
  {
    color: '#E3DFFF', // Lavender blue
  },
  {
    color: '#FFE5E0', // Light coral
  },
  {
    color: '#FFD1DC', // Baby pink
  },
];

const VerticalListPadding = 25;

export const IMessageStack = () => {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollViewOffset(scrollRef);

  const rListViewStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: scrollOffset.value,
        },
      ],
    };
  }, []);

  return (
    <View style={styles.container}>
      <View
        style={{
          marginBottom: CARD_HEIGHT,
        }}>
        {/*
         * The beauty of this approach is that we're not coordinating custom gesture detectors.
         * Instead we're using just one ScrollView with paging enabled.
         * This way we can leverage infinite potential cards with a single ScrollView.
         */}
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          snapToInterval={CARD_WIDTH}
          disableIntervalMomentum
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          style={{
            maxHeight: CARD_HEIGHT + VerticalListPadding * 2,
            position: 'absolute',
          }}
          contentContainerStyle={{
            justifyContent: 'center',
            alignItems: 'center',
            height: CARD_HEIGHT + VerticalListPadding * 2,
            paddingHorizontal: CARD_WIDTH,
          }}>
          {CARDS.map((_, i) => {
            return (
              <View
                key={i}
                style={{
                  height: CARD_HEIGHT,
                  width: CARD_WIDTH,
                  // IMPORTANT: This is the key to the magic 🪄
                  // backgroundColor: 'red',
                  // borderColor: 'white',
                  // borderWidth: 1,
                }}
              />
            );
          })}
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: VerticalListPadding,
                bottom: VerticalListPadding,
                left: 0,
                right: 0,
              },
              rListViewStyle,
            ]}>
            {CARDS.map((item, i) => {
              return (
                <Card
                  scrollOffset={scrollOffset}
                  index={i}
                  color={item.color}
                  key={i}
                />
              );
            })}
          </Animated.View>
        </Animated.ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
});
