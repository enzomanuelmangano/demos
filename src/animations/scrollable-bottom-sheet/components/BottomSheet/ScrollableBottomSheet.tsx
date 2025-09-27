import {
  forwardRef,
  type ReactNode,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BottomSheet } from './BottomSheet';

type BottomSheetProps = {
  pages: { height: number; component: ReactNode }[];
};

export type ScrollableBottomSheetRef = {
  scrollToY: (destination: number) => void;
  scrollToX: (destination: number) => void;
  isActive: () => boolean;
  close: () => void;
};

const ScrollableBottomSheet = forwardRef<
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

  const translateY = useSharedValue(pages?.[0]?.height ?? 0);

  const active = useSharedValue(false);

  const scrollViewRef = useRef<Animated.ScrollView>(null);

  const scrollToX = useCallback((destination: number, delay = 0) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: destination });
    }, delay);
  }, []);

  const scrollToY = useCallback((destination: number) => {
    'worklet';
    active.value = destination !== 0;

    if (destination === 0) {
      scheduleOnRN(scrollToX, 0, 500);
    }
    translateY.value = withSpring(destination, {
      damping: 25,
      stiffness: 180,
      mass: 0.9,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => {
    'worklet';
    return scrollToY(0);
  }, [scrollToY]);

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

  const { width: windowWidth } = useWindowDimensions();

  const pagesHeight = useMemo(() => {
    return pages.map(item => item.height);
  }, [pages]);

  const pagesComponent = useMemo(() => {
    return pages.map(item => item.component);
  }, [pages]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      if (!active.value) return;

      const interpolatedHeight = interpolate(
        event.contentOffset.x,
        pages.map((_, index) => index * windowWidth),
        pagesHeight,
        Extrapolation.CLAMP,
      );

      scrollToY(-interpolatedHeight);
    },
  });

  return (
    <BottomSheet translateY={translateY} active={active} scrollTo={scrollToY}>
      <Animated.ScrollView
        ref={scrollViewRef}
        scrollEventThrottle={16}
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
