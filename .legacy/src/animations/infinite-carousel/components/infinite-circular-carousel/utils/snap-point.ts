/**
 * @summary Selects a point where the animation should snap to based on the value of the gesture and its velocity.
 * @worklet Marks the function as a Reanimated worklet.
 */
export const snapPoint = (
  value: number,
  velocity: number,
  points: ReadonlyArray<number>,
): number => {
  'worklet';
  const point = value + 0.2 * velocity;
  const deltas = points.map(p => Math.abs(point - p));
  const minDelta = Math.min.apply(null, deltas);
  return points.filter(p => Math.abs(point - p) === minDelta)[0];
};
