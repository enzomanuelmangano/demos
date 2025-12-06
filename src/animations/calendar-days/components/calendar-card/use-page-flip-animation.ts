import { Platform, type ViewStyle } from 'react-native';

import {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  type AnimatedStyle,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { PAGE_SIZE } from './constants';

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
      duration: 1100,
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
        { perspective: Platform.OS === 'ios' ? 400 : 10000 },
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
