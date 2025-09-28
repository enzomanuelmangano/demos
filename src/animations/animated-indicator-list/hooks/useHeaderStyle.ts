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
    const headersData = headersLayoutX.value;

    const width = interpolate(
      contentOffsetY.value,
      headersLayoutY.map(({ value }) => value),
      headersData.map(({ value }) => value?.width ?? 0),
      Extrapolation.CLAMP,
    );

    return {
      width: width,
      height: 3,
      backgroundColor: 'black',
    };
  }, [headersLayoutY]);

  const rHeaderListStyle = useAnimatedStyle(() => {
    const headersData = headersLayoutX.value;

    const translateX = interpolate(
      contentOffsetY.value,
      headersLayoutY.map(({ value }) => value),

      headersData.map(({ value }) => value!.x),
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
