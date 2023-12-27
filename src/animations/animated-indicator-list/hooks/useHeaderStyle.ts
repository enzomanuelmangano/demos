import type { LayoutRectangle } from 'react-native';
import type Animated from 'react-native-reanimated';
import {
  Extrapolate,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

type UseHeaderStyleParams = {
  contentOffsetY: Animated.SharedValue<number>;
  headersLayoutX: Readonly<
    Animated.SharedValue<
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
      Extrapolate.CLAMP,
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      headersData.map(({ value }) => value!.x),
      Extrapolate.CLAMP,
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
