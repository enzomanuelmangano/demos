// Import necessary components from the '@shopify/react-native-skia' library
import { Group, LinearGradient, Rect, vec } from '@shopify/react-native-skia';

// Define the prop types for the FractalGlassMask component
type FractalGlassMaskProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  gradientsN: number;
};

// Define the FractalGlassMask component as a functional React component
export const FractalGlassMask: React.FC<FractalGlassMaskProps> = ({
  x,
  y,
  width,
  height,
  gradientsN,
}) => {
  // Return a Group component that contains an array of Rect components with linear gradients
  return (
    <Group>
      {/* Map over the number of gradients to create rows of rectangles */}
      {new Array(gradientsN).fill(0).map((_, index) => {
        // Calculate the width and x-coordinate for each gradient rectangle
        const gradientWidth = width / gradientsN;
        const gradientX = x + gradientWidth * index;

        // Return an array of Rect components with linear gradients in each row
        return new Array(gradientsN).fill(0).map((__, j) => {
          // Calculate the height and y-coordinate for each gradient rectangle
          const gradientHeight = height / gradientsN;
          const gradientY = y + gradientHeight * j;

          // Return a Rect component with a linear gradient
          return (
            <Rect
              key={j}
              x={gradientX}
              y={gradientY}
              width={gradientWidth}
              height={gradientHeight}>
              {/* Apply a LinearGradient to the Rect component */}
              <LinearGradient
                colors={['white', 'rgba(0,0,0,0.45)']}
                start={vec(gradientX, gradientY)}
                end={vec(
                  gradientX + gradientWidth - 5,
                  gradientY + gradientHeight - 5,
                )}
              />
            </Rect>
          );
        });
      })}
    </Group>
  );
};
