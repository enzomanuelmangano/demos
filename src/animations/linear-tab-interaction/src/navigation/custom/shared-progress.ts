import {
  makeMutable,
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';

export const SharedTransitionProgress = makeMutable(0);

export const useSharedTransitionProgress = () => {
  const progress = useSharedValue(SharedTransitionProgress.value);

  // Weird behavior, sometimes the progress is set to 0 when it should be 1
  // and vice versa, this listener fixes it
  useAnimatedReaction(
    () => SharedTransitionProgress.value,
    (value, prevValue) => {
      if (!prevValue) return;
      if (value === 1 && prevValue < 0.9) {
        return;
      }
      if (value === 0 && prevValue > 0.1) {
        return;
      }
      progress.value = value;
    },
  );

  return progress;
};
