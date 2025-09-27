import { type FC, memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

type CarouselItemProps = {
  item: {
    mainColor: string;
  } | null;
  index: number;
  translateX: SharedValue<number>;
  itemWidth: number;
  itemHeight: number;
  carouselWidth: number;
  maxRenderedItems: number;
  activeIndex: SharedValue<number>;
};

const CarouselItem: FC<CarouselItemProps> = memo(
  ({
    item,
    index,
    translateX,
    itemWidth,
    itemHeight,
    carouselWidth,
    maxRenderedItems,
    activeIndex,
  }) => {
    const rItemListStyle = useAnimatedStyle(() => {
      const position = index * itemWidth + translateX.value;
      const center = carouselWidth / 2;

      const distanceFromCenter = Math.abs(
        center - ((position + center + itemWidth / 2) % carouselWidth),
      );
      const maxDistance = carouselWidth / 2;
      const normalizedDistanceFromCenter = 1 - distanceFromCenter / maxDistance;

      const scale = interpolate(
        normalizedDistanceFromCenter,
        [0, 1],
        [2, 0.8],
        Extrapolation.CLAMP,
      );

      const initialActiveIndex = Math.floor(maxRenderedItems / 2);
      const preciseActiveIndex =
        initialActiveIndex +
        (-translateX.value + itemWidth / 2) /
          (carouselWidth / maxRenderedItems);

      // Update main activeIndex
      activeIndex.value = Math.floor(preciseActiveIndex);

      const rotateY = interpolate(
        preciseActiveIndex - index - 0.5,
        [-2, -1, 0, 1, 2],
        [-25, -20, 0, 20, 25],
      );
      return {
        transform: [
          {
            scale: scale,
          },
          { perspective: 500 },
          {
            rotateY: `${rotateY}deg`,
          },
        ],
      };
    }, []);

    const rZIndexStyle = useAnimatedStyle(() => {
      const position = index * itemWidth + translateX.value;
      const center = carouselWidth / 2;

      const distanceFromCenter = Math.abs(
        center - ((position + center + itemWidth / 2) % carouselWidth),
      );
      const maxDistance = carouselWidth / 2;
      const normalizedDistanceFromCenter = 1 - distanceFromCenter / maxDistance;

      const zIndex = interpolate(
        normalizedDistanceFromCenter,
        [0, 1],
        [1000, 0],
        Extrapolation.CLAMP,
      );

      return {
        zIndex: Math.floor(zIndex),
      };
    }, []);

    return (
      <Animated.View style={rZIndexStyle}>
        <Animated.View
          key={index}
          style={[
            {
              height: itemHeight,
              width: itemWidth,
            },
            rItemListStyle,
          ]}>
          <View
            style={[
              {
                flex: 1,
                borderRadius: 5,
                backgroundColor: item?.mainColor ?? 'transparent',
              },
              item?.mainColor ? styles.shadow : {},
            ]}
          />
        </Animated.View>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
});
export { CarouselItem };
