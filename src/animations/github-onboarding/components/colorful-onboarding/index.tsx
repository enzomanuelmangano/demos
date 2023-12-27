// Importing necessary libraries and components
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import Color from 'color';
import { useMemo } from 'react';
import { useWindowDimensions, StyleSheet } from 'react-native';
import Animated, {
  convertToRGBA,
  interpolateColor,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { PaginationDots } from './pagination-dots';
import { OnboardingPage } from './page';

// Types for Color List Item
type ColorListItemType = {
  title: string;
  color: string;
  image: ReturnType<typeof require>;
};

// Props for the ColorfulOnboarding component
type ColorfulOnboardingProps = {
  data: ColorListItemType[];
};

export const ColorfulOnboarding: React.FC<ColorfulOnboardingProps> = ({
  data,
}) => {
  // Getting window dimensions
  const { width, height } = useWindowDimensions();

  // Shared value to track the current scroll offset
  const currentOffset = useSharedValue(0);

  // Calculating the scroll progress based on the window width
  const progress = useDerivedValue(() => {
    return currentOffset.value / width;
  }, [width]);

  // Creating arrays of indexes and colors from the data
  const indexes = useMemo(() => data.map((_, i) => i), [data]);
  const colors = useMemo(() => data.map(({ color }) => color), [data]);

  // Darkening the colors for gradient effect
  const darkenColors = useMemo(() => {
    return data.map(({ color }) => {
      return Color(color).darken(0.8).hex();
    });
  }, [data]);

  // Generating gradient colors for the background
  const gradientColors = useDerivedValue(() => {
    const nextBaseColor = convertToRGBA(
      interpolateColor(progress.value, indexes, colors),
    );

    const nextDarkenColor = convertToRGBA(
      interpolateColor(progress.value, indexes, darkenColors),
    );

    return [nextBaseColor, nextDarkenColor];
  });

  // Handler to update currentOffset on scroll
  const onScroll = useAnimatedScrollHandler({
    onScroll: ({ contentOffset: { x } }) => {
      currentOffset.value = x;
    },
  });

  // Reference for the Animated FlatList
  const ref = useAnimatedRef();

  return (
    <>
      {/* Canvas for drawing the background gradient */}
      <Canvas style={[styles.canvas, { width, height }]}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(width / 2, 0)}
            end={vec(width / 2, height * 2)}
            colors={gradientColors}
          />
        </Rect>
      </Canvas>
      {/* Animated FlatList to display onboarding pages */}
      <Animated.FlatList
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        ref={ref}
        data={data}
        keyExtractor={(_, index) => index.toString()}
        renderItem={({ item, index }) => (
          <OnboardingPage
            image={item.image}
            title={item.title}
            index={index}
            currentOffset={currentOffset}
            width={width}
            height={height}
          />
        )}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        horizontal
        pagingEnabled
        style={styles.flatList}
      />
      {/* Component for the pagination dots at the bottom */}
      <PaginationDots
        style={styles.paginationDots}
        progress={progress}
        count={data.length}
        onDotPress={index => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          ref.current?.scrollToOffset({
            offset: index * width,
            animated: true,
          });
        }}
      />
    </>
  );
};

// Styling for the components using StyleSheet for performance optimization
const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  flatList: {
    flex: 1,
    showsHorizontalScrollIndicator: false,
    horizontal: true,
    pagingEnabled: true,
  },
  paginationDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 100,
    zIndex: 10,
  },
});
