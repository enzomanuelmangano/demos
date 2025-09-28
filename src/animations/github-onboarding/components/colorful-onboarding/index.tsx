import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import Color from 'color';
import { type FC, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  convertToRGBA,
  interpolateColor,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { OnboardingPage } from './page';
import { PaginationDots } from './pagination-dots';

type ColorListItemType = {
  title: string;
  color: string;
  image: ReturnType<typeof require>;
};

type ColorfulOnboardingProps = {
  data: ColorListItemType[];
};

export const ColorfulOnboarding: FC<ColorfulOnboardingProps> = ({ data }) => {
  const { width, height } = useWindowDimensions();

  const currentOffset = useSharedValue(0);

  const progress = useDerivedValue(() => {
    return currentOffset.value / width;
  }, [width]);

  const indexes = useMemo(() => data.map((_, i) => i), [data]);
  const colors = useMemo(() => data.map(({ color }) => color), [data]);

  const darkenColors = useMemo(() => {
    return data.map(({ color }) => {
      return Color(color).darken(0.8).hex();
    });
  }, [data]);

  const gradientColors = useDerivedValue(() => {
    const nextBaseColor = convertToRGBA(
      interpolateColor(progress.value, indexes, colors),
    );

    const nextDarkenColor = convertToRGBA(
      interpolateColor(progress.value, indexes, darkenColors),
    );

    return [nextBaseColor, nextDarkenColor];
  });

  const onScroll = useAnimatedScrollHandler({
    onScroll: ({ contentOffset: { x } }) => {
      currentOffset.value = x;
    },
  });

  const ref = useAnimatedRef();

  return (
    <>
      <Canvas style={[styles.canvas, { width, height }]}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(width / 2, 0)}
            end={vec(width / 2, height * 2)}
            colors={gradientColors}
          />
        </Rect>
      </Canvas>
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

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  flatList: {
    flex: 1,
  },
  paginationDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 100,
    zIndex: 10,
  },
});
