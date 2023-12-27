// Importing the necessary dependencies and types
import type { SkiaValue } from '@shopify/react-native-skia';
import { Skia, useComputedValue } from '@shopify/react-native-skia';

// Defining the type for the parameters of the hook
type UsePolygonGridParams = {
  radius: SkiaValue<number>;
  centerX: SkiaValue<number>;
  centerY: SkiaValue<number>;
  n: number;
};

// Custom hook for creating a polygon grid
const usePolygonGrid = ({
  radius,
  centerX,
  centerY,
  n,
}: UsePolygonGridParams) => {
  // Calculating the connected lines from the center using the `useComputedValue` hook
  const internalConnectedLinesFromCenter = useComputedValue(() => {
    // Creating an array of length `n` filled with the value `1`
    const externalPoints = new Array(n).fill(1) as 1[];

    // Calculating the angle step between each point on the polygon
    const angleStep = (2 * Math.PI) / n;

    // Creating a Skia path for the chart canvas
    const chartCanvas = Skia.Path.Make();

    // Iterating over each external point
    externalPoints.forEach((value, index) => {
      // Calculating the angle for the current point
      const angle = index * angleStep;

      // Calculating the coordinates of the current point based on the center, angle, and radius
      const pointX = centerX.current + Math.sin(angle) * radius.current * value;
      const pointY = centerY.current - Math.cos(angle) * radius.current * value;

      // Moving the path to the center point
      chartCanvas.moveTo(centerX.current, centerY.current);

      // Drawing a line from the center to the current point
      chartCanvas.lineTo(pointX, pointY);
    });

    // Closing the path to complete the polygon
    chartCanvas.close();

    // Returning the chart canvas path
    return chartCanvas;
  }, [centerX, centerY, radius, n]);

  // Returning the internal connected lines from the center
  return {
    internalConnectedLinesFromCenter,
  };
};

// Exporting the custom hook
export { usePolygonGrid };
