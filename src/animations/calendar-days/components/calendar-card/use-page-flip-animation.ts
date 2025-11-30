import {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  type AnimatedStyle,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { PAGE_SIZE } from './constants';

import type { ViewStyle } from 'react-native';

type UsePageFlipAnimationParams = {
  index: number;
  progress: SharedValue<number>;
  totalPages: number;
};

type UsePageFlipAnimationReturn = {
  pageFlipProgress: DerivedValue<number>;
  rFlipStyle: AnimatedStyle<ViewStyle>;
};

export const usePageFlipAnimation = ({
  index,
  progress,
  totalPages,
}: UsePageFlipAnimationParams): UsePageFlipAnimationReturn => {
  const pageFlipProgress = useDerivedValue<number>(() => {
    const currentPage = progress.value * totalPages;
    const targetFlip = currentPage > index ? 1 : 0;

    return withSpring(targetFlip, {
      duration: 1000,
      dampingRatio: 1,
    });
  }, [index, totalPages]);

  const rFlipStyle = useAnimatedStyle(() => {
    const pageProgress = pageFlipProgress.value;

    const zIndex =
      pageProgress < 0.5 ? totalPages - index : index + totalPages + 1;

    return {
      zIndex,
      transform: [
        { perspective: 600 },
        { translateY: -PAGE_SIZE / 2 },
        { rotateX: `${pageProgress * 180}deg` },
        { translateY: PAGE_SIZE / 2 },
      ],
    };
  });

  return {
    pageFlipProgress,
    rFlipStyle,
  };
};
