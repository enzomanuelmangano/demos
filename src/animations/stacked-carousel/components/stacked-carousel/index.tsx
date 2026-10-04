import { StyleSheet, useWindowDimensions, View } from 'react-native';

import * as Haptics from 'expo-haptics';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Paginator } from '../paginator';

import type { StyleProp, ViewStyle } from 'react-native';

type StackedCarouselProps<T = unknown> = {
  style?: StyleProp<ViewStyle>;
  data: T[];
  renderCard: (item: T, index: number) => React.ReactNode;
  cardWidth?: number;
  cardHeight?: number;
  stackOffset?: number;
  showPaginator?: boolean;
  paginatorVisibleDots?: number;
  paginatorDotSize?: number;
  paginatorSpacing?: number;
  paginatorBackground?: React.ReactNode;
};

// Styles of cards far enough from the current page that every value is
// clamped (and opacity is <= 0). Returning the same object lets Reanimated
// skip the update, so only the few cards near the current page are pushed
// on every scroll frame.
const FAR_RIGHT_CARD_STYLE = {
  transform: [{ translateY: 65 }, { scale: 0.7 }],
  opacity: 0,
};
const FAR_LEFT_CARD_STYLE = {
  transform: [{ translateY: -100 }, { scale: 1.5 }],
  opacity: 0,
};
const FAR_RIGHT_ROTATE_STYLE = {
  transform: [{ perspective: 600 }, { rotateX: '45deg' }],
};
const FAR_LEFT_ROTATE_STYLE = {
  transform: [{ perspective: 600 }, { rotateX: '0deg' }],
};

const AnimatedCard = ({
  index,
  scrollX,
  cardWidth,
  cardHeight,
  totalCards,
  children,
}: {
  index: number;
  scrollX: SharedValue<number>;
  cardWidth: number;
  cardHeight: number;
  totalCards: number;
  children: React.ReactNode;
}) => {
  const extendedInputRange = [
    (index - 2) * cardWidth,
    (index - 1) * cardWidth,
    index * cardWidth,
    (index + 1) * cardWidth,
    (index + 2) * cardWidth,
  ];

  const animatedStyle = useAnimatedStyle(() => {
    // 3+ pages ahead: opacity <= -0.4, scale/translateY clamped
    if (scrollX.get() <= (index - 3) * cardWidth) return FAR_RIGHT_CARD_STYLE;
    // 1+ page behind: opacity <= -1, scale/translateY clamped
    if (scrollX.get() >= (index + 1) * cardWidth) return FAR_LEFT_CARD_STYLE;

    // Scale animation - your organic scaling
    const scale = interpolate(
      scrollX.get(),
      extendedInputRange,
      [0.7, 0.8, 1, 1.5, 1.5],
      Extrapolation.CLAMP,
    );

    // Organic fade to the top - cards move upward and fade
    const translateY = interpolate(
      scrollX.get(),
      extendedInputRange,
      [65, 35, 0, -100, -100],
      Extrapolation.CLAMP,
    );

    // Organic fade - cards fade as they move up
    const opacity = interpolate(
      scrollX.get(),
      extendedInputRange,
      [0.2, 0.8, 1, -1, -2],
      Extrapolation.EXTEND,
    );

    return {
      transform: [{ translateY: translateY }, { scale: scale }],
      opacity,
    };
  });

  const rRotateStyle = useAnimatedStyle(() => {
    // rotateX is clamped outside [index - 2, index] pages
    if (scrollX.get() <= (index - 2) * cardWidth) return FAR_RIGHT_ROTATE_STYLE;
    if (scrollX.get() >= index * cardWidth) return FAR_LEFT_ROTATE_STYLE;

    const rotateX = interpolate(
      scrollX.get(),
      extendedInputRange,
      [45, 30, 0, 0, 0],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        { perspective: 600 },
        { rotateX: `${Math.floor(rotateX)}deg` },
      ],
    };
  });

  return (
    <Animated.View
      collapsable={false}
      style={[
        styles.cardContainer,
        {
          pointerEvents: 'none',
          width: cardWidth,
          height: cardHeight,
          zIndex: totalCards * 1000 - index,
        },
        animatedStyle,
      ]}>
      <Animated.View
        style={[
          {
            flex: 1,
          },
          rRotateStyle,
        ]}>
        <View style={styles.cardShadow} collapsable={false}>
          {children}
        </View>
      </Animated.View>
    </Animated.View>
  );
};

export const StackedCarousel = <T,>({
  style,
  data,
  renderCard,
  cardWidth = 280,
  cardHeight = 180,
  stackOffset = 8,
  showPaginator = true,
  paginatorVisibleDots = 5,
  paginatorDotSize = 10,
  paginatorSpacing = 10,
}: StackedCarouselProps<T>) => {
  const { width: screenWidth } = useWindowDimensions();

  // Shared value for scroll position
  const scrollX = useSharedValue(0);

  // Scroll handler
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      scrollX.set(event.contentOffset.x);
    },
  });

  // Calculate current page index for paginator
  const currentPageIndex = useDerivedValue(() => {
    return scrollX.get() / cardWidth;
  });

  useAnimatedReaction(
    () => Math.round(currentPageIndex.get()),
    (curr, prev) => {
      if (curr !== prev && prev !== null) {
        scheduleOnRN(Haptics.selectionAsync);
      }
    },
  );

  return (
    <View style={[styles.container, style]}>
      {/* Render animated cards */}
      {data.map((item, index) => (
        <AnimatedCard
          key={index}
          index={index}
          scrollX={scrollX}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          totalCards={data.length}>
          {renderCard(item, index)}
        </AnimatedCard>
      ))}

      {/* Invisible horizontal scroll view positioned over the cards */}
      <Animated.FlatList
        data={data}
        renderItem={() => (
          <View
            style={{
              width: cardWidth,
              height: cardHeight,
              // The magic trick
              // justifyContent: 'center',
              // alignItems: 'center',
              // backgroundColor: '#7b7bfdff',
              // borderRadius: 25,
              // borderCurve: 'continuous',
            }}
          />
        )}
        snapToInterval={cardWidth}
        horizontal
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        decelerationRate="fast"
        style={{
          position: 'absolute',
          width: screenWidth,
          height: cardHeight + stackOffset * 6,
          zIndex: 1000,
        }}
        contentContainerStyle={{
          paddingLeft: (screenWidth - cardWidth) / 2,
          paddingTop: stackOffset * 3,
        }}
      />

      {/* Paginator */}
      {showPaginator && (
        <>
          <View
            style={{
              width: screenWidth,
              position: 'absolute',
              bottom: 0,
              top: cardHeight,
            }}>
            <Paginator
              pagesAmount={data.length}
              currentPageIndex={currentPageIndex}
              visibleDots={paginatorVisibleDots}
              dotSize={paginatorDotSize}
              spacing={paginatorSpacing}
            />
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    position: 'absolute',
  },
  cardShadow: {
    backgroundColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 25,
    boxShadow: '0 0 5px 0 rgba(0, 0, 0, 0.05)',
    flex: 1,
    overflow: 'hidden',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
});
