// Importing the necessary dependency
import { Skia } from '@shopify/react-native-skia';

// Type definition for the parameters of the function
type GetScaledPolygonPath = {
  values: number[];
  centerX: number;
  centerY: number;
  radius: number;
};

// The function calculates the angle step between each point
// on the polygon by dividing the full circle (2 * Math.PI)
// by the number of values in the values array.

// It then iterates over each value in the values array
// and calculates the coordinates of the corresponding point
// on the polygon using trigonometric functions (Math.sin and Math.cos).
// The pointX and pointY values are calculated
// by multiplying the radius by the scaling factor and
// adjusting the position based on the angle and center coordinates.

// Inside the iteration, the function checks
// if it's the first point (index === 0) and uses
// the moveTo method to move the path to that point.
//  For subsequent points, it uses the lineTo
// method to draw lines connecting the previous point
// to the current point.

// After the iteration, the function calls
// the close method to complete the polygon
// by connecting the last point to the first point.

// Finally, the function returns the created
// chartCanvas path, representing the scaled polygon path.

// Overall, the function provides a convenient
// way to generate a scaled polygon path for
// drawing shapes or visual elements in a graphical application.

// Function for calculating a scaled polygon path
const getScaledPolygonPath = ({
  values,
  centerX,
  centerY,
  radius,
}: GetScaledPolygonPath) => {
  'worklet';
  // Creating a Skia path for the chart canvas
  const chartCanvas = Skia.Path.Make();

  // Calculating the angle step between each point on the polygon
  const angleStep = (2 * Math.PI) / values.length;

  // Iterating over each value in the array
  values.forEach((value, index) => {
    // Calculating the angle for the current value
    const angle = index * angleStep;

    // Calculating the coordinates of the current point based on the center, angle, and radius
    const pointX = centerX + Math.sin(angle) * radius * value;
    const pointY = centerY - Math.cos(angle) * radius * value;

    // Checking if it's the first point to move the path, otherwise draw a line
    if (index === 0) {
      chartCanvas.moveTo(pointX, pointY);
    } else {
      chartCanvas.lineTo(pointX, pointY);
    }
  });

  // Closing the path to complete the polygon
  chartCanvas.close();

  // Returning the chart canvas path
  return chartCanvas;
};

// Exporting the function
export { getScaledPolygonPath };
