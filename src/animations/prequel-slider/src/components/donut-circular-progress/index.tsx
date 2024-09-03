import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';

// Defining type for props
type DonutCircularProgressProps = {
  // The size of the circular progress component
  size: number;
  // Optional: The width of the progress stroke, defaults to 1
  strokeWidth?: number;
  // Optional: A shared value representing the color of the progress stroke
  color?: SharedValue<string>;
  // A shared value representing the progress value
  progress: SharedValue<number>;
  // Optional: The background color of the circular progress, defaults to 'rgba(255,255,255,0.25)'
  backgroundColor?: string;
};

// DonutCircularProgress component
export const DonutCircularProgress: React.FC<DonutCircularProgressProps> = ({
  size,
  strokeWidth = 1,
  color,
  backgroundColor = 'rgba(255,255,255,0.25)',
  progress,
}) => {
  // Calculating radius of the donut
  const radius = size / 2 - strokeWidth / 2;

  // Memoizing the path for the donut
  const path = useMemo(() => {
    const skPath = Skia.Path.Make();

    // Adding a circle path to represent the donut
    skPath.addCircle(size / 2, size / 2, radius);

    return skPath;
  }, [radius, size]);

  // Rendering the DonutCircularProgress component
  return (
    <Canvas
      style={{
        width: size,
        height: size,
      }}>
      {/* Grouping elements for transformation */}
      <Group
        origin={{
          x: size / 2,
          y: size / 2,
        }}
        transform={[
          {
            // Rotating the group by -90 degrees to start progress from top
            rotate: -Math.PI / 2,
          },
        ]}>
        {/* Rendering the background path */}
        <Path
          strokeCap={'round'}
          path={path}
          color={backgroundColor}
          style={'stroke'}
          strokeWidth={strokeWidth}
          start={0}
          end={1}
        />
        {/* Rendering the progress path */}
        <Path
          strokeCap={'round'}
          path={path}
          color={color ?? 'orange'}
          style={'stroke'}
          strokeWidth={strokeWidth}
          // Setting start to 0 and end to progress to show progress accordingly
          start={0}
          end={progress}
        />
      </Group>
    </Canvas>
  );
};
