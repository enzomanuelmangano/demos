import { Image, useWindowDimensions } from 'react-native';

import { type FC, memo, useCallback, useMemo, useRef, useState } from 'react';

import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { SectionTabs } from './section-tabs';

import type { LayoutRectangle } from 'react-native';

type DynamicTabIndicatorProps = {
  data: {
    image: ReturnType<typeof require>;
    title: string;
  }[];
};

const INDICATOR_CONTAINER_HEIGHT = 120;

const DynamicTabIndicator: FC<DynamicTabIndicatorProps> = memo(({ data }) => {
  const { width, height } = useWindowDimensions();

  const [layouts, setLayouts] = useState<LayoutRectangle[]>([]);

  const indicatorLayout = useSharedValue<LayoutRectangle>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const scrollRef = useRef<Animated.ScrollView>(null);

  const interpolationRanges = useMemo(() => {
    const inputRange = data.map((_, index) => index * width);

    const xOutputRange = data.map((_, index) => {
      const layout = layouts[index];
      return (layout?.x ?? 0) + (index * width) / data.length;
    });

    const widthOutputRange = data.map((_, index) => {
      const layout = layouts[index];
      return layout?.width ?? 0;
    });

    return { inputRange, xOutputRange, widthOutputRange };
  }, [data, width, layouts]);

  const updateLayout = useCallback((index: number, layout: LayoutRectangle) => {
    setLayouts(prevLayouts => {
      const newLayouts = [...prevLayouts];
      newLayouts[index] = layout;
      return newLayouts;
    });
  }, []);

  const updateInitialIndicator = useCallback(
    (layout: LayoutRectangle) => {
      indicatorLayout.value = layout;
    },
    [indicatorLayout],
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      const { inputRange, xOutputRange, widthOutputRange } =
        interpolationRanges;

      if (inputRange.length > 0 && xOutputRange.length > 0) {
        const contentOffsetX = event.contentOffset.x;

        indicatorLayout.value = {
          ...indicatorLayout.value,
          x: interpolate(
            contentOffsetX,
            inputRange,
            xOutputRange,
            Extrapolation.CLAMP,
          ),
          width: interpolate(
            contentOffsetX,
            inputRange,
            widthOutputRange,
            Extrapolation.CLAMP,
          ),
        };
      }
    },
  });

  const sectionTitles = useMemo(() => data.map(item => item.title), [data]);

  const handleSelectSection = useCallback(
    (index: number) => {
      scrollRef.current?.scrollTo({
        x: index * width,
        animated: true,
      });
    },
    [width],
  );

  return (
    <>
      <SectionTabs
        height={INDICATOR_CONTAINER_HEIGHT}
        width={width}
        indicatorLayout={indicatorLayout}
        data={sectionTitles}
        onSelectSection={handleSelectSection}
        onLayoutChange={updateLayout}
        onInitialLayout={updateInitialIndicator}
      />
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        removeClippedSubviews={true}>
        {data.map((item, index) => (
          <Image
            key={`${index}-${item.title}`}
            source={item.image}
            style={{
              width,
              height,
            }}
            resizeMode="cover"
          />
        ))}
      </Animated.ScrollView>
    </>
  );
});

export { DynamicTabIndicator };
