import {
  runTiming,
  useComputedValue,
  useSharedValueEffect,
  useValue,
} from '@shopify/react-native-skia';
import Color from 'color';
import type Animated from 'react-native-reanimated';

// Defining a custom hook that takes a shared value for a color and returns an object with a computed Skia color
const useInterpolatedColor = (
  currentReanimatedColor: Animated.SharedValue<string>,
) => {
  // Creating Skia values for the red, green, and blue components of the color
  const skRadialBackgroundActiveRedColor = useValue(
    Color(currentReanimatedColor.value).red(),
  );
  const skRadialBackgroundActiveGreenColor = useValue(
    Color(currentReanimatedColor.value).green(),
  );
  const skRadialBackgroundActiveBlueColor = useValue(
    Color(currentReanimatedColor.value).blue(),
  );

  // Combining the Skia values for the red, green, and blue components into a computed Skia color
  // Note: When Expo SDK 49 is going to be released, we'll be able to use directly the Reanimated Value :)
  //       I'm going to update this code (and probably all the other released code demo on Patreon!)
  const skRadialBackgroundActiveColor = useComputedValue(() => {
    return `rgba(${skRadialBackgroundActiveRedColor.current}, ${skRadialBackgroundActiveGreenColor.current}, ${skRadialBackgroundActiveBlueColor.current}, 1)`;
  }, [
    skRadialBackgroundActiveRedColor,
    skRadialBackgroundActiveGreenColor,
    skRadialBackgroundActiveBlueColor,
  ]);

  // Running timing functions to interpolate the red, green, and blue values of the color
  useSharedValueEffect(() => {
    // We're going to interpolate R, G, B values separately
    // NOTE: I mean, I really don't know if this is brilliant or dumb :/
    const finalRed = Color(currentReanimatedColor.value).red();
    const finalGreen = Color(currentReanimatedColor.value).green();
    const finalBlue = Color(currentReanimatedColor.value).blue();
    runTiming(skRadialBackgroundActiveRedColor, finalRed);
    runTiming(skRadialBackgroundActiveGreenColor, finalGreen);
    runTiming(skRadialBackgroundActiveBlueColor, finalBlue);
  }, currentReanimatedColor);

  // Returning an object with the computed Skia color
  return {
    skiaColor: skRadialBackgroundActiveColor,
  };
};

// Exporting the custom hook
export { useInterpolatedColor };
