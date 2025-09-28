import { useMemo } from 'react';

import {
  Group,
  Path,
  RadialGradient,
  Skia,
  vec,
} from '@shopify/react-native-skia';

import type { AnimatedProp, SkPaint } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

// The Donut component creates a circular progress indicator using Skia.
// It renders a donut-shaped progress bar with customizable properties
// such as position, size, stroke width, and progress.
// The component uses a radial gradient for coloring and supports
// additional layering and child components.

type DonutProps = {
  cx: number; // X-coordinate of the circle's center
  cy: number; // Y-coordinate of the circle's center
  radius: number; // Radius of the circle
  strokeWidth: number; // Width of the donut's stroke
  progress: SharedValue<number>; // Animated value representing progress (0 to 1)
  layer?: AnimatedProp<React.ReactNode | React.ReactNode[] | SkPaint>;
  children?: React.ReactNode; // Optional child components
  initialAngleRad?: number; // Initial angle in radians (default: 0)
};

export const Donut: React.FC<DonutProps> = ({
  cx,
  cy,
  radius,
  strokeWidth,
  progress,
  layer,
  children,
  initialAngleRad = 0,
}) => {
  const circlePath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(cx, cy, radius);
    return path;
  }, [cx, cy, radius]);

  return (
    <Group>
      <Group
        layer={layer}
        transform={[
          {
            rotate: initialAngleRad,
          },
          {
            scale: -1,
          },
        ]}
        origin={{
          x: cx,
          y: cy,
        }}>
        <Path
          start={0}
          end={progress}
          path={circlePath}
          style={'stroke'}
          strokeWidth={strokeWidth}>
          <RadialGradient
            c={vec(cx, cy)}
            r={radius + strokeWidth}
            colors={['#dc3f69', '#f2384d']}
          />
        </Path>
      </Group>
      {children}
    </Group>
  );
};
