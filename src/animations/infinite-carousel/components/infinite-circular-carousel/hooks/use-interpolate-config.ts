import { useCallback, useMemo } from 'react';

import { Extrapolation } from 'react-native-reanimated';

type InterpolateConfig = {
  inputRange?: (index: number) => number[];
  outputRange?: (index: number) => number[];
  extrapolationType?: Extrapolation;
};

type UseInterpolateConfigParams = {
  listItemWidth: number;
  interpolateConfig?: InterpolateConfig;
};

export const useInterpolateConfig = ({
  listItemWidth,
  interpolateConfig,
}: UseInterpolateConfigParams) => {
  const inputRange = useCallback(
    (index: number) => {
      'worklet';
      return [
        (index - 1) * listItemWidth,
        index * listItemWidth,
        (index + 1) * listItemWidth,
      ];
    },
    [listItemWidth],
  );

  const outputRange = useCallback((_: number) => {
    'worklet';
    return [0, 1, 0];
  }, []);

  const interpolateConfigs = useMemo(
    () => ({
      inputRange: interpolateConfig?.inputRange ?? inputRange,
      outputRange: interpolateConfig?.outputRange ?? outputRange,
      extrapolationType:
        interpolateConfig?.extrapolationType ?? Extrapolation.CLAMP,
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
