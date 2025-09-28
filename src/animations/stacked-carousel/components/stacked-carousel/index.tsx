import { StyleSheet, useWindowDimensions, View } from 'react-native';

import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

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

const AnimatedCard = ({
  index,
  scrollX,
  screenWidth,
  cardWidth,
  cardHeight,
  totalCards,
  children,
}: {
  index: number;
  scrollX: SharedValue<number>;
  screenWidth: number;
  cardWidth: number;
  cardHeight: number;
  totalCards: number;
  children: React.ReactNode;
}) => {
  const extendedInputRange = [
    (index - 2) * screenWidth,
    (index - 1) * screenWidth,
    index * screenWidth,
    (index + 1) * screenWidth,
    (index + 2) * screenWidth,
  ];

  const animatedStyle = useAnimatedStyle(() => {
    // Scale animation - your organic scaling
    const scale = interpolate(
      scrollX.value,
      extendedInputRange,
      [0.7, 0.8, 1, 1.5, 1.5],
      Extrapolation.CLAMP,
    );

    // Organic fade to the top - cards move upward and fade
    const translateY = interpolate(
      scrollX.value,
      extendedInputRange,
      [65, 35, 0, -100, -100],
      Extrapolation.CLAMP,
    );

    // Organic fade - cards fade as they move up
    const opacity = interpolate(
      scrollX.value,
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
    const rotateX = interpolate(
      scrollX.value,
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
      scrollX.value = event.contentOffset.x;
    },
  });

  // Calculate current page index for paginator
  const currentPageIndex = useDerivedValue(() => {
    return scrollX.value / screenWidth;
  });

  return (
    <View style={[styles.container, style]}>
      {/* Render animated cards */}
      {data.map((item, index) => (
        <AnimatedCard
          key={index}
          index={index}
          scrollX={scrollX}
          screenWidth={screenWidth}
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
              width: screenWidth,
              height: cardHeight + stackOffset * 6,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          />
        )}
        horizontal
        pagingEnabled
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
    borderRadius: 16,
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
