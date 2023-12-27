// Importing the necessary dependencies and types
import { useComputedValue, useValue } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';

// Custom hook for calculating canvas layout
const useCanvasLayout = (canvasStyle: StyleProp<ViewStyle>) => {
  // Calculating the canvas size using the `useMemo` hook
  const canvasSize = useMemo(() => {
    // Flattening the canvas style object to extract the width and height
    const { width } = StyleSheet.flatten(canvasStyle);
    const { height } = StyleSheet.flatten(canvasStyle);

    // Checking if the extracted width and height are numbers
    const effectiveWidth = typeof width === 'number' && width;
    const effectiveHeight = typeof height === 'number' && height;

    // Determining the canvas size by prioritizing effectiveWidth, effectiveHeight, or defaulting to 0
    return (effectiveWidth ?? effectiveHeight ?? 0) as number;
  }, [canvasStyle]);

  // Creating a mutable value for the canvas size using the `useValue` hook
  const size = useValue({ width: canvasSize, height: canvasSize });

  // Calculating the center X coordinate of the canvas using the `useComputedValue` hook
  const centerX = useComputedValue(() => size.current.width / 2, [size]);

  // Calculating the center Y coordinate of the canvas using the `useComputedValue` hook
  const centerY = useComputedValue(() => size.current.height / 2, [size]);

  // Returning an object with the canvas size, center X, and center Y
  return {
    size,
    centerX,
    centerY,
  };
};

// Exporting the custom hook
export { useCanvasLayout };
