import { createRef, useCallback, useEffect, useMemo, useRef } from 'react';

import { useSharedValue } from 'react-native-reanimated';

import { IMAGES } from '../constants';

import type { SwipeableCardRefType } from '../components/Card';

const useSwipeControls = () => {
  const activeIndex = useSharedValue(0);

  const refs = useMemo(() => {
    const pendingRefs = [];
    for (let i = 0; i < IMAGES.length; i++) {
      pendingRefs.push(createRef<SwipeableCardRefType>());
    }
    return pendingRefs;
  }, []);

  const swipeRight = useCallback(() => {
    // check if current ref exists
    if (!refs[activeIndex.value]) {
      return;
    }
    refs[activeIndex.value].current?.swipeRight();
  }, [activeIndex.value, refs]);

  const swipeLeft = useCallback(() => {
    // check if current ref exists
    if (!refs[activeIndex.value]) {
      return;
    }
    refs[activeIndex.value].current?.swipeLeft();
  }, [activeIndex.value, refs]);

  const timeouts = useRef<NodeJS.Timeout[]>([]);

  const reset = useCallback(() => {
    // reset all cards in the opposite direction with a delay
    refs.forEach((ref, index) => {
      timeouts.current.push(
        setTimeout(() => {
          ref.current?.reset();
        }, index * 100),
      );
    });
  }, [refs]);

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-compiler/react-compiler
      // eslint-disable-next-line react-hooks/exhaustive-deps
      timeouts.current.forEach((timeout: NodeJS.Timeout) => {
        clearTimeout(timeout);
      });
    };
  }, []);

  return {
    activeIndex,
    refs,
    swipeRight,
    swipeLeft,
    reset,
  };
};

export { useSwipeControls };
