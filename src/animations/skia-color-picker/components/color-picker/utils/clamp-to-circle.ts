import type { Point } from '../types';

// Defining the type for the function parameters.
// It requires a point (with x, y coordinates), center coordinates of the circle (centerX, centerY), and the radius of the circle.
type CircleParams = {
  point: Point;
  centerX: number;
  centerY: number;
  radius: number;
};

// The clampToCircle function ensures that the given point is clamped within the circle defined by its center and radius.
export function clampToCircle({
  point,
  centerX,
  centerY,
  radius,
}: CircleParams): Point {
  'worklet';
  // Calculate the horizontal and vertical distances between the point and the circle's center.
  const dx = point.x - centerX;
  const dy = point.y - centerY;

  // Calculate the squared distance from the point to the center of the circle.
  const distanceSquared = dx * dx + dy * dy;

  // Calculate the squared radius of the circle for comparison.
  const radiusSquared = radius ** 2;

  // Start with the assumption that the point is within the circle.
  let { x, y } = point;

  // Check if the point is outside the circle by comparing the squared distances.
  if (distanceSquared > radiusSquared) {
    // If the point is outside, find the angle between the point and the circle's center.
    const angle = Math.atan2(dy, dx);
    // Adjust the x and y coordinates to lie on the circle's boundary in the same direction from the center.
    x = centerX + radius * Math.cos(angle);
    y = centerY + radius * Math.sin(angle);
  }

  // Return the adjusted point (either the original or the clamped one).
  return { x, y };
}
