import { type FC, memo, useMemo } from 'react';

import {
  Canvas,
  Group,
  Path,
  rect,
  rrect,
  Skia,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

type GeometryButtonProps = {
  onPress?: () => void;
  circles: number;
  size: number;
  color?: string;
};

export const GeometryButton: FC<GeometryButtonProps> = memo(
  ({ circles = 50, size = 100, onPress, color = '#FFF' }) => {
    const isActive = useSharedValue(false);

    const tapGesture = Gesture.Tap()
      .maxDuration(20000)
      .onBegin(() => {
        isActive.value = true;
        scheduleOnRN(Haptics.impactAsync, Haptics.ImpactFeedbackStyle.Heavy);
      })
      .onTouchesUp(() => {
        if (onPress) scheduleOnRN(onPress);
      })
      .onFinalize(() => {
        isActive.value = false;
      });

    const progress = useDerivedValue(() => {
      return withTiming(isActive.value ? 1 : 0, {
        duration: 500,
      });
    });

    // Derived value for the stroke width based on progress
    const strokeWidth = useDerivedValue(() => {
      // Interpolate the stroke width based on the progress value
      // When progress is 0, stroke width is 3
      // When progress is 0.5, stroke width is 0.6
      // When progress is 1, stroke width is 0.2
      return interpolate(progress.value, [0, 0.5, 1], [3, 0.6, 0.2]);
    }, []);

    const radius = size / 2;

    // Derived value for animated circles path
    const animatedCircles = useDerivedValue(() => {
      // Create a new path using Skia
      const path = Skia.Path.Make();

      // Loop through the number of circles specified
      for (let i = 0; i < circles; i++) {
        // Create a new circle path using Skia
        const circle = Skia.Path.Make();

        // Calculate the rotation angle for each circle
        const rotation = (i * 2 * Math.PI) / circles;

        // Add a rounded rectangle to the circle path representing the circle
        // Why a rounded rectangle?
        // Because there's an interesting effect if you animate the radius as well!
        circle.addRRect(
          rrect(rect(-radius, -radius, size, size), radius, radius),
        );

        // Apply a transformation to the circle path to animate its position
        circle.transform(
          Skia.Matrix().translate(
            // Translate the circle along the x-axis based on the progress value and the cosine of the rotation angle
            radius * Math.cos(rotation) * progress.value,
            // Translate the circle along the y-axis based on the progress value and the sine of the rotation angle
            radius * Math.sin(rotation) * progress.value,
          ),
        );

        // Add the transformed circle path to the main path
        path.addPath(circle);
      }

      // Return the main path containing all the animated circles
      return path;
    }, [progress.value, size]);

    const canvasSize = size * 2;
    const baseStyle = useMemo(() => {
      return {
        height: canvasSize,
        width: canvasSize,
        borderRadius: size,
        borderCurve: 'continuous',
      };
    }, [canvasSize, size]);

    const center = useDerivedValue(() => {
      return [
        {
          translateX: canvasSize / 2,
        },
        {
          translateY: canvasSize / 2,
        },
        // Have fun with these transformations!
        // Increase the canvasSize = size * 10 (or whatever you like)
        // Hint: increase the amount of circles (e.g. 110)
        // {
        //   perspective: 100,
        // },
        // {
        //   rotateX: -(Math.PI / 3.5) * progress.value,
        // },
      ];
    }, [canvasSize]);

    const rCanvasStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            scale: withTiming(isActive.value ? 1 : 0.5),
          },
        ],
      };
    }, []);

    return (
      <GestureDetector gesture={tapGesture}>
        <Animated.View style={rCanvasStyle}>
          <Canvas style={baseStyle}>
            <Group transform={center}>
              <Path
                path={animatedCircles}
                style={'stroke'}
                strokeWidth={strokeWidth}
                color={color}
              />
            </Group>
          </Canvas>
        </Animated.View>
      </GestureDetector>
    );
  },
);
