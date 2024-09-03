// I took this function from react-native-redash
// https://github.com/wcandillon/react-native-redash/blob/master/src/Physics.ts

/**
 * @summary Select a point where the animation should snap to given the value of the gesture and it's velocity.
 * @worklet
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
