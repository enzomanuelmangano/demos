import { useMemo } from 'react';

import {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

import type { LayoutRectangle } from 'react-native';

type UseHeaderStyleParams = {
  contentOffsetY: SharedValue<number>;
  headersLayoutX: Readonly<
    SharedValue<
      {
        header: string;
        value: LayoutRectangle | undefined;
      }[]
    >
  >;
  headersLayoutY: {
    header: string;
    value: number;
  }[];
};

// The indicator is laid out at this width once and scaled from its left edge:
// a plain 3px bar, so scaleX draws the same pixels as animating `width`
// without a layout pass per scroll frame.
const INDICATOR_BASE_WIDTH = 100;

const useHeaderStyle = ({
  contentOffsetY,
  headersLayoutX,
  headersLayoutY,
}: UseHeaderStyleParams) => {
  // Interpolation ranges only change when the layouts do, so they are built
  // here once instead of with four .map() calls per scroll frame.
  const inputRange = useMemo(
    () => headersLayoutY.map(({ value }) => value),
    [headersLayoutY],
  );

  // 'worklet' directives on the nested callbacks: the React Compiler
  // hoists them out of the worklet, and without the directive the hoisted
  // function isn't workletized.
  const headersWidth = useDerivedValue(() => {
    return headersLayoutX.get().map(({ value }) => {
      'worklet';
      return value?.width ?? 0;
    });
  });

  const headersX = useDerivedValue(() => {
    return headersLayoutX.get().map(({ value }) => {
      'worklet';
      return value!.x;
    });
  });

  const rIndicatorStyle = useAnimatedStyle(() => {
    const width = interpolate(
      contentOffsetY.get(),
      inputRange,
      headersWidth.get(),
      Extrapolation.CLAMP,
    );

    return {
      width: INDICATOR_BASE_WIDTH,
      height: 3,
      backgroundColor: 'black',
      transformOrigin: 'left',
      transform: [{ scaleX: width / INDICATOR_BASE_WIDTH }],
    };
  }, [inputRange]);

  const rHeaderListStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      contentOffsetY.get(),
      inputRange,
      headersX.get(),
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateX: -translateX }],
    };
  }, [inputRange]);

  return {
    rIndicatorStyle,
    rHeaderListStyle,
  };
};

export { useHeaderStyle };
