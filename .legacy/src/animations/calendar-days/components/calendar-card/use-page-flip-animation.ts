import { Platform, type ViewStyle } from 'react-native';

import {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
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
  rZIndexStyle: AnimatedStyle<ViewStyle>;
};

export const usePageFlipAnimation = ({
  index,
  progress,
  totalPages,
}: UsePageFlipAnimationParams): UsePageFlipAnimationReturn => {
  const pageFlipProgress = useSharedValue(
    progress.get() * totalPages > index ? 1 : 0,
  );

  // Same as re-deriving `withSpring(target)` on every progress change, minus
  // the pages already resting on their target: restarting a spring from
  // target to target moves nothing, but it woke all 30 pages (and their 5
  // styles each) on every pan event.
  useAnimatedReaction(
    () => progress.get(),
    () => {
      const currentPage = progress.get() * totalPages;
      const targetFlip = currentPage > index ? 1 : 0;
      if (pageFlipProgress.get() === targetFlip) return;

      pageFlipProgress.set(
        withSpring(targetFlip, {
          duration: 1100,
          dampingRatio: 1,
        }),
      );
    },
    [index, totalPages],
  );

  // zIndex has its own style: it only changes when crossing 0.5, while the
  // rotation changes every frame and would re-send it (a commit) each time.
  const rZIndexStyle = useAnimatedStyle(() => {
    const zIndex =
      pageFlipProgress.get() < 0.5
        ? totalPages - index
        : index + totalPages + 1;

    return { zIndex };
  });

  const rFlipStyle = useAnimatedStyle(() => {
    const pageProgress = pageFlipProgress.get();

    return {
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
    rZIndexStyle,
  };
};
