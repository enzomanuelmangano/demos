import React, {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { BottomSheet } from './BottomSheet';

// Define the props for the ScrollableBottomSheet component
type BottomSheetProps = {
  pages: { height: number; component: React.ReactNode }[];
};

// Define the ref type for ScrollableBottomSheet
export type ScrollableBottomSheetRef = {
  scrollToY: (destination: number) => void;
  scrollToX: (destination: number) => void;
  isActive: () => boolean;
  close: () => void;
};

// Create the ScrollableBottomSheet component
const ScrollableBottomSheet = React.forwardRef<
  ScrollableBottomSheetRef,
  BottomSheetProps
>(({ pages }, ref) => {
  // Ideally: translateY, active, scrollToY should be defined in BottomSheet.tsx and used here with a ref.
  // The point is these values aren't semantically related to the ScrollableBottomSheet component.
  // They are related to the BottomSheet component instead.
  // In fact if you have followed the following YouTube tutorials:
  // 1. Building a BottomSheet from scratch in React Native: https://youtu.be/KvRqsRwpwhY?si=_O7K7xTu5afL7pSf
  // 2. Creating a BottomSheet Backdrop in React Native: https://youtu.be/hfsBArfvK74?si=QDPaOn57PnclR-Vu
  // You will see that the translateY, active, scrollToY values are defined in BottomSheet.tsx.

  // So why are they defined here?
  // The initial idea was to define them in BottomSheet.tsx and use them here with a ref.
  // But the main problem with this approach is that the function scrollTo won't be a worklet anymore.
  // If you look closely the scrollHandler, you will see that it uses the scrollToY function.
  // By handling the scrollToY function in a ref, the code will be: ref.current?.scrollToY(-interpolatedHeight);
  // And it won't be executed on the UI thread anymore.
  // I've opened a discussion about this issue here:
  // https://github.com/software-mansion/react-native-reanimated/discussions/5199 😅

  // Create a shared value for translateY animation
  const translateY = useSharedValue(pages?.[0]?.height ?? 0);

  // Create a shared value to track the active state
  const active = useSharedValue(false);

  // Create a ref for the ScrollView
  const scrollViewRef = useRef<Animated.ScrollView>(null);

  // Function to scroll to a specific X position
  const scrollToX = useCallback((destination: number, delay = 0) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: destination });
    }, delay);
  }, []);

  // Function to scroll to a specific Y position
  const scrollToY = useCallback((destination: number) => {
    'worklet';
    active.value = destination !== 0;

    if (destination === 0) {
      runOnJS(scrollToX)(0, 500);
    }
    translateY.value = withSpring(destination, {
      damping: 25,
      stiffness: 180,
      mass: 0.9,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Function to close the bottom sheet
  const close = useCallback(() => {
    'worklet';
    return scrollToY(0);
  }, [scrollToY]);

  // Expose functions and values through useImperativeHandle
  useImperativeHandle(
    ref,
    () => ({
      scrollToY,
      close,
      scrollToX: (destination: number) => {
        return scrollViewRef.current?.scrollTo({ x: destination });
      },
      isActive: () => {
        return active.value;
      },
    }),
    [scrollToY, close, active.value],
  );

  // Get the window width
  const { width: windowWidth } = useWindowDimensions();

  // Extract page heights from the props
  const pagesHeight = useMemo(() => {
    return pages.map(item => item.height);
  }, [pages]);

  // Extract page components from the props
  const pagesComponent = useMemo(() => {
    return pages.map(item => item.component);
  }, [pages]);

  // Create an animated scroll handler 🙌
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      if (!active.value) return;

      // Interpolate the scroll position to update translateY
      const interpolatedHeight = interpolate(
        event.contentOffset.x,
        pages.map((_, index) => index * windowWidth),
        pagesHeight,
        Extrapolate.CLAMP,
      );

      // Update the translateY value of the bottom sheet
      scrollToY(-interpolatedHeight);
    },
  });

  // Render the ScrollableBottomSheet component
  return (
    <BottomSheet translateY={translateY} active={active} scrollTo={scrollToY}>
      <Animated.ScrollView
        ref={scrollViewRef}
        scrollEventThrottle={16} // 60fps 🤘
        onScroll={scrollHandler}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}>
        {pagesComponent}
      </Animated.ScrollView>
    </BottomSheet>
  );
});

export { ScrollableBottomSheet };
