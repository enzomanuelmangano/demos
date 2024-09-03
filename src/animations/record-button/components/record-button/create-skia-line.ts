import { Skia } from '@shopify/react-native-skia';

// Function to create the path for the right side of the button

// My suggestion is to try to recreate this function alone without the borderRadius and internalPadding;
// then, try to add these two parameters to the function and see how the path changes.
// It's a bit tricky, but this is really helpful to play with custom paths in Skia.
export const getRightLinePath = ({
  strokeWidth,
  borderRadius,
  width,
  height,
}: {
  strokeWidth: number; // Width of the stroke for the path
  borderRadius: number; // Radius for the rounded corners
  width: number; // Width of the button
  height: number; // Height of the button
}) => {
  // Calculate the internal padding to account for the stroke width
  const internalPadding = strokeWidth / 2;
  // Calculate the actual width and height by removing the padding
  const realWidth = width - internalPadding * 2;
  const realHeight = height - internalPadding * 2;

  // Create a new Skia path
  const skPath = Skia.Path.Make();
  // Move to the starting point of the path (bottom center)
  skPath.moveTo(realWidth / 2, realHeight);
  // Draw a line to the bottom right corner, considering borderRadius
  skPath.lineTo(realWidth - borderRadius, realHeight);
  // Draw a rounded arc to the top right corner
  skPath.rArcTo(
    borderRadius, // Radius of the arc in x direction
    borderRadius, // Radius of the arc in y direction
    0, // Rotation angle of the arc
    true, // Large arc flag
    true, // Sweep flag
    borderRadius, // Horizontal distance to the end point of the arc
    -borderRadius, // Vertical distance to the end point of the arc
  );
  // Draw a line to the top right corner, considering the internal padding
  skPath.lineTo(realWidth, borderRadius + internalPadding);
  // Draw a rounded arc to the top center
  skPath.rArcTo(
    borderRadius, // Radius of the arc in x direction
    borderRadius, // Radius of the arc in y direction
    0, // Rotation angle of the arc
    true, // Large arc flag
    true, // Sweep flag
    -borderRadius, // Horizontal distance to the end point of the arc
    -borderRadius, // Vertical distance to the end point of the arc
  );
  // Draw a line back to the starting point (top center)
  skPath.lineTo(realWidth / 2, internalPadding);

  // Return the created path
  return skPath;
};
