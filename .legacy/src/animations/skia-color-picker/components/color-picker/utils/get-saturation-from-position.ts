/**
 * Calculates the saturation value based on the given point's position (dx, dy) relative to a circle's center
 * and the circle's radius.
 *
 * @param dx - The horizontal distance from the point to the circle's center.
 * @param dy - The vertical distance from the point to the circle's center.
 * @param radius - The radius of the circle.
 * @returns The calculated saturation value as a percentage.
 */
export const getSaturationFromPosition = (
  dx: number,
  dy: number,
  radius: number,
): number => {
  'worklet';
  // Calculate the Euclidean distance from the point to the circle's center.
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Calculate the saturation by squaring the ratio of the distance to the circle's radius
  // and then multiplying by 100 to get a percentage.
  return (distance / radius) ** 2 * 100;
};
