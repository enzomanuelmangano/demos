import { useCallback } from 'react';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Skia, usePathInterpolation } from '@shopify/react-native-skia';

import { DefaultEyebrowPaths, DefaultMouthPaths } from './constants';

// Enum to represent different animation types
enum AnimationType {
  Happy = 0,
  Normal = 1,
  Sad = 2,
}

// Convert SVG string paths to Skia Path objects for mouth
const outputRange = [
  DefaultMouthPaths.Happy,
  DefaultMouthPaths.Normal,
  DefaultMouthPaths.Sad,
].map(path => Skia.Path.MakeFromSVGString(path)!);

// Convert SVG string paths to Skia Path objects for eyebrows
const outputRangeEyebrow = [
  DefaultEyebrowPaths.Happy,
  DefaultEyebrowPaths.Normal,
  DefaultEyebrowPaths.Sad,
].map(path => Skia.Path.MakeFromSVGString(path)!);

export const useIconPaths = () => {
  // Shared value to track the current animation type
  const progress = useSharedValue(AnimationType.Normal);

  // Derived value to animate the progress with timing
  const animatedProgress = useDerivedValue(() => {
    return withTiming(progress.value);
  }, [progress]);

  // Interpolate the mouth path based on the animated progress
  const activeMouthPath = usePathInterpolation(
    animatedProgress,
    [AnimationType.Happy, AnimationType.Normal, AnimationType.Sad],
    outputRange,
  );

  // Interpolate the eyebrow path based on the progress
  const activeEyebrowPath = usePathInterpolation(
    progress,
    [AnimationType.Happy, AnimationType.Normal, AnimationType.Sad],
    outputRangeEyebrow,
  );

  // Callback to set the animation type to Happy
  const happy = useCallback(() => {
    progress.value = AnimationType.Happy;
  }, [progress]);

  // Callback to set the animation type to Sad
  const sad = useCallback(() => {
    progress.value = AnimationType.Sad;
  }, [progress]);

  // Callback to set the animation type to Normal
  const normal = useCallback(() => {
    progress.value = AnimationType.Normal;
  }, [progress]);

  return {
    mouthPath: activeMouthPath,
    eyebrowPath: activeEyebrowPath,
    happy,
    sad,
    normal,
  };
};
