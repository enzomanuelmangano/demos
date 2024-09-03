/**
 * @summary Selects a point where the animation should snap to based on the value of the gesture and its velocity.
 * @worklet Marks the function as a Reanimated worklet.
 */
export const snapPoint = (
  value: number, // Current value of the gesture
  velocity: number, // Velocity of the gesture
  points: ReadonlyArray<number>, // Array of possible snap points
): number => {
  'worklet'; // Marks the function as a Reanimated worklet
  // Calculate a potential point based on the value and velocity
  const point = value + 0.2 * velocity;
  // Calculate the difference between the potential point and each snap point
  const deltas = points.map(p => Math.abs(point - p));
  // Find the minimum difference
  const minDelta = Math.min.apply(null, deltas);
  // Return the snap point closest to the potential point
  return points.filter(p => Math.abs(point - p) === minDelta)[0];
};
