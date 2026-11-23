import { useCallback } from 'react';

import {
  cancelAnimation,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Skia } from 'react-native-skia';

import type { SharedValue } from 'react-native-reanimated';
import type { SkPath } from 'react-native-skia';

type Point = {
  x: number;
  y: number;
};

// Runs on the UI thread, so the contour is walked directly: a class instance
// (the old PathGeometry helper) can't be used inside a worklet.
const getPathPoints = (path: SkPath): Point[] => {
  'worklet';
  const points: Point[] = [];

  const contour = Skia.ContourMeasureIter(path, false, 1).next();
  if (!contour) {
    // The initial path is empty until the outline reports its first curve.
    return points;
  }
  const totalLength = contour.length();

  for (let i = 0; i < totalLength; i++) {
    const [point] = contour.getPosTan(i);
    points.push({ x: point.x, y: point.y });
  }
  return points;
};

type UseAnimateThroughPathProps = {
  pathReference: SharedValue<SkPath>;
  // While true nothing reads the animated point (e.g. the square is fully
  // faded out), so the contour walk is deferred until it becomes false.
  isPathHidden?: SharedValue<boolean>;
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
  isPathHidden,
}: UseAnimateThroughPathProps) => {
  const progress = useSharedValue(0);
  const points = useSharedValue<Point[]>([]);

  // Walk the contour on the UI thread (no JS round trip per path change), and
  // only while the result can be seen: dragging the control points with the
  // square hidden no longer re-samples the whole path every frame.
  useAnimatedReaction(
    () => (isPathHidden?.get() ? null : pathReference.get()),
    (path, previousPath) => {
      if (path !== null && path !== previousPath) {
        points.set(getPathPoints(path));
      }
    },
    [],
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

  // Same result as interpolate(progress, [0, 1/len, ..., (len-1)/len], pts)
  // with the default (extend) extrapolation, but the input range is uniform so
  // the segment is found by index instead of rebuilding two arrays per frame.
  const cx = useDerivedValue(() => {
    const pts = points.get();
    const len = pts.length;
    if (len <= 1) return 0;
    const t = progress.get() * len;
    const i = Math.min(Math.max(Math.floor(t), 0), len - 2);
    return pts[i].x + (pts[i + 1].x - pts[i].x) * (t - i);
  }, [points]);

  const cy = useDerivedValue(() => {
    const pts = points.get();
    const len = pts.length;
    if (len <= 1) return 0;
    const t = progress.get() * len;
    const i = Math.min(Math.max(Math.floor(t), 0), len - 2);
    return pts[i].y + (pts[i + 1].y - pts[i].y) * (t - i);
  }, [points]);

  return { progress, startAnimation, cx, cy, reverseAnimation };
};
