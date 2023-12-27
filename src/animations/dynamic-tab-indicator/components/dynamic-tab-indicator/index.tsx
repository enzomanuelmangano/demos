import React from 'react';
import type { LayoutRectangle } from 'react-native';
import { Image, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { SectionTabs } from './section-tabs';

type DynamicTabIndicatorProps = {
  data: {
    image: ReturnType<typeof require>;
    title: string;
  }[];
};

const INDICATOR_CONTAINER_HEIGHT = 120;

const DynamicTabIndicator: React.FC<DynamicTabIndicatorProps> = React.memo(
  ({ data }) => {
    const indicatorLayout = useSharedValue<LayoutRectangle>({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    // The layouts value is an array of LayoutRectangle.
    // Each LayoutRectangle is the layout of each section title.
    // At the beginning is just an empty array, but when
    // the onLayout event is triggered for each section title
    // we will update the layouts value. (check section-tabs.tsx)
    const layouts = useSharedValue<LayoutRectangle[]>([]);
    const { width, height } = useWindowDimensions();
    const scrollRef = React.useRef<Animated.ScrollView>(null);

    // This is the heart of the project.
    // We are using the onScroll event to update the indicatorLayout value.
    const scrollHandler = useAnimatedScrollHandler({
      onScroll: event => {
        // The easiest way to evaluate the indicatorLayout value
        // is to use the interpolate function.
        // Basically with the interpolate function we
        // can have map an input range to an output range.

        // For example, if we have an input range of [0, 1, 2, 3]
        // and an output range of [0, 100, 200, 300]
        // That means that if the input value is 0, the output value will be 0.
        // If the input value is 1, the output value will be 100.
        // If the input value is 2, the output value will be 200.
        // If the input value is 3, the output value will be 300.

        // By scrolling the ScrollView, we want to update the x and the width
        // of the indicatorLayout value.
        // The inputRange will be the x position of each section.
        // We can reuse the same inputRange for the x and the width.
        const inputRange = data.map((_, index) => {
          return index * width; // [0, width, 2*width, 3*width, ...]
        });

        // THe outputRange will be the x position + the starting x of each section.
        const xOutputRange = data.map((_, index) => {
          return (layouts.value[index]?.x ?? 0) + (index * width) / data.length;
        });

        // The outputRange will be the width of each section title.
        const widthOutputRange = data.map((_, index) => {
          return layouts.value[index]?.width ?? 0;
        });

        indicatorLayout.value = {
          ...indicatorLayout.value,
          x: interpolate(
            event.contentOffset.x,
            inputRange,
            xOutputRange,
            Extrapolate.CLAMP,
          ),
          width: interpolate(
            event.contentOffset.x,
            inputRange,
            widthOutputRange,
            Extrapolate.CLAMP,
          ),
        };
      },
    });

    return (
      <>
        {/* This component is responsible for displaying the texts and retrieve their LayoutRectangle */}
        <SectionTabs
          height={INDICATOR_CONTAINER_HEIGHT}
          width={width}
          indicatorLayout={indicatorLayout}
          layouts={layouts}
          data={data.map(item => item.title)}
          onSelectSection={index => {
            // When the user taps on a section title,
            // we want to scroll to the corresponding section.
            scrollRef.current?.scrollTo({
              x: index * width,
            });
            return;
          }}
        />
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          onScroll={scrollHandler}
          // The scrollEventThrottle is the key to make the ScrollView smooth.
          // The ScrollView will only trigger the onScroll event every 16ms.
          // Why 16ms? Because the refresh rate of the screen is 60 fps. 1000ms / 60fps = 16.666ms
          scrollEventThrottle={16}>
          {data.map((item, index) => (
            <Image
              key={index}
              source={item.image}
              style={{
                width,
                height,
              }}
            />
          ))}
        </Animated.ScrollView>
      </>
    );
  },
);

export { DynamicTabIndicator };
