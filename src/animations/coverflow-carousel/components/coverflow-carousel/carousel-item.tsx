import { StyleSheet } from 'react-native';

import { Image } from 'expo-image';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

type CarouselItemProps = {
  image: string;
  index: number;
  scrollOffset: SharedValue<number>;
  itemWidth: number;
};

export const CarouselItem: React.FC<CarouselItemProps> = ({
  image,
  scrollOffset,
  index,
  itemWidth,
}) => {
  // Define the range of input values for interpolation based on item index and width
  const inputRange = [
    (index - 3) * itemWidth, // Three items before the current item
    (index - 2) * itemWidth, // Two items before the current item
    (index - 1) * itemWidth, // One item before the current item
    index * itemWidth, // Current item
    (index + 1) * itemWidth, // One item after the current item
    (index + 2) * itemWidth, // Two items after the current item
    (index + 3) * itemWidth, // Three items after the current item
  ];

  // Define the animated style using useAnimatedStyle hook
  const rAnimatedImageStyle = useAnimatedStyle(() => {
    /**
     * Interpolates the scaleX value based on the scrollOffset and inputRange.
     *
     * interpolate function:
     * - The first argument is the animated value that drives the interpolation, scrollOffset.value in this case.
     * - The second argument is the input range, which specifies the points at which the output values should change.
     * - The third argument is the output range, which specifies the values that should correspond to the points in the input range.
     * - The optional fourth argument is the extrapolation type, which determines how values outside the input range are handled.
     *
     * Here, scaleX changes smoothly between different values to create a zoom effect for the carousel items:
     * - At (index - 3) * itemWidth, scaleX is 0.1 (the image is smallest here).
     * - As we move closer to the center item, scaleX increases, making the image larger.
     * - At index * itemWidth (the center item), scaleX is 1 (the image is at its largest).
     * - Beyond the center, scaleX decreases again, making the images smaller.
     */
    const scaleX = interpolate(
      scrollOffset.value,
      inputRange,
      [0.1, 0.125, 0.2, 1, 0.2, 0.125, 0.1],
      Extrapolation.CLAMP,
    );

    /**
     * Interpolates the scaleY value in a similar manner to scaleX.
     * This changes the vertical scale of the image as it moves through the carousel.
     */
    const scaleY = interpolate(
      scrollOffset.value,
      inputRange,
      [0.6, 0.8, 0.9, 1, 0.9, 0.8, 0.6],
    );

    /**
     * Interpolates the translateX value to move the images horizontally.
     * This shifts the images left and right as the carousel scrolls.
     */
    const translateX = interpolate(scrollOffset.value, inputRange, [
      -itemWidth * 1.9,
      -itemWidth / 0.93,
      -itemWidth / 3.3,
      0,
      itemWidth / 3.3,
      itemWidth / 0.93,
      itemWidth * 1.9,
    ]);

    /**
     * Interpolates the borderRadius value to change the border radius of the images.
     * The images have a smaller border radius when they are the center item.
     */
    const maxBorderRadius = 25;
    const borderRadius = interpolate(scrollOffset.value, inputRange, [
      maxBorderRadius,
      maxBorderRadius,
      maxBorderRadius,
      15,
      maxBorderRadius,
      maxBorderRadius,
      maxBorderRadius,
    ]);

    /**
     * Interpolates the opacity value to fade images in and out as they move through the carousel.
     * The opacity decreases as the images move further away from the center item.
     */
    const opacity = interpolate(
      scrollOffset.value,
      [
        (index - 3) * itemWidth - 100,
        ...inputRange,
        (index + 3) * itemWidth + 100,
      ],
      [0, 1, 1, 1, 1, 1, 1, 1, 0],
      Extrapolation.CLAMP,
    );

    const width = Math.round(itemWidth * scaleX);

    return {
      borderRadius: borderRadius,
      opacity,
      width: width,
      transform: [
        {
          translateX,
        },
        {
          scaleY,
        },
      ],
      borderCurve: 'continuous',
    };
  }, [inputRange]);

  /**
   * The interpolate function is crucial for creating smooth animations in React Native Reanimated.
   * It takes a value and maps it from one range of values (input range) to another range of values (output range).
   * This is particularly useful for creating fluid transitions and effects based on user interactions or other dynamic values.
   *
   * Extrapolation:
   * - By default, interpolate allows values outside the input range to be extrapolated.
   * - Extrapolation.CLAMP restricts the output values to stay within the specified output range, preventing values from going beyond the defined limits.
   */

  return (
    <Animated.View
      style={[
        {
          width: itemWidth,
        },
        styles.container,
      ]}>
      <Animated.View style={[rAnimatedImageStyle, styles.image]}>
        <Image
          source={{ uri: image }}
          style={{ width: itemWidth, aspectRatio: 4 / 3 }}
          contentFit="cover"
          cachePolicy={'memory-disk'}
        />
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
  },
  image: {
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
