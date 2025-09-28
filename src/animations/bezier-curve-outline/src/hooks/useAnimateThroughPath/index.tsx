import { useCallback } from 'react';

import {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PathGeometry } from './utils/geometry';

import type { SkPath } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

type Point = {
  x: number;
  y: number;
};

const getPathPoints = (path: SkPath): Point[] => {
  'worklet';
  const points: Point[] = [];

  const geometry = new PathGeometry(path);
  const totalLength = geometry.getTotalLength();

  for (let i = 0; i < totalLength; i++) {
    const point = geometry.getPointAtLength(i);
    points.push({ x: point.x, y: point.y });
  }
  return points;
};

type UseAnimateThroughPathProps = {
  pathReference: SharedValue<SkPath>;
};

const withCustomTiming = (value: number) => {
  'worklet';
  return withTiming(value, {
    duration: 1000,
    easing: Easing.bezier(0.455, 0.03, 0.515, 0.955),
  });
};

export const useAnimateThroughPath = ({
  pathReference,
}: UseAnimateThroughPathProps) => {
  const progress = useSharedValue(0);
  const points = useSharedValue<Point[]>([]);
  const assignPathPoints = useCallback(() => {
    points.value = getPathPoints(pathReference.value);
  }, [points, pathReference]);

  useAnimatedReaction(
    () => pathReference.value,
    () => {
      scheduleOnRN(assignPathPoints);
    },
    [assignPathPoints],
  );

  const startAnimation = useCallback(() => {
    points.value = getPathPoints(pathReference.value);
    cancelAnimation(progress);
    progress.value = 0;
    progress.value = withCustomTiming(1);
  }, [points, progress, pathReference]);

  const reverseAnimation = useCallback(() => {
    cancelAnimation(progress);
    progress.value = withCustomTiming(0);
  }, [progress]);

  const cx = useDerivedValue(() => {
    if (points.value.length <= 1) return 0;
    const inputRange = points.value.map(
      (_, index) => index / points.value.length,
    );
    const pointsX = points.value.map(point => point.x);
    return interpolate(progress.value, inputRange, pointsX);
  }, [points]);

  const cy = useDerivedValue(() => {
    if (points.value.length <= 1) return 0;
    const inputRange = points.value.map(
      (_, index) => index / points.value.length,
    );
    const pointsY = points.value.map(point => point.y);
    return interpolate(progress.value, inputRange, pointsY);
  }, [points]);

  return { progress, startAnimation, cx, cy, reverseAnimation };
};
