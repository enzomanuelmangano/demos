import {
  Atlas,
  Fill,
  useRSXformBuffer,
  useRectBuffer,
  useTexture,
} from '@shopify/react-native-skia';
import React from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

// Define the props type for the AnimatedSquares component
type AnimatedSquaresProps = {
  width: number;
  height: number;
  progress: SharedValue<number>; // Reanimated shared value to animate the progress
  colors: Array<Float32Array>; // Array of colors to use for the squares
  horizontalSquaresAmount?: number; // Optional prop for the number of horizontal squares
};

// Define the AnimatedSquares functional component using React.memo for performance optimization
export const AnimatedSquares: React.FC<AnimatedSquaresProps> = React.memo(
  ({
    width,
    height,
    progress,
    colors: _colors,
    horizontalSquaresAmount = 50, // Default value for horizontal squares amount
  }) => {
    const HSquares = horizontalSquaresAmount; // Number of horizontal squares
    const SquareContainerSize = Math.floor(width / HSquares); // Size of each square container
    const SquareSize = SquareContainerSize - 2.5; // Actual size of each square
    const VSquares = Math.floor(height / SquareContainerSize); // Number of vertical squares
    const SquaresAmount = HSquares * VSquares; // Total number of squares

    // Calculate the maximum radius for the animation based on the diagonal of the canvas
    const maxRadius = Math.sqrt(width ** 2 + height ** 2) / 2;

    // Calculate the active radius for the animation based on the progress
    const activeRadius = useDerivedValue(() => {
      return progress.value * maxRadius;
    }, [maxRadius]);

    // Create a white texture to be used for the squares (covering full canvas like in grid-visualizer)
    const texture = useTexture(<Fill color={'white'} />, {
      width,
      height,
    });

    // Pre-generate colors array to avoid recreating in derived value
    const staticColors = React.useMemo(() => {
      return Array.from({ length: SquaresAmount }, () => {
        const rand = Math.floor(Math.random() * _colors.length);
        return _colors[rand];
      });
    }, [SquaresAmount, _colors]);

    // Pre-generate random values for deterministic behavior
    const randomValues = React.useMemo(() => {
      return Array.from({ length: SquaresAmount }, () => Math.random());
    }, [SquaresAmount]);

    // Create the transforms for each square based on its position and distance from the center
    const transforms = useRSXformBuffer(SquaresAmount, (val, i) => {
      'worklet';

      const tx = (i % HSquares) * SquareContainerSize; // X position of the square
      const ty = Math.floor(i / HSquares) * SquareContainerSize; // Y position of the square

      const distance = Math.sqrt(
        (tx - width / 2) ** 2 + (ty - height / 2) ** 2, // Distance from the center of the canvas
      );

      const scale = Math.max(0, 1.5 - distance / activeRadius.value); // Scale the square based on the distance

      // Use pre-generated random values for deterministic behavior
      const randomValue = randomValues[i] || 1;

      // Hide the square if the scale is above a certain threshold
      // The randomness is used to make the animation more interesting and less uniform
      // The trick is to maximize the probability of the square being hidden in the center
      // That's because the scale range in the center will be between [0.9, 1.4]
      if (scale >= 0.9 + randomValue * 0.5) {
        val.set(0, 0, 0, 0);
        return;
      }

      // Set the transform for the square
      val.set(scale, 0, tx, ty);
    });

    // Create the rectangle buffer for each square
    const sprites = useRectBuffer(SquaresAmount, (val, j) => {
      'worklet';

      const x = (j % HSquares) * SquareContainerSize; // X position of the square
      const y = Math.floor(j / HSquares) * SquareContainerSize; // Y position of the square
      val.setXYWH(x, y, SquareSize, SquareSize); // Set the rectangle properties
    });

    // Render the Atlas component with the texture, sprites, colors, and transforms
    return (
      <Atlas
        image={texture}
        sprites={sprites}
        colors={staticColors}
        transforms={transforms}
      />
    );
  },
);
