import { useCallback } from 'react';

import {
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
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

const withCustomSpring = (value: number) => {
  'worklet';
  return withSpring(value, {
    duration: 1500,
    dampingRatio: 1,
  });
};

export const useAnimateThroughPath = ({
  pathReference,
}: UseAnimateThroughPathProps) => {
  const progress = useSharedValue(0);
  const points = useSharedValue<Point[]>([]);
  const assignPathPoints = useCallback(() => {
    points.set(getPathPoints(pathReference.get()));
  }, [points, pathReference]);

  useAnimatedReaction(
    () => pathReference.get(),
    () => {
      scheduleOnRN(assignPathPoints);
    },
    [assignPathPoints],
  );

  const startAnimation = useCallback(() => {
    points.set(getPathPoints(pathReference.get()));
    cancelAnimation(progress);
    progress.set(0);
    progress.set(withCustomSpring(1));
  }, [points, progress, pathReference]);

  const reverseAnimation = useCallback(() => {
    cancelAnimation(progress);
    progress.set(withCustomSpring(0));
  }, [progress]);

  const cx = useDerivedValue(() => {
    if (points.get().length <= 1) return 0;
    const inputRange = points
      .get()
      .map((_, index) => index / points.get().length);
    const pointsX = points.get().map(point => point.x);
    return interpolate(progress.get(), inputRange, pointsX);
  }, [points]);

  const cy = useDerivedValue(() => {
    if (points.get().length <= 1) return 0;
    const inputRange = points
      .get()
      .map((_, index) => index / points.get().length);
    const pointsY = points.get().map(point => point.y);
    return interpolate(progress.get(), inputRange, pointsY);
  }, [points]);

  return { progress, startAnimation, cx, cy, reverseAnimation };
};
