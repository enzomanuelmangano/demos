import { useCallback, useMemo } from 'react';
import { Extrapolation } from 'react-native-reanimated';

// Define type for interpolation configuration
type InterpolateConfig = {
  inputRange?: (index: number) => number[]; // Function to generate input range based on index
  outputRange?: (index: number) => number[]; // Function to generate output range based on index
  extrapolationType?: Extrapolation; // Type of extrapolation for animation
};

// Define type for parameters of the hook
type UseInterpolateConfigParams = {
  listItemWidth: number; // Width of each list item
  interpolateConfig?: InterpolateConfig; // Configuration object for interpolation
};

// Custom hook for generating interpolation configuration
export const useInterpolateConfig = ({
  listItemWidth,
  interpolateConfig,
}: UseInterpolateConfigParams) => {
  const inputRange = useCallback(
    (index: number) => {
      'worklet';
      return [
        (index - 1) * listItemWidth, // Previous item's width
        index * listItemWidth, // Current item's width
        (index + 1) * listItemWidth, // Next item's width
      ];
    },
    [listItemWidth],
  );

  // Memoize callback function to define output range
  const outputRange = useCallback((_: number) => {
    'worklet';
    return [0, 1, 0]; // Default output range
  }, []);

  // Memoize interpolation configurations combining user-defined and default values
  const interpolateConfigs = useMemo(
    () => ({
      inputRange: interpolateConfig?.inputRange ?? inputRange, // Use provided input range or default
      outputRange: interpolateConfig?.outputRange ?? outputRange, // Use provided output range or default
      extrapolationType:
        interpolateConfig?.extrapolationType ?? Extrapolation.CLAMP, // Use provided extrapolation type or default (clamp)
    }),
    [
      inputRange,
      interpolateConfig?.extrapolationType,
      interpolateConfig?.inputRange,
      interpolateConfig?.outputRange,
      outputRange,
    ],
  );

  return interpolateConfigs;
};
