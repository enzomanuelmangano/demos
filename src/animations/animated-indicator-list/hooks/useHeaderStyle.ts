import {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
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

const useHeaderStyle = ({
  contentOffsetY,
  headersLayoutX,
  headersLayoutY,
}: UseHeaderStyleParams) => {
  const rIndicatorStyle = useAnimatedStyle(() => {
    const headersData = headersLayoutX.get();

    // 'worklet' directives on the nested callbacks: the React Compiler
    // hoists them out of the animated style worklet, and without the
    // directive the hoisted function isn't workletized.
    const width = interpolate(
      contentOffsetY.get(),
      headersLayoutY.map(({ value }) => {
        'worklet';
        return value;
      }),
      headersData.map(({ value }) => {
        'worklet';
        return value?.width ?? 0;
      }),
      Extrapolation.CLAMP,
    );

    return {
      width: width,
      height: 3,
      backgroundColor: 'black',
    };
  }, [headersLayoutY]);

  const rHeaderListStyle = useAnimatedStyle(() => {
    const headersData = headersLayoutX.get();

    const translateX = interpolate(
      contentOffsetY.get(),
      headersLayoutY.map(({ value }) => {
        'worklet';
        return value;
      }),
      headersData.map(({ value }) => {
        'worklet';
        return value!.x;
      }),
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateX: -translateX }],
    };
  }, [headersLayoutY]);

  return {
    rIndicatorStyle,
    rHeaderListStyle,
  };
};

export { useHeaderStyle };
