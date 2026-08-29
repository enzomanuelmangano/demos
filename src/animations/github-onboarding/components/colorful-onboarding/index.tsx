import { StyleSheet, Text, useWindowDimensions } from 'react-native';

import { type FC, useMemo, useState } from 'react';

import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import Color from 'color';
import Animated, {
  convertToRGBA,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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
    return currentOffset.get() / width;
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
      interpolateColor(progress.get(), indexes, colors),
    );

    const nextDarkenColor = convertToRGBA(
      interpolateColor(progress.get(), indexes, darkenColors),
    );

    return [nextBaseColor, nextDarkenColor];
  });

  const onScroll = useAnimatedScrollHandler({
    onScroll: ({ contentOffset: { x } }) => {
      currentOffset.set(x);
    },
  });

  // e2e outcome probe: bridge the scroll offset (a worklet value) to JS as the
  // settled page index so a test can assert which onboarding page is showing.
  const [pageIndex, setPageIndex] = useState(0);
  useAnimatedReaction(
    () => Math.round(currentOffset.get() / width),
    (next, prev) => {
      if (next !== prev) {
        scheduleOnRN(setPageIndex, next);
      }
    },
    [width],
  );

  const ref = useAnimatedRef();

  return (
    <>
      <Text testID="github-onboarding-status" style={styles.statusProbe}>
        {`page-${pageIndex}`}
      </Text>
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
        testID="github-onboarding-carousel"
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
    left: 0,
    position: 'absolute',
    top: 0,
  },
  flatList: {
    flex: 1,
  },
  paginationDots: {
    bottom: 100,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  statusProbe: {
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 999,
  },
});
